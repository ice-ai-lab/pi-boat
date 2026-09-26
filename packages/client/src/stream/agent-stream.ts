import type { WireAgentEvent } from '@ice-ai/protocol';
import { AgentEventConnection } from './agent-event-connection';
import { fold } from './fold';
import { type ChatState, emptyChatState, type Turn } from './view-model';

/** 就绪等待上限：连接上不来时兜底（见 AgentStream.waitUntilReady） */
const READY_WAIT_TIMEOUT_MS = 2_000;

/**
 * AgentStream（docs/05 §5/§7）：会话级事件流 store——持 fold 状态、做 seq 对账、
 * 供 React 用 useSyncExternalStore 订阅。框架无关（不 import React）。
 *
 * seq 规则（docs/05 §5.2）：`connected.lastSeq` 与 REST 快照都是水位线，
 * 丢弃 seq ≤ lastSeq 的事件（幂等重扫）。
 */
export class AgentStream {
  private state: ChatState = emptyChatState();
  private listeners = new Set<() => void>();
  private connection: AgentEventConnection | null = null;
  private watermark = 0;
  private restored = false;
  /** 事件流就绪（收到 `connected` 帧）——派发命令前的门禁，见 waitUntilReady */
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  /** 版本号：getSnapshot 引用稳定性靠整体替换保证，此字段供诊断 */
  readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /** 是否已经过 REST 重建（区分「全新空流」与「open() 预置的历史态」） */
  get isRestored(): boolean {
    return this.restored;
  }

  /** REST 重建（首屏历史 / 重连整体重建）：整体替换状态并重置水位线 */
  restore(state: ChatState, watermark: number): void {
    this.state = state;
    this.watermark = watermark;
    this.restored = true;
    this.emit();
  }

  /**
   * 向上翻页：把更早的轮次**前插**（docs/02 §6.3）。不动水位线——
   * 历史是 REST 事实，与实时 seq 无关。
   */
  prependTurns(turns: Turn[]): void {
    if (turns.length === 0) return;
    this.state = { ...this.state, turns: [...turns, ...this.state.turns] };
    this.emit();
  }

  /** 应用一个 wire 事件（seq 对账后 fold） */
  applyEvent(event: WireAgentEvent): void {
    // 就绪判定放在水位线之前：`connected` 帧证明「订阅已生效」，与 seq 对账无关
    if (event.type === 'connected') this.markReady();
    if (event.seq <= this.watermark) return;
    if (event.type === 'connected') {
      // 重连快照水位线：此前已通过 REST 重建对齐
      this.watermark = event.lastSeq;
      return;
    }
    this.watermark = event.seq;
    this.state = fold(this.state, event);
    this.emit();
  }

  /**
   * 等事件流就绪（`connected` 帧）。**派发命令前必须等**：
   *
   * 服务端在 prompt 被接受的那一刻就发出这条 user 消息的 `message_start`，它同时是
   * 客户端 fold 的「轮锚点」（`fold.ts` 的 message_start(user) 建 Turn）。订晚了只能
   * 拿到半截 assistant 快照，整轮消息在界面上什么都不显示——看起来就像「发出去了但没成功」
   * （2026-09-26：空态首条消息即在 resume 后立即派发，正好落在订阅之前）。
   *
   * 上限兜底：连接确实上不来时（server 挂了）不能把用户的发送动作钉死——超时就照常
   * 派发，退化成旧行为（拿不到回显，但错误会照常上抛）。
   */
  async waitUntilReady(timeoutMs = READY_WAIT_TIMEOUT_MS): Promise<void> {
    if (this.ready) return;
    await Promise.race([
      new Promise<void>((resolve) => this.readyWaiters.push(resolve)),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  private markReady(): void {
    if (this.ready) return;
    this.ready = true;
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private markNotReady(): void {
    this.ready = false;
  }

  connect(): void {
    this.disconnect();
    this.connection = new AgentEventConnection({
      sessionId: this.sessionId,
      onEvent: (event) => this.applyEvent(event),
      onStatus: (status) => {
        // 断线后重新就绪要等下一次 connected：断线期间发出的命令会漏掉自己的回显
        if (status === 'closed') this.markNotReady();
      },
      onTerminal: () => {
        // shutdown/replaced 的状态标记由 fold 完成（session_shutdown 事件）
      },
    });
    this.connection.start();
  }

  disconnect(): void {
    this.markNotReady();
    this.connection?.stop();
    this.connection = null;
  }

  getSnapshot(): ChatState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** 会话级单例注册表（同一会话多组件共享一个流；HMR/重挂载不重建） */
const streams = new Map<string, AgentStream>();

export function getAgentStream(sessionId: string): AgentStream {
  const existing = streams.get(sessionId);
  if (existing !== undefined) return existing;
  const stream = new AgentStream(sessionId);
  streams.set(sessionId, stream);
  return stream;
}

export function disposeAgentStream(sessionId: string): void {
  const stream = streams.get(sessionId);
  stream?.disconnect();
  streams.delete(sessionId);
}
