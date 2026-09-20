import { describe, expect, it } from 'vitest';
import {
  WIRE_AGENT_EVENT_TYPES,
  type WireAgentEvent,
  WireAgentEventSchema,
} from '../src/index';

const seq = 7;

describe('events/wire-agent-event', () => {
  it('parses service-layer connected event', () => {
    const event = { type: 'connected', seq, sessionId: 's1', isStreaming: false };
    expect(WireAgentEventSchema.parse(event)).toEqual(event);
  });

  it('parses message_update with toolcall_start carrying id/toolName', () => {
    const event = {
      type: 'message_update',
      seq,
      usage: {
        input: 1,
        output: 2,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 3,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        id: 'tc_1',
        toolName: 'read',
      },
    };
    const parsed = WireAgentEventSchema.parse(event) as Extract<
      WireAgentEvent,
      { type: 'message_update' }
    >;
    expect(parsed.assistantMessageEvent).toMatchObject({ id: 'tc_1', toolName: 'read' });
  });

  it('rejects toolcall_start missing id/toolName', () => {
    const event = {
      type: 'message_update',
      seq,
      usage: {
        input: 1,
        output: 2,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 3,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      assistantMessageEvent: { type: 'toolcall_start', contentIndex: 0 },
    };
    expect(() => WireAgentEventSchema.parse(event)).toThrow();
  });

  it('parses compaction_end with compaction result', () => {
    const event = {
      type: 'compaction_end',
      seq,
      reason: 'threshold',
      result: { summary: 's', firstKeptEntryId: 'e1', tokensBefore: 100 },
      aborted: false,
      willRetry: false,
    };
    expect(WireAgentEventSchema.parse(event)).toEqual(event);
  });

  it('parses entry_appended with a session entry payload', () => {
    const event = {
      type: 'entry_appended',
      seq,
      entry: {
        type: 'thinking_level_change',
        id: 'e1',
        parentId: null,
        timestamp: 't',
        thinkingLevel: 'max',
      },
    };
    expect(WireAgentEventSchema.parse(event)).toEqual(event);
  });

  it('parses session_info_changed with omitted name (clear semantics)', () => {
    const event = { type: 'session_info_changed', seq };
    const parsed = WireAgentEventSchema.parse(event) as Extract<
      WireAgentEvent,
      { type: 'session_info_changed' }
    >;
    expect(parsed.name).toBeUndefined();
  });

  it('rejects removed notice/error top-level events (docs/02 §5.1 勘误)', () => {
    expect(() => WireAgentEventSchema.parse({ type: 'notice', seq })).toThrow();
    expect(() => WireAgentEventSchema.parse({ type: 'error', seq, message: 'x' })).toThrow();
    expect(() => WireAgentEventSchema.parse({ type: 'auto_compaction_start', seq })).toThrow();
  });

  it('parses turn_start/turn_end (passed through, aligned with SDK)', () => {
    expect(WireAgentEventSchema.parse({ type: 'turn_start', seq })).toEqual({
      type: 'turn_start',
      seq,
    });
    // turn_end 必须携带 message + toolResults
    expect(() => WireAgentEventSchema.parse({ type: 'turn_end', seq })).toThrow();
  });

  it('requires seq on every event', () => {
    expect(() => WireAgentEventSchema.parse({ type: 'agent_start' })).toThrow();
  });

  it('parses a minimal sample of every event type (shape regression)', () => {
    const usage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const userMessage = { role: 'user', content: 'hi', timestamp: 1 };
    const assistantSample = {
      role: 'assistant',
      content: [],
      api: 'a',
      provider: 'p',
      model: 'm',
      usage,
      stopReason: 'stop',
      timestamp: 1,
    };
    const minimal: Record<string, unknown> = {
      agent_start: {},
      message_start: { message: userMessage },
      message_update: {
        usage,
        assistantMessageEvent: { type: 'start' },
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
      summarization_retry_scheduled: {
        attempt: 1,
        maxAttempts: 3,
        delayMs: 1000,
        errorMessage: 'e',
      },
      summarization_retry_attempt_start: { source: 'compaction', reason: 'manual' },
      summarization_retry_finished: {},
      entry_appended: {
        entry: { type: 'session_info', id: 'e1', parentId: null, timestamp: 't' },
      },
      session_info_changed: {},
      thinking_level_changed: { level: 'high' },
      bash_execution_update: { delta: 'out' },
      connected: { sessionId: 's1', isStreaming: false },
      session_shutdown: {},
      turn_start: {},
      turn_end: { message: assistantSample, toolResults: [] },
    };
    // 每个已声明事件类型都有最小样例且可解析（防新增类型漏样例/漏字段）
    for (const type of WIRE_AGENT_EVENT_TYPES) {
      const sample = minimal[type];
      if (sample === undefined) throw new Error(`missing minimal sample for ${type}`);
      const parsed = WireAgentEventSchema.parse({ type, seq, ...sample });
      expect(parsed).toMatchObject({ type, seq });
    }
    // 反向：样例表不存在未声明类型
    expect(Object.keys(minimal).sort()).toEqual([...WIRE_AGENT_EVENT_TYPES].sort());
    // 25 种：SDK 透传 23 + 服务层自加 2（2026-09-20 删 startup_error/prompt_done/prompt_error/extension 三事件）
    expect(WIRE_AGENT_EVENT_TYPES).toHaveLength(25);
  });
});
