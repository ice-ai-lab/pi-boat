import type { AgentState, ImageContent, WireAgentEvent } from '@ice-ai/protocol';
import { agentEventsUrl, getRunningState, sendCommand } from '../endpoints/agent';
import { type ApiClient, createApiClient } from '../http';
import { AgentEventSource, type EventSourceFactory } from './event-source';
import { type ChatView, createChatView, foldEvent } from './fold';

/**
 * AgentStream（docs/05 §5/§7）：事件流的唯一持有者——`subscribe` + `getSnapshot`
 * 配 React 的 `useSyncExternalStore`；**不走 TanStack Query**（append-only 流 + seq 去重
 * 表达不了「请求—缓存」模型，ADR-0009 理由 1）。
 *
 * M1 的降级与边界（docs/04 §5.5）：server 忽略 Last-Event-ID，重连 = connected + 快照 + 增量，
 * 所以**重连时清空事件派生态**（`createChatView()`）并通知宿主重取 REST 历史（onReconnect），
 * 由 `mergeTurns` 把历史与新的增量拼回一条时间线。
 *
 * 命令通道与事件通道分离：send 走 REST（同会话服务端 FIFO 串行），事件走 SSE。
 */

export interface AgentStreamOptions {
  sessionId: string;
  client?: ApiClient;
  /** 注入点（测试 fake；默认全局 EventSource） */
  eventSourceFactory?: EventSourceFactory;
  /** 折叠耗时用的时钟（测试确定性） */
  now?: () => number;
  /** 每轮跑完自动轻查一次状态（关掉可省一次请求；测试默认关） */
  refreshStateOnSettle?: boolean;
}

export type AgentStreamListener = () => void;

export class AgentStream {
  readonly sessionId: string;
  private readonly client: ApiClient;
  private readonly eventSourceFactory: EventSourceFactory | undefined;
  private readonly now: () => number;
  private readonly refreshOnSettle: boolean;

  private view: ChatView = createChatView();
  private listeners = new Set<AgentStreamListener>();
  private reconnectListeners = new Set<AgentStreamListener>();
  private source: AgentEventSource | null = null;
  /** 建流次数：>0 之后的 connected 即「重连」（docs/05 §5.3） */
  private connections = 0;
  private fatalError: unknown = null;

  constructor(options: AgentStreamOptions) {
    this.sessionId = options.sessionId;
    this.client = options.client ?? createApiClient();
    this.eventSourceFactory = options.eventSourceFactory;
    this.now = options.now ?? Date.now;
    this.refreshOnSettle = options.refreshStateOnSettle ?? true;
  }

  // ------------------------------------------------------------------
  // 订阅（useSyncExternalStore 契约）
  // ------------------------------------------------------------------

  subscribe = (listener: AgentStreamListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ChatView => this.view;

  /** 重连（整体重建）时通知宿主重取 REST 历史（docs/05 §5.3） */
  onReconnect = (listener: AgentStreamListener): (() => void) => {
    this.reconnectListeners.add(listener);
    return () => {
      this.reconnectListeners.delete(listener);
    };
  };

  get fatal(): unknown {
    return this.fatalError;
  }

  // ------------------------------------------------------------------
  // 生命周期
  // ------------------------------------------------------------------

  /** 幂等：重复调用不重建连接（React StrictMode 双执行安全） */
  start(): void {
    if (this.source !== null) return;
    const source = new AgentEventSource({
      url: agentEventsUrl(this.client, this.sessionId),
      onEvent: (event) => this.pushEvent(event),
      onOpen: () => this.handleOpen(),
      onInvalidFrame: () => {
        this.view = { ...this.view, invalidFrames: this.view.invalidFrames + 1 };
        this.emit();
      },
      onFatal: (error) => {
        this.fatalError = error;
        // 首连就失败 ≠ 断线：**冷会话**（不在运行时注册表，server 对 SSE 回 404）是正常状态，
        // 宿主用 REST 历史渲染只读视图并自行说明「未在运行」（docs/01 §5.3）。只有已经
        // 连上过再失败才是真的断线。混为一谈会在侧栏点开历史会话时弹出误导性错误。
        if (this.connections > 0) {
          this.view = { ...this.view, notice: '事件流已断开（重连失败，请检查 agent server）' };
        }
        this.emit();
      },
      onShutdown: () => undefined, // session_shutdown 事件本身已进 fold（notice + 停流）
      ...(this.eventSourceFactory === undefined ? {} : { factory: this.eventSourceFactory }),
    });
    this.source = source;
    source.connect();
  }

  stop(): void {
    this.source?.close();
    this.source = null;
  }

  // ------------------------------------------------------------------
  // 事件 → 视图
  // ------------------------------------------------------------------

  /**
   * 注入一个 wire 事件（自定义传输的入口）。SSE 路径由 AgentEventSource 调用；
   * 将来换 WebSocket / Electron IPC 时，传输层只需把帧交到这里（docs/01 §5.5、§9-3）。
   */
  pushEvent(event: WireAgentEvent): void {
    // seq 去重（docs/05 §5.2）：水位线由 foldEvent 随每个已应用帧推进
    if (event.seq <= this.view.lastSeq && event.type !== 'connected') return;
    this.view = foldEvent(this.view, event, this.now);
    this.emit();
    if (event.type === 'agent_settled' && this.refreshOnSettle) {
      void this.refreshState().catch(() => undefined);
    }
  }

  private handleOpen(): void {
    const isReconnect = this.connections > 0;
    this.connections += 1;
    if (isReconnect) {
      // M1 降级：不做差量，清空事件派生态，交由宿主用 REST 历史重建（docs/04 §5.5）
      this.view = createChatView();
      this.emit();
      for (const listener of this.reconnectListeners) listener();
    }
  }

  // ------------------------------------------------------------------
  // REST：轻查与命令
  // ------------------------------------------------------------------

  /** GET /api/agent/:id —— 轻查（不进命令 FIFO），把状态并进视图 */
  async refreshState(): Promise<ChatView> {
    const running = await getRunningState(this.client, this.sessionId);
    if (!running.running) {
      this.view = { ...this.view, state: null };
      this.emit();
      return this.view;
    }
    this.view = mergeState(this.view, running.state);
    this.emit();
    return this.view;
  }

  /** 发消息：空闲时 prompt；流式中转 steer（SDK 语义，docs/01 §5.2.3） */
  async send(text: string, images?: ImageContent[]): Promise<void> {
    const message = text.trim();
    if (message === '' && (images === undefined || images.length === 0)) return;
    if (this.view.running) {
      await sendCommand(this.client, this.sessionId, {
        type: 'steer',
        message,
        ...(images === undefined ? {} : { images }),
      });
      return;
    }
    await sendCommand(this.client, this.sessionId, {
      type: 'prompt',
      message,
      ...(images === undefined ? {} : { images }),
    });
  }

  async followUp(text: string, images?: ImageContent[]): Promise<void> {
    const message = text.trim();
    if (message === '') return;
    await sendCommand(this.client, this.sessionId, {
      type: 'follow_up',
      message,
      ...(images === undefined ? {} : { images }),
    });
  }

  async abort(): Promise<void> {
    await sendCommand(this.client, this.sessionId, { type: 'abort' });
  }

  async clearQueue(): Promise<void> {
    await sendCommand(this.client, this.sessionId, { type: 'clear_queue' });
    this.view = { ...this.view, queue: { steering: [], followUp: [] } };
    this.emit();
  }

  // ------------------------------------------------------------------
  // 通知
  // ------------------------------------------------------------------

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function mergeState(view: ChatView, state: AgentState): ChatView {
  return {
    ...view,
    state,
    running: state.isStreaming || state.isPromptRunning,
    queue: { ...state.queuedMessages },
    thinkingLevel: state.thinkingLevel,
  };
}
