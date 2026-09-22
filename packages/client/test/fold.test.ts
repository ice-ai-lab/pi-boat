import type {
  AssistantMessage,
  ToolResultMessage,
  Usage,
  UserMessage,
  WireAgentEvent,
} from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import {
  createChatView,
  foldEvent,
  groupTrail,
  mergeTurns,
  type ToolRow,
  type TrailRow,
  type Turn,
} from '../src/stream/fold';
import { turnsFromMessages } from '../src/stream/rebuild';

/**
 * fold / rebuild 的等价性回归（docs/05 §6.4 硬要求）：
 * 同一轮对话，实时（事件折叠）与历史（消息重建）必须产出同形状的 `Turn[]`，
 * 否则刷新页面后布局会跳变。
 */

const USAGE: Usage = {
  input: 100,
  output: 20,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 120,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 },
};

const AT = 1_700_000_000_000;

/** 分发式 Omit：直接 Omit<Union,K> 会塌缩成公共键，丢掉判别信息 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type WireEventPayload = DistributiveOmit<WireAgentEvent, 'seq'>;

function seq(): (event: WireEventPayload) => WireAgentEvent {
  let n = 0;
  return (event) => {
    n += 1;
    return { ...event, seq: n } as WireAgentEvent;
  };
}

function userMessage(text: string): UserMessage {
  return { role: 'user', content: text, timestamp: AT };
}

function assistantMessage(
  content: AssistantMessage['content'],
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    usage: USAGE,
    stopReason: 'stop',
    timestamp: AT + 1_000,
    ...overrides,
  };
}

function toolResultMessage(toolCallId: string, text: string, details?: unknown): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName: 'edit',
    content: [{ type: 'text', text }],
    ...(details === undefined ? {} : { details }),
    isError: false,
    timestamp: AT + 2_000,
  };
}

const THINKING = { type: 'thinking', thinking: '先看文件' } as const;
const TOOL_CALL = {
  type: 'toolCall',
  id: 'call-1',
  name: 'edit',
  arguments: { path: 'src/a.ts', edits: [] },
} as const;

/** 实时路径：把一轮对话按 SDK 事件顺序折叠出来 */
function foldConversation(): Turn[] {
  const next = seq();
  const events: WireAgentEvent[] = [
    next({ type: 'agent_start' }),
    next({ type: 'message_start', message: userMessage('改一下 a.ts') }),
    next({ type: 'message_start', message: assistantMessage([]) }),
    next({ type: 'message_update', usage: USAGE, assistantMessageEvent: { type: 'start' } }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
    }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: '先看文件' },
    }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'thinking_end', contentIndex: 0, content: '先看文件' },
    }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 1,
        id: 'call-1',
        toolName: 'edit',
      },
    }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 1,
        delta: '{"path":',
        id: 'call-1',
        toolName: 'edit',
      },
    }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: {
        type: 'toolcall_end',
        contentIndex: 1,
        toolCall: TOOL_CALL,
      },
    }),
    next({
      type: 'message_end',
      message: assistantMessage([THINKING, TOOL_CALL], { stopReason: 'toolUse' }),
    }),
    next({ type: 'tool_execution_start', toolCallId: 'call-1', toolName: 'edit', args: {} }),
    next({
      type: 'tool_execution_end',
      toolCallId: 'call-1',
      toolName: 'edit',
      result: {
        content: [{ type: 'text', text: 'replaced 1 block' }],
        details: { diff: '+1 const a = 1' },
      },
      isError: false,
    }),
    next({
      type: 'message_start',
      message: toolResultMessage('call-1', 'replaced 1 block', { diff: '+1 const a = 1' }),
    }),
    next({
      type: 'message_end',
      message: toolResultMessage('call-1', 'replaced 1 block', { diff: '+1 const a = 1' }),
    }),
    // 第二轮 assistant：最终回答
    next({ type: 'message_start', message: assistantMessage([], { timestamp: AT + 3_000 }) }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'text_start', contentIndex: 0 },
    }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '已改好。' },
    }),
    next({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: '已改好。' },
    }),
    next({
      type: 'message_end',
      message: assistantMessage([{ type: 'text', text: '已改好。' }], { timestamp: AT + 3_000 }),
    }),
    next({ type: 'agent_settled' }),
  ];
  let view = createChatView();
  for (const event of events) view = foldEvent(view, event, () => AT + 5_000);
  return view.turns;
}

/** 历史路径：同一条 `.jsonl` 会话消息序列 */
function rebuildConversation(): Turn[] {
  return turnsFromMessages([
    userMessage('改一下 a.ts'),
    assistantMessage([THINKING, TOOL_CALL], { stopReason: 'toolUse' }),
    toolResultMessage('call-1', 'replaced 1 block', { diff: '+1 const a = 1' }),
    assistantMessage([{ type: 'text', text: '已改好。' }], {
      stopReason: 'stop',
      timestamp: AT + 3_000,
    }),
  ]);
}

function comparable(turns: Turn[]): unknown {
  return turns.map((turn) => ({
    id: turn.id,
    user: turn.user,
    final: turn.final,
    usage: turn.usage,
    model: turn.model,
    trail: turn.trail.map((row) => {
      if (row.kind === 'tool') {
        // 耗时是实时路径独有的（历史没有时间戳），比较时剔除
        const { durationMs: _d, startedAt: _s, ...rest } = row;
        return rest;
      }
      return row;
    }),
  }));
}

describe('fold ↔ rebuild 等价', () => {
  it('同一轮（思考 + 工具调用 + 最终回答）两条路径产出同形状', () => {
    const folded = foldConversation();
    const rebuilt = rebuildConversation();
    expect(folded).toHaveLength(1);
    expect(rebuilt).toHaveLength(1);
    expect(comparable(folded)).toEqual(comparable(rebuilt));
  });

  it('实时路径：工具行状态/输出/diff、思考行定稿、最终回答封口', () => {
    const [turn] = foldConversation();
    expect(turn).toBeDefined();
    const thinking = turn?.trail.find((row) => row.kind === 'thinking');
    expect(thinking).toMatchObject({ kind: 'thinking', text: '先看文件', streaming: false });
    const tool = turn?.trail.find((row): row is ToolRow => row.kind === 'tool');
    expect(tool).toMatchObject({
      toolName: 'edit',
      title: 'src/a.ts',
      status: 'ok',
      output: 'replaced 1 block',
      diff: '+1 const a = 1',
    });
    expect(turn?.final).toEqual({ markdown: '已改好。' });
    expect(turn?.status).toBe('done');
    expect(turn?.usage).toEqual(USAGE);
    expect(turn?.model).toEqual({ provider: 'anthropic', modelId: 'claude-sonnet-4-5' });
  });

  it('工具行生命周期跨两类事件：只有 execution 事件时也补出行（late join 场景）', () => {
    const next = seq();
    let view = createChatView();
    view = foldEvent(
      view,
      next({ type: 'message_start', message: userMessage('跑一下') }),
      () => AT,
    );
    view = foldEvent(
      view,
      next({
        type: 'tool_execution_start',
        toolCallId: 'x',
        toolName: 'bash',
        args: { command: 'ls' },
      }),
      () => AT,
    );
    view = foldEvent(
      view,
      next({
        type: 'tool_execution_end',
        toolCallId: 'x',
        toolName: 'bash',
        result: 'a.ts',
        isError: false,
      }),
      () => AT + 900,
    );
    const tool = view.turns[0]?.trail[0];
    expect(tool).toMatchObject({
      kind: 'tool',
      toolName: 'bash',
      title: 'ls',
      status: 'ok',
      output: 'a.ts',
    });
    expect(tool?.kind === 'tool' ? tool.durationMs : undefined).toBe(900);
  });

  it('late-join 快照：message_start 带累积 content 时，增量不产生重复行', () => {
    const next = seq();
    const partial = assistantMessage([THINKING, { type: 'text', text: '先看' }]);
    let view = createChatView();
    view = foldEvent(view, next({ type: 'message_start', message: userMessage('看看') }), () => AT);
    view = foldEvent(view, next({ type: 'message_start', message: partial }), () => AT);
    view = foldEvent(
      view,
      next({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '文件' },
      }),
      () => AT,
    );
    view = foldEvent(
      view,
      next({
        type: 'message_end',
        message: assistantMessage([THINKING, { type: 'text', text: '先看文件' }]),
      }),
      () => AT,
    );
    const [turn] = view.turns;
    expect(turn?.trail.filter((row) => row.kind === 'thinking')).toHaveLength(1);
    expect(turn?.final).toEqual({ markdown: '先看文件' });
    expect(turn?.trail.some((row) => row.kind === 'text')).toBe(false);
  });

  it('工具调用之后的文本才是回答：之前的文本降级为过程文本行', () => {
    const next = seq();
    let view = createChatView();
    view = foldEvent(
      view,
      next({ type: 'message_start', message: userMessage('做两件事') }),
      () => AT,
    );
    view = foldEvent(
      view,
      next({
        type: 'message_end',
        message: assistantMessage([
          { type: 'text', text: '我先读文件。' },
          TOOL_CALL,
          { type: 'text', text: '然后改。' },
        ]),
      }),
      () => AT,
    );
    const [turn] = view.turns;
    expect(turn?.trail.filter((row) => row.kind === 'text')).toHaveLength(1);
    expect(turn?.final).toEqual({ markdown: '然后改。' });
  });
});

describe('groupTrail（docs/05 §6.5 方案 2）', () => {
  const rows: TrailRow[] = [
    { kind: 'thinking', id: 'a', text: '想', streaming: false },
    {
      kind: 'tool',
      id: 'b',
      toolCallId: 'b',
      toolName: 'bash',
      title: 'ls',
      args: {},
      status: 'ok',
      output: null,
      durationMs: 500,
    },
    { kind: 'system', id: 'c', text: '上下文已压缩', tone: 'info' },
    {
      kind: 'tool',
      id: 'd',
      toolCallId: 'd',
      toolName: 'read',
      title: 'a.ts',
      args: {},
      status: 'ok',
      output: null,
      durationMs: 250,
    },
  ];

  it('流式期间（isLiveTail）平铺不分组', () => {
    expect(groupTrail(rows, { isLiveTail: true })).toEqual(rows);
  });

  it('静止后收拢，系统行不吸入组内', () => {
    const items = groupTrail(rows, { isLiveTail: false });
    expect(items.map((item) => item.kind)).toEqual(['group', 'system', 'group']);
    const first = items[0];
    expect(first?.kind === 'group' ? first.toolCallCount : -1).toBe(1);
    expect(first?.kind === 'group' ? first.messageCount : -1).toBe(1);
    expect(first?.kind === 'group' ? first.durationMs : -1).toBe(500);
  });
});

describe('mergeTurns（重连后历史 ∪ 事件）', () => {
  const history: Turn[] = [
    {
      id: 'turn-1',
      user: { text: '历史问题', at: 1 },
      trail: [],
      final: { markdown: '历史回答' },
      usage: null,
      model: null,
      status: 'done',
    },
  ];

  it('合成轮（无用户消息）并入最近一条历史轮，不另起一轮', () => {
    const overlay: Turn[] = [
      {
        id: 'turn-synth-m2',
        user: { text: '', at: 0 },
        trail: [{ kind: 'text', id: 'x', text: '半截' }],
        final: { markdown: '半截' },
        usage: null,
        model: null,
        status: 'streaming',
      },
    ];
    const merged = mergeTurns(history, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.user.text).toBe('历史问题');
    expect(merged[0]?.final).toEqual({ markdown: '半截' });
    expect(merged[0]?.status).toBe('streaming');
  });

  it('同 id 覆盖、无历史时直接采用事件轮', () => {
    const turn = history[0];
    expect(turn).toBeDefined();
    const overlay: Turn[] = [{ ...(turn as Turn), final: { markdown: '更新' } }];
    expect(mergeTurns(history, overlay)[0]?.final).toEqual({ markdown: '更新' });
    expect(mergeTurns([], overlay)).toHaveLength(1);
  });
});
