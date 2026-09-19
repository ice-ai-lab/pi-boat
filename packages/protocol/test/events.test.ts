import { describe, expect, it } from 'vitest';
import {
  CLIENT_AGENT_EVENT_TYPES,
  type ClientAgentEvent,
  ClientAgentEventSchema,
} from '../src/index';

const seq = 7;

describe('events/client-agent-event', () => {
  it('parses service-layer connected event', () => {
    const event = { type: 'connected', seq, sessionId: 's1', isStreaming: false };
    expect(ClientAgentEventSchema.parse(event)).toEqual(event);
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
    const parsed = ClientAgentEventSchema.parse(event) as Extract<
      ClientAgentEvent,
      { type: 'message_update' }
    >;
    expect(parsed.assistantMessageEvent).toMatchObject({ id: 'tc_1', toolName: 'read' });
  });

  it('rejects toolcall_start missing the projected id/toolName', () => {
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
    expect(() => ClientAgentEventSchema.parse(event)).toThrow();
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
    expect(ClientAgentEventSchema.parse(event)).toEqual(event);
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
    expect(ClientAgentEventSchema.parse(event)).toEqual(event);
  });

  it('parses extension_ui_request with a blocking select', () => {
    const event = {
      type: 'extension_ui_request',
      seq,
      request: { method: 'select', id: 'ui_1', title: 'pick one', options: ['a', 'b'] },
    };
    expect(ClientAgentEventSchema.parse(event)).toEqual(event);
  });

  it('parses session_info_changed with omitted name (clear semantics)', () => {
    const event = { type: 'session_info_changed', seq };
    const parsed = ClientAgentEventSchema.parse(event) as Extract<
      ClientAgentEvent,
      { type: 'session_info_changed' }
    >;
    expect(parsed.name).toBeUndefined();
  });

  it('rejects removed notice/error top-level events (docs/02 §5.1 勘误)', () => {
    expect(() => ClientAgentEventSchema.parse({ type: 'notice', seq })).toThrow();
    expect(() => ClientAgentEventSchema.parse({ type: 'error', seq, message: 'x' })).toThrow();
    expect(() => ClientAgentEventSchema.parse({ type: 'auto_compaction_start', seq })).toThrow();
  });

  it('rejects turn_start/turn_end (projected away)', () => {
    expect(() => ClientAgentEventSchema.parse({ type: 'turn_start', seq })).toThrow();
    expect(() => ClientAgentEventSchema.parse({ type: 'turn_end', seq })).toThrow();
  });

  it('requires seq on every event', () => {
    expect(() => ClientAgentEventSchema.parse({ type: 'agent_start' })).toThrow();
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
      startup_error: { errorMessage: 'boom' },
      prompt_done: {},
      prompt_error: { errorMessage: 'boom' },
      session_shutdown: {},
      extension_ui_request: {
        request: { method: 'notify', message: 'hi' },
      },
      extension_error: { extensionPath: '/ext/a.js', errorMessage: 'boom' },
      extension_ui_closed: { id: 'ui_1' },
    };
    // 每个已声明事件类型都有最小样例且可解析（防新增类型漏样例/漏字段）
    for (const type of CLIENT_AGENT_EVENT_TYPES) {
      const sample = minimal[type];
      if (sample === undefined) throw new Error(`missing minimal sample for ${type}`);
      const parsed = ClientAgentEventSchema.parse({ type, seq, ...sample });
      expect(parsed).toMatchObject({ type, seq });
    }
    // 反向：样例表不存在未声明类型
    expect(Object.keys(minimal).sort()).toEqual([...CLIENT_AGENT_EVENT_TYPES].sort());
    // 29 种：SDK 透传 21 + 服务层自加 8（docs/02 §5.1，SDK 0.85.1 实测无 adaptive）
    expect(CLIENT_AGENT_EVENT_TYPES).toHaveLength(29);
  });
});
