import type {
  ExtensionUIContext,
  ExtensionUIDialogOptions,
  ExtensionWidgetOptions,
} from '@earendil-works/pi-coding-agent';
import type {
  ExtensionStatusItem,
  ExtensionUiRequest,
  ExtensionUiResponse,
  ExtensionWidgetItem,
  WidgetPlacement,
} from '@ice-ai/protocol';

/**
 * 扩展 UI 桥（ADR-0012）：把 SDK 的 `ExtensionUIContext` 接到本仓的
 * 事件通道（`extension_ui_request` 下行）+ 命令通道（`extension_ui_response` 上行）。
 *
 * 为什么需要：SDK 只定义接口，每个宿主必须自己实现一份——SDK 的 RPC 模式
 * （`modes/rpc/rpc-mode.js`）有一份内联实现但未导出成可复用函数，所以本仓自实现。
 *
 * 与 RPC 模式保持一致的三处语义：
 * - 只实现 RPC 面有的 9 个 method，`custom()` 直接返回 `undefined`
 *   （浏览器渲染不了 `pi-tui` 的 `Component` 工厂，RPC 模式同样不支持）
 * - `setWidget` 只接受**字符串数组**；工厂形态忽略
 * - 阻塞型请求的 `opts.timeout` 到期以**默认值**收尾（`undefined` / `false`），
 *   而不是 `cancelled`——扩展既然自己设了超时，就期望拿到默认值
 *
 * 本仓自补（SDK/RPC 都不兜，ADR-0012 决策）：
 * - **宿主默认超时**：`opts.timeout` 是扩展自己传的，不传就没有；`editor` 连字段都没有。
 *   没有这道兜底，一个不问 UI 的扩展能把 run 永久挂在 `await` 上。
 * - **dispose 清账**：会话终止/重绑时把全部未决请求以 `{cancelled:true}` 结清，
 *   否则会留下永不 resolve 的 Promise。
 * - **宿主主动收尾时通知客户端**（`extension_ui_closed`）：RPC 模式不必——TUI 与对话框
 *   同进程，自己就能撤下。Web 侧不行：不通知的话那个对话框会永远挂在屏幕上，
 *   用户再作答只会命中 `respond() === false`。
 */

/** 宿主默认超时：扩展没指定 timeout 时生效（ADR-0012） */
export const DEFAULT_UI_TIMEOUT_MS = 5 * 60_000;

/** 宿主主动关闭未决对话框的原因（`extension_ui_closed` 事件的载荷） */
export type ExtensionUiCloseReason = 'timeout' | 'shutdown';

export interface ExtensionUiBridgeOptions {
  /** 下行请求（由 SessionRegistryEntry 注入，走同一 seq 计数器） */
  emit: (request: ExtensionUiRequest) => void;
  /** 宿主主动关闭对话框的通知 */
  emitClosed: (id: string, reason: ExtensionUiCloseReason) => void;
  /** 宿主默认超时（毫秒）；测试可调小 */
  defaultTimeoutMs?: number;
}

interface PendingRequest {
  settle: (response: ExtensionUiResponse) => void;
}

export class ExtensionUiBridge {
  private readonly emit: (request: ExtensionUiRequest) => void;
  private readonly emitClosed: (id: string, reason: ExtensionUiCloseReason) => void;
  private readonly defaultTimeoutMs: number;
  private readonly pending = new Map<string, PendingRequest>();
  /** 状态栏项（按 key 覆盖；undefined 即删除） */
  private readonly statuses = new Map<string, string>();
  /** 挂件（按 key 覆盖） */
  private readonly widgets = new Map<string, { lines: string[]; placement?: WidgetPlacement }>();
  /** 宿主侧编辑器文本快照（`getEditorText` 的数据源，见 ADR-0012 的已知限制） */
  private editorText = '';
  private disposed = false;

  constructor(options: ExtensionUiBridgeOptions) {
    this.emit = options.emit;
    this.emitClosed = options.emitClosed;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_UI_TIMEOUT_MS;
  }

  // ------------------------------------------------------------------
  // 快照（AgentState.extensionStatuses / extensionWidgets）
  // ------------------------------------------------------------------

  get statusItems(): ExtensionStatusItem[] {
    return [...this.statuses].map(([statusKey, statusText]) => ({ statusKey, statusText }));
  }

  get widgetItems(): ExtensionWidgetItem[] {
    return [...this.widgets].map(([widgetKey, value]) => ({
      widgetKey,
      widgetLines: value.lines,
      widgetPlacement: value.placement,
    }));
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  // ------------------------------------------------------------------
  // 上行应答（命令通道 extension_ui_response）
  // ------------------------------------------------------------------

  /**
   * 回填一次应答。返回是否命中未决请求（false = 已超时/已关闭/未知 id，
   * 属正常竞态：客户端慢了一步，不该报错）。
   */
  respond(response: ExtensionUiResponse): boolean {
    const entry = this.pending.get(response.id);
    if (entry === undefined) return false;
    this.pending.delete(response.id);
    entry.settle(response);
    return true;
  }

  /**
   * 结清全部未决请求（会话终止 / 扩展重绑 / dispose）。
   * 一律以 `cancelled` 收尾：调用方应把它当成「用户没回答」继续走。
   */
  cancelAllPending(): void {
    for (const [id, entry] of [...this.pending]) {
      this.pending.delete(id);
      entry.settle({ id, cancelled: true });
      this.emitClosed(id, 'shutdown');
    }
  }

  /** 清空状态项与挂件（扩展重绑/reload 后旧扩展的残留必须撤下） */
  clearStatusesAndWidgets(): void {
    this.statuses.clear();
    this.widgets.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelAllPending();
    this.clearStatusesAndWidgets();
  }

  // ------------------------------------------------------------------
  // ExtensionUIContext 装配
  // ------------------------------------------------------------------

  createContext(): ExtensionUIContext {
    // 说明：`onTerminalInput` / `setWorking*` / `setFooter` / `setHeader` / `setEditorComponent`
    // / `addAutocompleteProvider` / `theme` 等成员的类型引用 pi-tui，而本仓不把 pi-tui
    // 拉进依赖图（ADR-0012），因此本对象在末尾整体 cast——行为与 RPC 模式逐条对齐。
    const context = {
      select: (title: string, options: string[], opts?: ExtensionUIDialogOptions) =>
        this.dialog({ method: 'select', title, options, timeout: opts?.timeout }, undefined, opts),

      confirm: (title: string, message: string, opts?: ExtensionUIDialogOptions) =>
        this.dialog({ method: 'confirm', title, message, timeout: opts?.timeout }, false, opts),

      input: (title: string, placeholder?: string, opts?: ExtensionUIDialogOptions) =>
        this.dialog(
          { method: 'input', title, placeholder, timeout: opts?.timeout },
          undefined,
          opts,
        ),

      editor: (title: string, prefill?: string) =>
        this.dialog({ method: 'editor', title, prefill }, undefined),

      notify: (message: string, type?: 'info' | 'warning' | 'error') => {
        this.emit({ id: this.nextId(), method: 'notify', message, notifyType: type });
      },

      setStatus: (key: string, text: string | undefined) => {
        if (text === undefined) this.statuses.delete(key);
        else this.statuses.set(key, text);
        this.emit({ id: this.nextId(), method: 'setStatus', statusKey: key, statusText: text });
      },

      // 工厂形态（function）按 RPC 模式忽略：浏览器拿不到 pi-tui 的 Component
      setWidget: (
        key: string,
        content: string[] | undefined | ((...args: never[]) => unknown),
        options?: ExtensionWidgetOptions,
      ) => {
        const lines = Array.isArray(content) ? content : undefined;
        // 工厂形态：不改状态也不发事件（发一个渲染不了的空挂件只会误导客户端）
        if (content !== undefined && lines === undefined) return;
        if (lines === undefined) this.widgets.delete(key);
        else this.widgets.set(key, { lines, placement: options?.placement });
        this.emit({
          id: this.nextId(),
          method: 'setWidget',
          widgetKey: key,
          widgetLines: lines,
          widgetPlacement: options?.placement,
        });
      },

      setTitle: (title: string) => {
        this.emit({ id: this.nextId(), method: 'setTitle', title });
      },

      setEditorText: (text: string) => {
        this.editorText = text;
        this.emit({ id: this.nextId(), method: 'set_editor_text', text });
      },

      pasteToEditor: (text: string) => {
        // 与 RPC 模式一致：无独立粘贴通道，退化为设置编辑器文本
        this.editorText = text;
        this.emit({ id: this.nextId(), method: 'set_editor_text', text });
      },

      // 宿主快照而非 ""（RPC 模式无法等 RPC 应答只能空返回；Web 侧有真实编辑器可做得更好）
      getEditorText: () => this.editorText,

      // —— 以下为 TUI 专属成员：逐个 no-op（与 RPC 模式逐条对齐）——
      onTerminalInput: () => () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setFooter: () => {},
      setHeader: () => {},
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: 'Theme switching is not supported by piboat' }),
      get theme() {
        return undefined;
      },

      /** 浏览器渲染不了 pi-tui 组件：与 RPC 模式一致直接返回 undefined（不挂起） */
      custom: async () => undefined,
    };

    return context as unknown as ExtensionUIContext;
  }

  // ------------------------------------------------------------------
  // 内部
  // ------------------------------------------------------------------

  private nextId(): string {
    return crypto.randomUUID();
  }

  /**
   * 阻塞型请求的公共路径。四种收尾：
   * 1. 客户端应答 → 解析出值（`cancelled` ⇒ 默认值）
   * 2. 扩展的 `opts.timeout` 到期 → **默认值**
   * 3. 宿主的兜底超时到期 → **默认值** + 通知客户端关闭对话框
   * 4. `opts.signal` abort / dispose → **默认值**（dispose 另发关闭通知）
   */
  private dialog(
    request:
      | { method: 'select'; title: string; options: string[]; timeout?: number }
      | { method: 'confirm'; title: string; message: string; timeout?: number }
      | { method: 'input'; title: string; placeholder?: string; timeout?: number }
      | { method: 'editor'; title: string; prefill?: string },
    defaultValue: undefined | false,
    opts?: ExtensionUIDialogOptions,
  ): Promise<string | boolean | undefined> {
    if (this.disposed) return Promise.resolve(defaultValue);

    const id = this.nextId();
    return new Promise<string | boolean | undefined>((resolve) => {
      let settled = false;
      let hostTimer: ReturnType<typeof setTimeout> | null = null;
      let extensionTimer: ReturnType<typeof setTimeout> | null = null;

      const onAbort = (): void => settle(defaultValue);
      const settle = (value: string | boolean | undefined): void => {
        if (settled) return;
        settled = true;
        if (hostTimer !== null) clearTimeout(hostTimer);
        if (extensionTimer !== null) clearTimeout(extensionTimer);
        opts?.signal?.removeEventListener('abort', onAbort);
        this.pending.delete(id);
        resolve(value);
      };

      hostTimer = setTimeout(() => {
        settle(defaultValue);
        this.emitClosed(id, 'timeout');
      }, this.defaultTimeoutMs);
      if (opts?.timeout !== undefined) {
        extensionTimer = setTimeout(() => settle(defaultValue), opts.timeout);
      }

      if (opts?.signal !== undefined) {
        if (opts.signal.aborted) {
          settle(defaultValue);
          return;
        }
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pending.set(id, {
        settle: (response) => {
          if ('cancelled' in response) settle(defaultValue);
          else if ('confirmed' in response) settle(response.confirmed);
          else settle(response.value);
        },
      });

      this.emit({ id, ...request } as ExtensionUiRequest);
    });
  }
}
