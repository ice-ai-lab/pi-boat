import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { WireAgentEvent } from '@ice-ai/protocol';
import { describe, expect, it, vi } from 'vitest';
import { SessionRegistryEntry } from '../src/agent/session-entry';

/** 最小 AgentSession fake：只实现 Entry 用到的面 */
function fakeSession(id = 's1') {
  let listener: ((e: AgentSessionEvent) => void) | undefined;
  const session = {
    sessionId: id,
    isStreaming: false,
    subscribe(cb: (e: AgentSessionEvent) => void) {
      listener = cb;
      return () => {
        listener = undefined;
      };
    },
    dispose: vi.fn(),
  };
  return {
    session: session as unknown as AgentSession,
    emit: (event: AgentSessionEvent) => listener?.(event),
  };
}

describe('SessionRegistryEntry', () => {
  it('SDK 事件投影后分发且 seq 单调递增（turn_* 透传，2026-09-20 定案）', () => {
    const { session, emit } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const seen: WireAgentEvent[] = [];
    entry.subscribe((e) => seen.push(e));

    emit({ type: 'turn_start' });
    emit({ type: 'agent_start' });
    emit({ type: 'agent_settled' });
    emit({ type: 'turn_end', message: {} as never, toolResults: [] });
    emit({ type: 'bash_execution_update', delta: 'x' });

    expect(seen.map((e) => [e.type, e.seq])).toEqual([
      ['turn_start', 1],
      ['agent_start', 2],
      ['agent_settled', 3],
      ['turn_end', 4],
      ['bash_execution_update', 5],
    ]);
  });

  it('多播：多个订阅者收到同一事件；退订只影响自己', () => {
    const { session, emit } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const a: WireAgentEvent[] = [];
    const b: WireAgentEvent[] = [];
    const offA = entry.subscribe((e) => a.push(e));
    entry.subscribe((e) => b.push(e));

    emit({ type: 'agent_start' });
    offA();
    emit({ type: 'agent_settled' });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
  });

  it('订阅者抛错不影响其他订阅者', () => {
    const { session, emit } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const b: WireAgentEvent[] = [];
    entry.subscribe(() => {
      throw new Error('boom');
    });
    entry.subscribe((e) => b.push(e));
    expect(() => emit({ type: 'agent_start' })).not.toThrow();
    expect(b).toHaveLength(1);
  });

  it('queue_update 跟踪为快照（queuedMessages 数据源）', () => {
    const { session, emit } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    emit({ type: 'queue_update', steering: ['s1'], followUp: ['f1'] });
    expect(entry.queuedMessages).toEqual({ steering: ['s1'], followUp: ['f1'] });
  });

  it('进行中的流式消息：message_update 记录 / message_end 清空（late join 快照源）', () => {
    const { session, emit } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const partial = { role: 'assistant', content: [{ type: 'text', text: '半截' }] } as never;
    emit({
      type: 'message_update',
      message: partial,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'x' } as never,
    });
    expect(entry.inFlightMessage).toBe(partial);
    emit({ type: 'message_end', message: partial });
    expect(entry.inFlightMessage).toBeNull();
  });

  it('prompt 生命周期：agent_settled 销账（steer/follow_up 的销账依据，prompt 命令的幂等兜底）', () => {
    const { session, emit } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const seen: WireAgentEvent[] = [];
    entry.subscribe((e) => seen.push(e));

    entry.markPromptDispatched();
    expect(entry.isPromptRunning).toBe(true);
    emit({ type: 'agent_settled' });

    expect(entry.isPromptRunning).toBe(false);
    expect(seen.map((e) => `${e.type}:${e.seq}`)).toEqual(['agent_settled:1']);
  });

  it('clearPromptPending：清除标记（错误经 REST 信封回发送方，不发事件）', () => {
    const { session } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const seen: WireAgentEvent[] = [];
    entry.subscribe((e) => seen.push(e));
    entry.markPromptDispatched();
    entry.clearPromptPending();
    expect(entry.isPromptRunning).toBe(false);
    expect(seen).toEqual([]);
  });

  it('emitEvent 与 SDK 事件共用 seq 计数器', () => {
    const { session, emit } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const seen: WireAgentEvent[] = [];
    entry.subscribe((e) => seen.push(e));

    emit({ type: 'agent_start' }); // seq 1
    entry.emitEvent({ type: 'connected', sessionId: 's1', isStreaming: false }); // seq 2
    emit({ type: 'agent_settled' }); // seq 3

    expect(seen.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('dispose：广播 session_shutdown → 清订阅 → dispose SDK；之后再订阅报错', () => {
    const { session } = fakeSession();
    const entry = new SessionRegistryEntry(session);
    const seen: WireAgentEvent[] = [];
    entry.subscribe((e) => seen.push(e));

    entry.dispose('idle');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'session_shutdown', reason: 'idle' });
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(entry.subscriberCount).toBe(0);
    expect(entry.isDisposed).toBe(true);
    expect(() => entry.subscribe(() => {})).toThrow(/disposed/);
    // 幂等
    entry.dispose();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });
});
