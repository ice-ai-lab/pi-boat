import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
  ExtensionUIContext,
} from '@earendil-works/pi-coding-agent';
import type {
  ExtensionUiRequest,
  ExtensionUiResponse,
  SessionPerf,
  SessionReplacedReason,
  WireAgentEvent,
} from '@ice-ai/protocol';
import { toWireAgentEventPayload, type WireAgentEventPayload } from '../events/wire-event';
import type { SdkAgentMessage } from '../events/wire-message';
import { ExtensionUiBridge, type ExtensionUiCloseReason } from './extension-ui-bridge';

/**
 * 会话注册表单元（docs/01 §3.1 AgentSessionService 的最小组成）。
 *
 * 为什么需要：SDK 的订阅与状态查询直接挂在 session 对象上，存在四个缺口——
 * runtime 替换后旧订阅指向死对象（§8-2）；事件流无序号，无法去重与差量重放；
 * 没有排队消息/进行中消息的快照查询（只有事件，无当前值）；
 * 扩展 UI 没有宿主实现（SDK 只给接口，RPC 模式那份是内联的、不可复用）。
 *
 * 相对 SDK 新增：
 * - **委托订阅**：订阅者挂 Entry 而非 SDK session，屏蔽 runtime 替换
 *   （fork/clone 时只换 `runtime.session` 并重订阅，订阅者不断线）
 * - seq 分配：会话级单调递增，SDK 事件与服务层事件共用同一计数器
 *   （Last-Event-ID 差量重放与快照去重的依据，docs/01 §5.4）；
 *   **runtime 替换不重置计数器**——重置会让客户端的「丢弃 seq ≤ lastSeq」失效
 * - 服务层自加事件：connected / session_shutdown / session_replaced /
 *   extension_ui_request / extension_ui_closed（docs/02 §5.1）
 * - isPromptRunning 双来源销账：`agent_settled`（模型跑完）+ `prompt()` 返回
 *   （调用生命周期）；只认事件会让不起 run 的扩展命令永久卡 true（2026-09-21）
 * - 流内状态跟踪：queue 快照、进行中的流式消息、扩展 UI 快照（statuses/widgets）、
 *   性能统计累加（rounds/steps/llmMs/toolMs → SessionPerf）
 * - 扩展 UI 桥（ADR-0012）：`uiContext` 供 `session.bindExtensions()` 使用
 */

export type WireAgentEventListener = (event: WireAgentEvent) => void;

export interface SessionRegistryEntryOptions {
  /** 扩展 UI 宿主兜底超时（毫秒）；测试调小 */
  uiTimeoutMs?: number;
  /**
   * 会话被替换后重新绑定扩展的回调（service 提供：它持有命令上下文动作）。
   * 由 `runtime.setRebindSession` 触发，也由构造时调用一次。
   */
  onRebind?: () => Promise<void>;
  /**
   * agent 跑完一轮（`agent_settled`）时的回调。
   * 推送投递侧（G2-13）挂在这里：**agent_settled 是"这一轮真的结束了"的唯一
   * 权威信号**（`message_end` 之后还可能有工具轮，`agent_end` 还会重试）。
   */
  onSettled?: () => void;
}

export class SessionRegistryEntry {
  /**
   * 被委托包装的 runtime；fork/clone/switch 由它执行原地替换（docs/01 §8-1）。
   * resource loader 级别的变化（chat-only、冷会话重建）换的是**整个 runtime**，
   * 走 `replaceRuntime()`——两种替换的差别见该类头注。
   */
  private _runtime: AgentSessionRuntime;

  /** 扩展 UI 桥（statuses/widgets 快照 + 未决请求登记） */
  readonly ui: ExtensionUiBridge;

  private seq = 0;
  private subscribers = new Set<WireAgentEventListener>();
  private unsubscribeSdk: (() => void) | null = null;
  private disposed = false;
  private readonly options: SessionRegistryEntryOptions;

  /** 最近一次 queue_update 快照（get_state.queuedMessages 数据源） */
  private queueSnapshot: { steering: string[]; followUp: string[] } = {
    steering: [],
    followUp: [],
  };
  /** 进行中的流式 assistant 消息（message_update 累积 partial；message_end 清空） */
  private streamingMessage: SdkAgentMessage | null = null;
  /**
   * 服务端有 prompt/steer/follow_up 调用尚未销账（get_state.isPromptRunning 数据源）。
   * 语义是「调用生命周期」而非「agent run 生命周期」：扩展命令只跑 handler、
   * 不起 run 也不发 agent_settled，只认事件会让本标记永久为 true。
   */
  private promptPending = false;

  // —— 性能统计累加（docs/02 §11.1）——
  private rounds = 0;
  private steps = 0;
  private llmMs = 0;
  private toolMs = 0;
  private outputTokens = 0;
  private turnStartedAt = 0;
  private readonly toolStartedAt = new Map<string, number>();

  constructor(runtime: AgentSessionRuntime, options: SessionRegistryEntryOptions = {}) {
    this._runtime = runtime;
    this.options = options;
    this.ui = new ExtensionUiBridge({
      emit: (request) => this.emitUiRequest(request),
      emitClosed: (id, reason) => this.emitUiClosed(id, reason),
      defaultTimeoutMs: options.uiTimeoutMs,
    });
    this.attachSdkSubscription();
  }

  // ------------------------------------------------------------------
  // 会话访问与 runtime 替换
  // ------------------------------------------------------------------

  /** ⚠️ 每次读取都要走 getter：fork/clone 或 runtime 重建后内部会话已换 */
  get runtime(): AgentSessionRuntime {
    return this._runtime;
  }

  /** ⚠️ 每次读取都要走 getter：fork/clone 之后 runtime 内部的会话已换 */
  get session(): AgentSession {
    return this.runtime.session;
  }

  get sessionId(): string {
    return this.session.sessionId;
  }

  /** 扩展 UI 上下文（`session.bindExtensions({uiContext})` 用） */
  get uiContext(): ExtensionUIContext {
    return this.ui.createContext();
  }

  /**
   * 换掉**整个 runtime**（同一会话文件、不同 resource loader / session 选项）。
   * 与 `rebind()` 的区别：那个是同一 runtime 内换了会话（fork）；这里是连 runtime
   * 都换掉（chat-only 的纯聊天边界、冷会话的 set_tools 重建）。会话 id 通常不变。
   */
  async replaceRuntime(runtime: AgentSessionRuntime): Promise<void> {
    if (this.disposed) {
      // 已销毁：新 runtime 不能收留（否则泄漏 SDK 会话与扩展）
      await runtime.dispose().catch(() => {});
      return;
    }
    const previous = this._runtime;
    this._runtime = runtime;
    await this.rebind();
    // 旧 runtime 的会话已不在任何订阅上，释放它（失败不影响新 runtime）
    await previous.dispose().catch(() => {});
  }

  /**
   * runtime 替换后的重新挂接：先重绑扩展（早订阅不漏事件），再换 SDK 订阅，
   * 并清掉指向旧会话的流内状态。顺序与 SDK RPC 模式的 rebindSession 一致。
   */
  async rebind(): Promise<void> {
    if (this.disposed) return;
    // 旧会话的扩展 UI 会话结束：未决对话框结清（客户端会收到 extension_ui_closed）
    this.ui.cancelAllPending();
    this.ui.clearStatusesAndWidgets();
    await this.options.onRebind?.();
    this.attachSdkSubscription();
    // 流内状态属于旧会话：半截消息、队列快照、未销账的 prompt 都不再成立
    this.streamingMessage = null;
    this.queueSnapshot = { steering: [], followUp: [] };
  }

  /**
   * 广播会话替换事件（fork/clone/navigate_tree/resume）。
   * 必须在 service **重新登记注册表键之后**调用——客户端收到它就该改用 newSessionId。
   */
  emitSessionReplaced(newSessionId: string, reason: SessionReplacedReason): void {
    if (this.disposed) return;
    this.emitEvent({ type: 'session_replaced', newSessionId, reason });
  }

  private attachSdkSubscription(): void {
    this.unsubscribeSdk?.();
    this.unsubscribeSdk = this.session.subscribe((event) => this.handleSdkEvent(event));
  }

  // ------------------------------------------------------------------
  // 订阅（委托）
  // ------------------------------------------------------------------

  subscribe(listener: WireAgentEventListener): () => void {
    this.assertLive();
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  // ------------------------------------------------------------------
  // 事件分发
  // ------------------------------------------------------------------

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  get lastSeq(): number {
    return this.seq;
  }

  private dispatch(event: WireAgentEvent): void {
    for (const listener of [...this.subscribers]) {
      try {
        listener(event);
      } catch {
        // 单个订阅者异常不得影响其他订阅者与 SDK 事件流
      }
    }
  }

  private handleSdkEvent(event: AgentSessionEvent): void {
    // 流内状态跟踪（投影前先看原始事件：message_update 的 partial 只在此处使用）
    if (event.type === 'queue_update') {
      this.queueSnapshot = { steering: [...event.steering], followUp: [...event.followUp] };
    } else if (event.type === 'message_update' && event.message.role === 'assistant') {
      this.streamingMessage = event.message;
    } else if (event.type === 'message_end') {
      this.streamingMessage = null;
    } else if (event.type === 'agent_settled') {
      // steer/follow_up 的销账依据（它们入队即返回，没有可等的 prompt() 调用）；
      // prompt 命令的主销账在 AgentSessionService，此处是幂等兜底
      this.promptPending = false;
      // 回调只在服务端注册过时触发；异常不得影响事件流
      try {
        this.options.onSettled?.();
      } catch (error) {
        console.error('[core] onSettled listener failed:', error);
      }
    }
    this.trackPerf(event);

    const wire = this.payloadWithSeq(event);
    if (wire === null) return; // 防御性丢弃：不消耗 seq
    this.dispatch(wire);
  }

  /**
   * 性能统计累加：LLM 耗时 = turn_start → turn_end；工具耗时 = start → end。
   * 只累加本进程见过的部分——冷会话没有这些数字（协议里 perf 也是可选的）。
   */
  private trackPerf(event: AgentSessionEvent): void {
    const now = Date.now();
    switch (event.type) {
      case 'agent_start':
        this.rounds += 1;
        break;
      case 'turn_start':
        this.steps += 1;
        this.turnStartedAt = now;
        break;
      case 'turn_end': {
        if (this.turnStartedAt !== 0) this.llmMs += now - this.turnStartedAt;
        this.turnStartedAt = 0;
        // 输出 token 从 turn_end 的 assistant 消息取（usage 已由 SDK 聚合）
        const message = event.message;
        if (message.role === 'assistant') this.outputTokens += message.usage.output;
        break;
      }
      case 'tool_execution_start':
        this.toolStartedAt.set(event.toolCallId, now);
        break;
      case 'tool_execution_end': {
        const startedAt = this.toolStartedAt.get(event.toolCallId);
        if (startedAt !== undefined) {
          this.toolMs += now - startedAt;
          this.toolStartedAt.delete(event.toolCallId);
        }
        break;
      }
      default:
        break;
    }
  }

  /** 先投影后分配 seq：防御性丢弃的事件不消耗序号 */
  private payloadWithSeq(event: AgentSessionEvent): WireAgentEvent | null {
    const payload = toWireAgentEventPayload(event);
    if (payload === null) return null;
    return { ...payload, seq: this.nextSeq() } as WireAgentEvent;
  }

  /** 服务层事件走同一 seq 计数器与分发通道 */
  emitEvent(event: WireAgentEventPayload): WireAgentEvent {
    this.assertLive();
    const wire = { ...event, seq: this.nextSeq() } as WireAgentEvent;
    this.dispatch(wire);
    return wire;
  }

  private emitUiRequest(request: ExtensionUiRequest): void {
    // 已销毁时静默丢弃：桥的 dialog() 在 disposed 后不会再发，但 fire-and-forget
    // 类 method 可能正好卡在 dispose 之后
    if (this.disposed) return;
    this.emitEvent({ type: 'extension_ui_request', request });
  }

  private emitUiClosed(id: string, reason: ExtensionUiCloseReason): void {
    if (this.disposed) return;
    this.emitEvent({ type: 'extension_ui_closed', id, reason });
  }

  /** 命令通道回填扩展 UI 应答（extension_ui_response） */
  respondToExtensionUi(response: ExtensionUiResponse): void {
    this.ui.respond(response);
  }

  // ------------------------------------------------------------------
  // prompt 生命周期标记
  // ------------------------------------------------------------------

  /** prompt/steer/follow_up 派发前调用 */
  markPromptDispatched(): void {
    this.promptPending = true;
  }

  /**
   * 清除挂起的 prompt 标记（与 markPromptDispatched 配对的销账）。
   * `prompt` 命令在 `await session.prompt()` 返回时**无条件**调用它：正常收尾、
   * 同步失败（派发即抛 / preflight 拒绝）、以及不起 agent run 的扩展命令都要走。
   * 后两者永远等不到 agent_settled，只靠事件销账 isPromptRunning 将永久为 true。
   */
  clearPromptPending(): void {
    this.promptPending = false;
  }

  // ------------------------------------------------------------------
  // 快照（late join / get_state 数据源）
  // ------------------------------------------------------------------

  get isStreaming(): boolean {
    return this.session.isStreaming;
  }

  get queuedMessages(): { steering: string[]; followUp: string[] } {
    return this.queueSnapshot;
  }

  get isPromptRunning(): boolean {
    return this.promptPending;
  }

  /** 进行中的半截消息（late join 时以新 seq 重放 message_start，§5.2 时序 ③） */
  get inFlightMessage(): SdkAgentMessage | null {
    return this.streamingMessage;
  }

  /** 本进程累加的性能统计（冷会话为本进程没跑过 ⇒ 全 0，协议里按可选处理） */
  get perf(): SessionPerf {
    const seconds = this.llmMs / 1000;
    return {
      rounds: this.rounds,
      steps: this.steps,
      llmMs: this.llmMs,
      toolMs: this.toolMs,
      tokensPerSecond: seconds > 0 ? Math.round((this.outputTokens / seconds) * 10) / 10 : 0,
    };
  }

  /** 本进程是否真的跑过 agent（决定 perf 是否随 get_session_stats 下发） */
  get hasPerf(): boolean {
    return this.rounds > 0 || this.steps > 0;
  }

  // ------------------------------------------------------------------
  // 销毁
  // ------------------------------------------------------------------

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** 广播 session_shutdown → 解绑订阅 → 释放扩展 UI → dispose runtime/会话 */
  dispose(reason: 'idle' | 'server_shutdown' | 'error' = 'server_shutdown'): void {
    if (this.disposed) return;
    // 未决的扩展对话框先结清（emitEvent 依赖 disposed=false，故放在最前）
    this.ui.dispose();
    this.disposed = true;
    const shutdown = { type: 'session_shutdown', reason, seq: this.nextSeq() } as WireAgentEvent;
    this.dispatch(shutdown);
    this.subscribers.clear();
    this.unsubscribeSdk?.();
    this.unsubscribeSdk = null;
    // runtime.dispose() 内部会 await；此处不 await（disposeSession 是同步契约），
    // 失败也不该阻塞关停路径（会话对象已不可用）
    void this._runtime.dispose().catch((error) => {
      console.error('[core] runtime dispose failed:', error);
    });
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new Error(`Session ${this.sessionId} already disposed`);
    }
  }
}
