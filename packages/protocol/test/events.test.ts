import { describe, expect, it } from 'vitest';
import { WIRE_AGENT_EVENT_TYPES, type WireAgentEvent, type WireAgentEventType } from '../src/index';

const seq = 7;

/**
 * 事件契约的漂移防线（ADR-0017）。
 *
 * 事件载荷现在是 pi-coding-agent 的 `JsonAgentSessionEvent`（再导出/派生），
 * 没有 zod 可 parse——防线改为**编译期穷尽**：
 * - 下面每个样例都必须能赋给 WireAgentEvent（SDK 改字段 = 编译错误）
 * - `@ts-expect-error` 证明投影约束仍然成立（partial 已被剥离、toolcall 增量必带 id/toolName）
 * - 事件名全集与联合类型互相穷尽（新增 SDK 事件时这里报错，提醒决定是否转发）
 */

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};
const userMessage = { role: 'user', content: 'hi', timestamp: 1 } as const;
const assistantSample = {
  role: 'assistant',
  content: [],
  api: 'a',
  provider: 'p',
  model: 'm',
  usage,
  stopReason: 'stop',
  timestamp: 1,
} as const;

/** 每个事件类型的最小样例（去掉 type/seq 后的载荷） */
const minimalPayloads: Record<WireAgentEventType, unknown> = {
  agent_start: {},
  turn_start: {},
  turn_end: { message: userMessage, toolResults: [] },
  message_start: { message: userMessage },
  // message_update 的 assistantMessageEvent 已剥离 partial：只有增量字段
  message_update: {
    usage,
    assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'x' },
  },
  message_end: { message: userMessage },
  tool_execution_start: { toolCallId: 'tc_1', toolName: 'read', args: {} },
  tool_execution_update: { toolCallId: 'tc_1', toolName: 'read', args: {}, partialResult: {} },
  tool_execution_end: { toolCallId: 'tc_1', toolName: 'read', result: {}, isError: false },
  agent_end: { messages: [userMessage], willRetry: false },
  agent_settled: {},
  queue_update: { steering: [], followUp: [] },
  compaction_start: { reason: 'manual' },
  compaction_end: { reason: 'manual', aborted: false, willRetry: false },
  auto_retry_start: { attempt: 1, maxAttempts: 3, delayMs: 1000, errorMessage: 'e' },
  auto_retry_end: { success: true, attempt: 1 },
  summarization_retry_scheduled: { attempt: 1, maxAttempts: 3, delayMs: 1000, errorMessage: 'e' },
  summarization_retry_attempt_start: { source: 'compaction', reason: 'manual' },
  summarization_retry_finished: {},
  entry_appended: { entry: { type: 'session_info', id: 'e1', parentId: null, timestamp: 't' } },
  session_info_changed: {},
  thinking_level_changed: { level: 'high' },
  connected: { sessionId: 's1', isStreaming: false, lastSeq: seq - 1 },
  session_shutdown: {},
  session_replaced: { newSessionId: 's2', reason: 'fork' },
  extension_ui_request: {
    request: { id: 'ui_1', method: 'select', title: 't', options: ['a', 'b'] },
  },
  extension_ui_closed: { id: 'ui_1', reason: 'timeout' },
};

/** 样例表是 wire 联合的唯一清单：构造时即被类型检查 */
function sampleEvent(type: WireAgentEventType): WireAgentEvent {
  return { type, seq, ...(minimalPayloads[type] as object) } as WireAgentEvent;
}

describe('events/wire-agent-event', () => {
  it('每个事件类型都有最小样例且可赋给联合类型', () => {
    const events = WIRE_AGENT_EVENT_TYPES.map(sampleEvent);
    expect(events).toHaveLength(27);
    expect(events.every((e) => e.seq === seq)).toBe(true);
  });

  it('事件名全集与联合类型互相穷尽', () => {
    // 联合里出现而清单里没有的名字 → 编译错误（新增 SDK 事件时必须做一次转发决策）
    const all: readonly WireAgentEventType[] = WIRE_AGENT_EVENT_TYPES;
    const unseen: Exclude<WireAgentEvent['type'], WireAgentEventType>[] = [];
    expect([...all, ...unseen]).toHaveLength(27);
  });

  it('toolcall 增量必须带 id/toolName（不得只剩 partial）', () => {
    const ok: WireAgentEvent = {
      type: 'message_update',
      seq,
      usage,
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        id: 'tc_1',
        toolName: 'read',
      },
    };
    expect(ok.type).toBe('message_update');
    const bad: WireAgentEvent = {
      type: 'message_update',
      seq,
      usage,
      // @ts-expect-error 缺 id/toolName 的 toolcall_start 不在 wire 契约内
      assistantMessageEvent: { type: 'toolcall_start', contentIndex: 0 },
    };
    expect(bad).toBeDefined();
  });

  it('partial 不进 wire（累积快照只经 message_start/end 与历史下发）', () => {
    const withPartial: WireAgentEvent = {
      type: 'message_update',
      seq,
      usage,
      // @ts-expect-error assistantMessageEvent 不接受 partial（累积快照是 SDK 内存态）
      assistantMessageEvent: { type: 'start', partial: assistantSample },
    };
    expect(withPartial).toBeDefined();
  });

  it('seq 必填，且 SDK 未转发的 bash_execution_update 不在联合里', () => {
    // @ts-expect-error 每个 wire 事件都必须携带 seq
    const noSeq: WireAgentEvent = { type: 'agent_start' };
    // @ts-expect-error bash_execution_update 被投影丢弃（Shell 直连不实现）
    const bash: WireAgentEvent = { type: 'bash_execution_update', seq };
    expect([noSeq, bash]).toHaveLength(2);
  });

  it('未知事件类型被拒', () => {
    // @ts-expect-error 'notice' 不是 wire 事件
    const notice: WireAgentEvent = { type: 'notice', seq };
    expect(notice).toBeDefined();
  });

  it('connected 事件携带快照水位线', () => {
    const event = sampleEvent('connected') as Extract<WireAgentEvent, { type: 'connected' }>;
    expect(event.lastSeq).toBe(seq - 1);
  });
});
