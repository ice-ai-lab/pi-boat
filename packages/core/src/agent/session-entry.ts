import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { WireAgentEvent } from '@ice-ai/protocol';
import { type WireAgentEventPayload, toWireAgentEventPayload } from '../events/to-wire-agent-event';
import type { SdkAgentMessage } from '../events/wire-message';

/**
 * 会话注册表单元（docs/01 §3.1 AgentSessionService 的最小组成）。
 *
 * 为什么需要：SDK 的订阅与状态查询直接挂在 session 对象上，存在三个缺口——
 * runtime 替换后旧订阅指向死对象（§8-2）；事件流无序号，无法去重与差量重放；
 * 没有排队消息/进行中消息的快照查询（只有事件，无当前值）。
 *
 * 相对 SDK 新增：
 * - 委托订阅：订阅者挂 Entry 而非 SDK session，屏蔽 runtime 替换
 *   （替换发生在 M2 fork，届时只需在 Entry 上换 session 引用并重绑）
 * - seq 分配：会话级单调递增，SDK 事件与服务层事件共用同一计数器
 *   （Last-Event-ID 差量重放与快照去重的依据，docs/01 §5.4）
 * - 服务层自加事件：connected / session_shutdown
 *   （docs/02 §5.1，SDK 事件流中不存在；prompt_done/prompt_error 已删，
 *   settle 依据 = SDK agent_settled，同步失败经 REST 信封回发送方，2026-09-20）
 * - 流内状态跟踪：queue 快照（get_state 用）、进行中的流式消息（late join 快照用）
 *
 * 提供：subscribe / emitServiceEvent（服务层事件入流）、prompt 生命周期
 * （markPromptDispatched / clearPromptPending / waitForSettle）、快照 getters
 * （lastSeq / isStreaming / queuedMessages / isPromptRunning / inFlightMessage）、
 * dispose（广播 shutdown → 解绑订阅 → 释放 SDK 会话）。
 */

export type WireAgentEventListener = (event: WireAgentEvent) => void;

export class SessionRegistryEntry {
  readonly sessionId: string;
  /** 被委托包装的 SDK 会话；runtime 替换（fork/switch，M2）时在 Entry 上换引用 */
  session: AgentSession;

  private seq = 0;
  private subscribers = new Set<WireAgentEventListener>();
  private unsubscribeSdk: () => void;
  private disposed = false;

  /** 最近一次 queue_update 快照（get_state.queuedMessages 数据源） */
  private queueSnapshot: { steering: string[]; followUp: string[] } = {
    steering: [],
    followUp: [],
  };
  /** 进行中的流式 assistant 消息（message_update 累积 partial；message_end 清空） */
  private streamingMessage: SdkAgentMessage | null = null;
  /** prompt 已派发、尚未 settle（get_state.isPromptRunning 数据源） */
  private promptPending = false;
  private settleWaiters: Array<() => void> = [];

  constructor(session: AgentSession) {
    this.session = session;
    this.sessionId = session.sessionId;
    this.unsubscribeSdk = session.subscribe((event) => this.handleSdkEvent(event));
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
      this.promptPending = false;
      const waiters = this.settleWaiters;
      this.settleWaiters = [];
      for (const w of waiters) w();
    }

    const wire = this.payloadWithSeq(event);
    if (wire === null) return; // 防御性丢弃：不消耗 seq
    this.dispatch(wire);
  }

  /** 先投影后分配 seq：防御性丢弃的事件不消耗序号 */
  private payloadWithSeq(event: AgentSessionEvent): WireAgentEvent | null {
    const payload = toWireAgentEventPayload(event);
    if (payload === null) return null;
    return { ...payload, seq: this.nextSeq() } as WireAgentEvent;
  }

  /** 服务层事件（connected / session_shutdown）走同一 seq 计数器与分发通道 */
  emitServiceEvent(event: WireAgentEventPayload): WireAgentEvent {
    this.assertLive();
    const wire = { ...event, seq: this.nextSeq() } as WireAgentEvent;
    this.dispatch(wire);
    return wire;
  }

  // ------------------------------------------------------------------
  // prompt 生命周期标记
  // ------------------------------------------------------------------

  /** prompt/steer/follow_up 派发前调用 */
  markPromptDispatched(): void {
    this.promptPending = true;
  }

  /**
   * 清除挂起的 prompt 标记（与 markPromptDispatched 配对的回滚）。
   * 用于同步失败（派发即抛 / preflight 拒绝）：此时 SDK 不会开跑，
   * 永远等不到 agent_settled 销账，不手动清除 isPromptRunning 将永久为 true。
   * 错误本身经 REST 信封回给发送方，本方法不发任何事件。
   */
  clearPromptPending(): void {
    this.promptPending = false;
  }

  /** 等待下一次 agent_settled（demo/测试用途） */
  waitForSettle(timeoutMs?: number): Promise<void> {
    if (!this.promptPending && !this.session.isStreaming) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        if (timer !== undefined) clearTimeout(timer);
        resolve();
      };
      const timer =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              this.settleWaiters = this.settleWaiters.filter((w) => w !== done);
              resolve();
            }, timeoutMs);
      this.settleWaiters.push(done);
    });
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

  // ------------------------------------------------------------------
  // 销毁
  // ------------------------------------------------------------------

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** 广播 session_shutdown → 解绑订阅 → dispose SDK 会话 */
  dispose(reason: 'idle' | 'server_shutdown' | 'error' = 'server_shutdown'): void {
    if (this.disposed) return;
    this.disposed = true;
    const shutdown = { type: 'session_shutdown', reason, seq: this.nextSeq() } as WireAgentEvent;
    this.dispatch(shutdown);
    this.subscribers.clear();
    this.unsubscribeSdk();
    this.session.dispose();
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new Error(`Session ${this.sessionId} already disposed`);
    }
  }
}
