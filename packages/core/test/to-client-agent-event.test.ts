import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { ClientAgentEventSchema } from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import { isDroppedEvent, toClientAgentEvent } from '../src/events/to-client-agent-event';

/**
 * 事件投影测试 + 快照回归基线（AGENTS.md：SDK 相关改动须跑事件快照回归）。
 * SDK 升级（0.85.x 锁定，升级走单独 PR）时此处快照漂移即预警。
 */

type SdkMessage = AgentSession['messages'][number];

// -----------------------------------------------------------------------
// fixture 工厂（对齐 pi-agent-core AgentEvent / pi-ai AssistantMessageEvent）
// -----------------------------------------------------------------------

const usage = {
  input: 100,
  output: 50,
  cacheRead: 10,
  cacheWrite: 5,
  totalTokens: 165,
  cost: { input: 0.001, output: 0.002, cacheRead: 0.0001, cacheWrite: 0.0002, total: 0.0033 },
};

const assistantMessage: SdkMessage = {
  role: 'assistant',
  content: [
    { type: 'text', text: 'hello' },
    { type: 'toolCall', id: 'tc_1', name: 'read', arguments: { path: '/tmp/a' } },
  ],
  api: 'anthropic',
  provider: 'anthropic',
  model: 'claude-x',
  usage,
  stopReason: 'toolUse',
  timestamp: 1_700_000_000_000,
};

const userMessage: SdkMessage = {
  role: 'user',
  content: 'hi',
  timestamp: 1_700_000_000_000,
};

/** 累积 partial（toolCall 块在 content[1]，toolcall 流事件的提取源） */
const partialMessage: SdkMessage = {
  ...assistantMessage,
  content: [
    { type: 'text', text: 'let me read' },
    { type: 'toolCall', id: 'tc_1', name: 'read', arguments: {} },
  ],
};

const e = (event: AgentSessionEvent) => event;

// -----------------------------------------------------------------------
// 剔除规则
// ---------------------------------------------------------------------------

describe('toClientAgentEvent：剔除规则', () => {
  it('turn_start / turn_end 返回 null（agent_end 增强版已覆盖）', () => {
    expect(toClientAgentEvent(e({ type: 'turn_start' }), 1)).toBeNull();
    expect(
      toClientAgentEvent(e({ type: 'turn_end', message: assistantMessage, toolResults: [] }), 1),
    ).toBeNull();
    expect(isDroppedEvent(e({ type: 'turn_start' }))).toBe(true);
  });
});

// -----------------------------------------------------------------------
// message_update 投影（partial 剥离 / 双字段补齐 / usage 附带）
// ---------------------------------------------------------------------------

describe('toClientAgentEvent：message_update 子事件投影', () => {
  const update = (assistantMessageEvent: object) =>
    e({
      type: 'message_update',
      message: { ...assistantMessage, content: partialMessage.content },
      assistantMessageEvent: assistantMessageEvent as never,
    });

  it('text_delta：剥离 partial，保留增量字段', () => {
    const wire = toClientAgentEvent(
      update({ type: 'text_delta', contentIndex: 0, delta: 'abc', partial: partialMessage }),
      7,
    );
    expect(wire).toEqual({
      type: 'message_update',
      seq: 7,
      usage,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'abc' },
    });
    expect(JSON.stringify(wire)).not.toContain('"partial"');
  });

  it('toolcall_start：从 partial.content[contentIndex] 补齐 id / toolName', () => {
    const wire = toClientAgentEvent(
      update({ type: 'toolcall_start', contentIndex: 1, partial: partialMessage }),
      1,
    );
    expect(wire).toMatchObject({
      type: 'message_update',
      seq: 1,
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 1,
        id: 'tc_1',
        toolName: 'read',
      },
    });
    expect(JSON.stringify(wire)).not.toContain('"partial"');
  });

  it('toolcall_delta：同样补齐 id / toolName（SDK toJsonEvent 未做，PiBoat wire 要求）', () => {
    const wire = toClientAgentEvent(
      update({ type: 'toolcall_delta', contentIndex: 1, delta: '{"pa', partial: partialMessage }),
      2,
    );
    expect(wire).toMatchObject({
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 1,
        delta: '{"pa',
        id: 'tc_1',
        toolName: 'read',
      },
    });
  });

  it('toolcall_end：透传完整 toolCall，剥离 partial', () => {
    const wire = toClientAgentEvent(
      update({
        type: 'toolcall_end',
        contentIndex: 1,
        toolCall: { type: 'toolCall', id: 'tc_1', name: 'read', arguments: { path: '/tmp/a' } },
        partial: partialMessage,
      }),
      3,
    );
    expect(wire).toMatchObject({
      assistantMessageEvent: {
        type: 'toolcall_end',
        contentIndex: 1,
        toolCall: { id: 'tc_1', name: 'read' },
      },
    });
  });

  it('done / error：无 partial 字段，原样透传', () => {
    const wire = toClientAgentEvent(
      update({ type: 'done', reason: 'toolUse', message: assistantMessage }),
      4,
    );
    expect(wire).toMatchObject({ assistantMessageEvent: { type: 'done', reason: 'toolUse' } });
  });
});

// -----------------------------------------------------------------------
// 透传事件 + seq 附着
// ---------------------------------------------------------------------------

describe('toClientAgentEvent：透传与 seq', () => {
  it('agent_start 附 seq', () => {
    expect(toClientAgentEvent(e({ type: 'agent_start' }), 1)).toEqual({
      type: 'agent_start',
      seq: 1,
    });
  });

  it('message_start / message_end 附 seq', () => {
    expect(toClientAgentEvent(e({ type: 'message_start', message: userMessage }), 2)).toEqual({
      type: 'message_start',
      seq: 2,
      message: userMessage,
    });
    expect(
      toClientAgentEvent(e({ type: 'message_end', message: assistantMessage }), 3),
    ).toMatchObject({
      type: 'message_end',
      seq: 3,
    });
  });

  it('tool_execution_* 三连透传', () => {
    expect(
      toClientAgentEvent(
        e({
          type: 'tool_execution_start',
          toolCallId: 'tc_1',
          toolName: 'read',
          args: { path: 'a' },
        }),
        1,
      ),
    ).toEqual({
      type: 'tool_execution_start',
      seq: 1,
      toolCallId: 'tc_1',
      toolName: 'read',
      args: { path: 'a' },
    });
    expect(
      toClientAgentEvent(
        e({
          type: 'tool_execution_update',
          toolCallId: 'tc_1',
          toolName: 'read',
          args: {},
          partialResult: 'x',
        }),
        2,
      ),
    ).toMatchObject({ type: 'tool_execution_update', seq: 2, partialResult: 'x' });
    expect(
      toClientAgentEvent(
        e({
          type: 'tool_execution_end',
          toolCallId: 'tc_1',
          toolName: 'read',
          result: 'ok',
          isError: false,
        }),
        3,
      ),
    ).toEqual({
      type: 'tool_execution_end',
      seq: 3,
      toolCallId: 'tc_1',
      toolName: 'read',
      result: 'ok',
      isError: false,
    });
  });

  it('agent_end 增强版透传（messages + willRetry）', () => {
    const wire = toClientAgentEvent(
      e({ type: 'agent_end', messages: [userMessage], willRetry: false }),
      9,
    );
    expect(wire).toEqual({ type: 'agent_end', seq: 9, messages: [userMessage], willRetry: false });
  });

  it('queue_update：readonly 数组拷贝为可变数组', () => {
    const steering: readonly string[] = ['a'];
    const wire = toClientAgentEvent(e({ type: 'queue_update', steering, followUp: [] }), 1);
    expect(wire).toEqual({ type: 'queue_update', seq: 1, steering: ['a'], followUp: [] });
  });

  it('session_info_changed：name=undefined 时字段缺省（清除命名语义）', () => {
    const wire = toClientAgentEvent(e({ type: 'session_info_changed', name: undefined }), 1);
    expect(wire).toEqual({ type: 'session_info_changed', seq: 1 });
    expect('name' in (wire as object)).toBe(false);
    expect(toClientAgentEvent(e({ type: 'session_info_changed', name: '新名字' }), 2)).toEqual({
      type: 'session_info_changed',
      seq: 2,
      name: '新名字',
    });
  });

  it('compaction_end 透传（result 可缺省）', () => {
    const wire = toClientAgentEvent(
      e({
        type: 'compaction_end',
        reason: 'threshold',
        result: undefined,
        aborted: false,
        willRetry: false,
      }),
      1,
    );
    expect(wire).toEqual({
      type: 'compaction_end',
      seq: 1,
      reason: 'threshold',
      aborted: false,
      willRetry: false,
    });
  });

  it('entry_appended / bash_execution_update 透传', () => {
    const entry = {
      type: 'message',
      id: 'en1',
      parentId: null,
      timestamp: '2026-01-01T00:00:00.000Z',
      message: userMessage,
    } as never;
    expect(toClientAgentEvent(e({ type: 'entry_appended', entry }), 1)).toMatchObject({
      type: 'entry_appended',
      seq: 1,
    });
    expect(toClientAgentEvent(e({ type: 'bash_execution_update', delta: 'out' }), 2)).toEqual({
      type: 'bash_execution_update',
      seq: 2,
      delta: 'out',
    });
  });
});

// -----------------------------------------------------------------------
// wire 契约校验：全部投影结果可被 protocol schema 解析（防字段漂移）
// ---------------------------------------------------------------------------

describe('toClientAgentEvent：wire schema 兼容性', () => {
  const samples: Array<AgentSessionEvent> = [
    { type: 'agent_start' },
    { type: 'message_start', message: userMessage },
    {
      type: 'message_update',
      message: { ...assistantMessage, content: partialMessage.content },
      assistantMessageEvent: {
        type: 'text_delta',
        contentIndex: 0,
        delta: 'x',
        partial: partialMessage,
      },
    } as never,
    { type: 'message_end', message: assistantMessage },
    { type: 'tool_execution_start', toolCallId: 'tc_1', toolName: 'read', args: {} },
    {
      type: 'tool_execution_end',
      toolCallId: 'tc_1',
      toolName: 'read',
      result: null,
      isError: false,
    },
    { type: 'agent_end', messages: [userMessage, assistantMessage], willRetry: false },
    { type: 'agent_settled' },
    { type: 'queue_update', steering: [], followUp: [] },
    { type: 'compaction_start', reason: 'manual' },
    { type: 'thinking_level_changed', level: 'high' },
    { type: 'bash_execution_update', id: 'b1', delta: 'x' },
  ];

  it('每个样本投影后均通过 ClientAgentEventSchema.parse', () => {
    for (const event of samples) {
      const wire = toClientAgentEvent(e(event), 1);
      expect(wire, `event type: ${event.type}`).not.toBeNull();
      const parsed = ClientAgentEventSchema.safeParse(wire);
      expect(parsed.success, `schema parse failed for ${event.type}`).toBe(true);
    }
  });
});
