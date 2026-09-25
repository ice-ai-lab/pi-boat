import type { WireAgentEvent } from '@ice-ai/protocol';
import { AgentEventConnection } from './agent-event-connection';
import { fold } from './fold';
import { type ChatState, emptyChatState, type Turn } from './view-model';

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

  connect(): void {
    this.disconnect();
    this.connection = new AgentEventConnection({
      sessionId: this.sessionId,
      onEvent: (event) => this.applyEvent(event),
      onTerminal: () => {
        // shutdown/replaced 的状态标记由 fold 完成（session_shutdown 事件）
      },
    });
    this.connection.start();
  }

  disconnect(): void {
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
