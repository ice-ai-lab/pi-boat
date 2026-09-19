import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ClientAgentEvent } from '@ice-ai/protocol';
import { projectAgentSessionEvent } from '../events/to-client-agent-event';
import type { SdkAgentMessage } from '../events/wire-message';

/**
 * 会话注册表单元（docs/01 §3.1 AgentSessionService 的最小组成）。
 *
 * 职责：
 * - 委托订阅：订阅者挂在 Entry 上而非 SDK session 上，屏蔽 runtime 替换
 *   （§8-2：new/fork/switch 后旧 subscribe 指向死对象——替换发生在 M2 fork，
 *   届时只需在 Entry 上换 session 引用并重绑）
 * - seq 分配：会话级单调递增，SDK 事件与服务层事件共用同一计数器
 * - 流内状态跟踪：queue 快照（get_state 用）、进行中的流式消息（late join 快照用）
 * - prompt 生命周期：派发时标记，agent_settled 时补发 prompt_done
 *   （docs/02 §5.1 服务层自加事件）
 */

export type ClientAgentEventListener = (event: ClientAgentEvent) => void;

/** 分配律 Omit（直接 Omit<Union, K> 会塌缩成公共键，丢失判别信息） */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * 服务层自加事件与快照事件（seq 之外的载荷部分）。
 * 覆盖 docs/02 §5.1 服务层自加行 + late join 快照的 message_start。
 */
export type WireEventInput = DistributiveOmit<ClientAgentEvent, 'seq'>;

export class SessionRegistryEntry {
  readonly sessionId: string;
  /** 被委托包装的 SDK 会话；runtime 替换（fork/switch，M2）时在 Entry 上换引用 */
  session: AgentSession;

  private seq = 0;
  private subscribers = new Set<ClientAgentEventListener>();
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

  subscribe(listener: ClientAgentEventListener): () => void {
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

  private dispatch(event: ClientAgentEvent): void {
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
    let hadPrompt = false;
    if (event.type === 'queue_update') {
      this.queueSnapshot = { steering: [...event.steering], followUp: [...event.followUp] };
    } else if (event.type === 'message_update' && event.message.role === 'assistant') {
      this.streamingMessage = event.message;
    } else if (event.type === 'message_end') {
      this.streamingMessage = null;
    } else if (event.type === 'agent_settled') {
      hadPrompt = this.promptPending;
      this.promptPending = false;
      const waiters = this.settleWaiters;
      this.settleWaiters = [];
      for (const w of waiters) w();
    }

    const wire = this.projectWithSeq(event);
    if (wire === null) return; // turn_* 已剔除（不消耗 seq）
    this.dispatch(wire);

    // 本轮 prompt 至此完全静止：补发 prompt_done（docs/02 §5.1）
    if (hadPrompt) {
      this.emitServiceEvent({ type: 'prompt_done' });
    }
  }

  /** 先投影后分配 seq：被剔除的事件不消耗序号 */
  private projectWithSeq(event: AgentSessionEvent): ClientAgentEvent | null {
    const projected = projectAgentSessionEvent(event);
    if (projected === null) return null;
    return { ...projected, seq: this.nextSeq() } as ClientAgentEvent;
  }

  /** 服务层事件（connected / prompt_done / …）走同一 seq 计数器与分发通道 */
  emitServiceEvent(event: WireEventInput): ClientAgentEvent {
    this.assertLive();
    const wire = { ...event, seq: this.nextSeq() } as ClientAgentEvent;
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

  /** prompt 同步失败（派发即抛）时清除标记并广播 prompt_error */
  failPrompt(errorMessage: string): void {
    this.promptPending = false;
    this.emitServiceEvent({ type: 'prompt_error', errorMessage });
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
    const shutdown = { type: 'session_shutdown', reason, seq: this.nextSeq() } as ClientAgentEvent;
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
