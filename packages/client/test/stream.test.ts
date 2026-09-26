import type {
  AgentMessage,
  AssistantMessage,
  ToolCall,
  Usage,
  WireAgentEvent,
} from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import { AgentStream } from '../src/stream/agent-stream';
import { fold } from '../src/stream/fold';
import { groupTrail } from '../src/stream/group-trail';
import { applyLiveRun, rebuildChatState, rebuildTurns } from '../src/stream/rebuild';
import { type ChatState, emptyChatState, isLiveTail } from '../src/stream/view-model';

// ---------------------------------------------------------------------------
// 事件工厂
// ---------------------------------------------------------------------------

/** 分配律 Omit：直接 Omit<Union> 会塔缩成公共键（protocol 同款注释） */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RawWireEvent = DistributiveOmit<WireAgentEvent, 'seq'>;

let seq = 0;
const ev = (event: RawWireEvent): WireAgentEvent => ({ ...event, seq: ++seq }) as WireAgentEvent;

/** 显式指定 seq（水位线测试用） */
const evSeq = (seqNo: number, event: RawWireEvent): WireAgentEvent =>
  ({ ...event, seq: seqNo }) as WireAgentEvent;

const USAGE: Usage = {
  input: 100,
  output: 50,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 150,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function run(events: WireAgentEvent[]): ChatState {
  return events.reduce((state, event) => fold(state, event), emptyChatState());
}

/** 一轮标准对话：user → thinking → toolcall(bash) → toolResult → 回答 */
function standardTurnEvents(): WireAgentEvent[] {
  return [
    ev({ type: 'agent_start' }),
    ev({
      type: 'message_start',
      message: { role: 'user', content: '列出目录', timestamp: 1_000 },
    }),
    ev({
      type: 'message_start',
      message: {
        role: 'assistant',
        content: [],
        api: 'anthropic',
        provider: 'anthropic',
        model: 'claude-test',
        usage: USAGE,
        stopReason: 'pending',
        timestamp: 2_000,
      },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: '用户要列目录，' },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: '用 ls 工具' },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: {
        type: 'thinking_end',
        contentIndex: 0,
        content: '用户要列目录，用 ls 工具',
      },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 1,
        id: 'call-1',
        toolName: 'bash',
      },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: {
        type: 'toolcall_end',
        contentIndex: 1,
        toolCall: {
          type: 'toolCall',
          id: 'call-1',
          name: 'bash',
          arguments: { command: 'ls -la' },
        } satisfies ToolCall,
      },
    }),
    ev({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '用户要列目录，用 ls 工具' },
          { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'ls -la' } },
        ],
        api: 'anthropic',
        provider: 'anthropic',
        model: 'claude-test',
        usage: USAGE,
        stopReason: 'toolUse',
        timestamp: 3_000,
      },
    }),
    ev({
      type: 'tool_execution_start',
      toolCallId: 'call-1',
      toolName: 'bash',
      args: { command: 'ls -la' },
    }),
    ev({
      type: 'tool_execution_end',
      toolCallId: 'call-1',
      toolName: 'bash',
      result: [{ type: 'text', text: 'total 0\ndrwxr-xr-x src' }],
      isError: false,
    }),
    ev({
      type: 'message_end',
      message: {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        content: [{ type: 'text', text: 'total 0\ndrwxr-xr-x src' }],
        isError: false,
        timestamp: 4_000,
      },
    }),
    ev({
      type: 'message_start',
      message: {
        role: 'assistant',
        content: [],
        api: 'anthropic',
        provider: 'anthropic',
        model: 'claude-test',
        usage: USAGE,
        stopReason: 'pending',
        timestamp: 5_000,
      },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'text_start', contentIndex: 0 },
    }),
    ev({
      type: 'message_update',
      usage: USAGE,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '目录内容如上' },
    }),
    ev({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '目录内容如上' }],
        api: 'anthropic',
        provider: 'anthropic',
        model: 'claude-test',
        usage: USAGE,
        stopReason: 'stop',
        timestamp: 6_000,
      },
    }),
    ev({ type: 'agent_end', messages: [], willRetry: false }),
    ev({ type: 'agent_settled' }),
  ];
}

// ---------------------------------------------------------------------------
// fold
// ---------------------------------------------------------------------------

describe('fold：标准一轮（user → thinking → tool → toolResult → 回答）', () => {
  const state = run(standardTurnEvents());

  it('产生一个已完成轮', () => {
    expect(state.turns.length).toBe(1);
    expect(state.turns[0]?.status).toBe('done');
    expect(state.streaming).toBe(false);
  });

  it('user 文本与时间戳正确', () => {
    expect(state.turns[0]?.user.text).toBe('列出目录');
    expect(state.turns[0]?.user.at).toBe(1_000);
  });

  it('思考行定稿（非流式）', () => {
    const thinking = state.turns[0]?.trail.find((item) => item.kind === 'thinking');
    expect(thinking).toMatchObject({
      kind: 'thinking',
      text: '用户要列目录，用 ls 工具',
      streaming: false,
    });
  });

  it('工具行全生命周期：preparing→ok，标题来自参数命令，输出回填', () => {
    const tool = state.turns[0]?.trail.find((item) => item.kind === 'tool');
    expect(tool).toMatchObject({
      kind: 'tool',
      toolCallId: 'call-1',
      toolName: 'bash',
      title: 'ls -la',
      status: 'ok',
      output: 'total 0\ndrwxr-xr-x src',
      isError: false,
    });
  });

  it('最终回答 + 用量快照 + 模型（message_end 定稿）', () => {
    const turn = state.turns[0];
    expect(turn?.final?.markdown).toBe('目录内容如上');
    expect(turn?.usage).toEqual(USAGE);
    expect(turn?.model).toEqual({ provider: 'anthropic', modelId: 'claude-test' });
  });
});

describe('fold：流式中间态与系统事件', () => {
  it('流式期间 thinking streaming、final 为 draft', () => {
    const state = run([
      ev({ type: 'agent_start' }),
      ev({ type: 'message_start', message: { role: 'user', content: 'hi', timestamp: 1 } }),
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
      }),
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '你' },
      }),
    ]);
    const turn = state.turns[0];
    expect(state.streaming).toBe(true);
    expect(turn?.status).toBe('streaming');
    expect(turn?.trail[0]).toMatchObject({ kind: 'thinking', streaming: true });
    expect(turn?.final?.markdown).toBe('你');
  });

  it('compaction / auto_retry 进系统行；queue_update 更新队列', () => {
    const state = run([
      ev({ type: 'message_start', message: { role: 'user', content: 'x', timestamp: 1 } }),
      ev({ type: 'compaction_start', reason: 'threshold' }),
      ev({
        type: 'auto_retry_start',
        attempt: 1,
        maxAttempts: 3,
        delayMs: 1000,
        errorMessage: 'boom',
      }),
      ev({ type: 'queue_update', steering: ['补充'], followUp: [] }),
    ]);
    const trail = state.turns[0]?.trail ?? [];
    expect(trail.filter((item) => item.kind === 'system').length).toBe(2);
    expect(state.queued.steering).toEqual(['补充']);
  });

  it('session_shutdown：轮标记 stopped、terminated', () => {
    const state = run([
      ev({ type: 'message_start', message: { role: 'user', content: 'x', timestamp: 1 } }),
      ev({ type: 'agent_start' }),
      ev({ type: 'session_shutdown', reason: 'idle' }),
    ]);
    expect(state.terminated).toBe(true);
    expect(state.turns[0]?.status).toBe('stopped');
  });
});

// ---------------------------------------------------------------------------
// fold / rebuild：刷新与重连接流（docs/05 §5.3）
// ---------------------------------------------------------------------------

/** 服务端合成的 late join 快照：content 是累积快照（真实 message_start 是空壳） */
function snapshotMessage(content: AssistantMessage['content']): WireAgentEvent {
  return ev({
    type: 'message_start',
    message: {
      role: 'assistant',
      content,
      api: 'anthropic',
      provider: 'anthropic',
      model: 'claude-test',
      usage: USAGE,
      stopReason: 'pending',
      timestamp: 9_000,
    },
  });
}

describe('fold：刷新/重连接流', () => {
  it('connected 用 runtime 的 isStreaming 对齐本地流式态（含丢过 agent_settled 的收口）', () => {
    const midRun = run([
      ev({ type: 'connected', sessionId: 's1', isStreaming: true, lastSeq: 10 }),
    ]);
    expect(midRun.streaming).toBe(true);

    const stale = run([
      ev({ type: 'message_start', message: { role: 'user', content: 'x', timestamp: 1 } }),
      ev({ type: 'agent_start' }),
      ev({ type: 'connected', sessionId: 's1', isStreaming: false, lastSeq: 20 }),
    ]);
    expect(stale.streaming).toBe(false);
    expect(stale.turns[0]?.status).toBe('done');
  });

  it('快照 message_start 接回半截消息（轨迹 + 正文草稿），后续增量接着写', () => {
    const history: AgentMessage[] = [{ role: 'user', content: '继续', timestamp: 1 }];
    const restored = rebuildChatState(history, ['e1']);
    const withSnapshot = fold(
      restored,
      snapshotMessage([
        { type: 'thinking', thinking: '想一下' },
        { type: 'text', text: '前半段' },
      ]),
    );
    expect(withSnapshot.turns[0]?.trail[0]).toMatchObject({
      kind: 'thinking',
      text: '想一下',
      streaming: false,
    });
    expect(withSnapshot.turns[0]?.final?.markdown).toBe('前半段');

    const more = fold(
      withSnapshot,
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '后半段' },
      }),
    );
    expect(more.turns[0]?.final?.markdown).toBe('前半段后半段');
  });

  it('重连快照与已有增量行合并：thinking 不重复、工具行按 id 认领', () => {
    const partial = run([
      ev({ type: 'message_start', message: { role: 'user', content: 'x', timestamp: 1 } }),
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
      }),
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: '想' },
      }),
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'text_start', contentIndex: 1 },
      }),
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '前半' },
      }),
      ev({
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: {
          type: 'toolcall_start',
          contentIndex: 2,
          id: 'call-1',
          toolName: 'bash',
        },
      }),
    ]);

    const merged = fold(
      partial,
      snapshotMessage([
        { type: 'thinking', thinking: '想一想' },
        { type: 'text', text: '前半段' },
        // partialJson 是 SDK 流式参数原文（wire 展开透传，protocol 类型不含）
        {
          type: 'toolCall',
          id: 'call-1',
          name: 'bash',
          arguments: {},
          partialJson: '{"command":"ls"',
        } as unknown as ToolCall,
      ]),
    );
    const trail = merged.turns[0]?.trail ?? [];
    expect(trail.filter((item) => item.kind === 'thinking')).toHaveLength(1);
    expect(trail[0]).toMatchObject({ kind: 'thinking', text: '想一想' });
    expect(trail[1]).toMatchObject({
      kind: 'tool',
      toolCallId: 'call-1',
      argsText: '{"command":"ls"',
    });
    expect(merged.turns[0]?.final?.markdown).toBe('前半段');
  });
});

describe('刷新中途接流：运行态折进静止历史', () => {
  /** 历史里有一条已发出的 toolCall，但 toolResult 还没落盘 */
  const history: AgentMessage[] = [
    { role: 'user', content: '跑个命令', timestamp: 1_000 },
    {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'call-9', name: 'bash', arguments: { command: 'sleep 30' } },
      ],
      api: 'anthropic',
      provider: 'anthropic',
      model: 'claude-test',
      usage: USAGE,
      stopReason: 'toolUse',
      timestamp: 2_000,
    },
  ];

  it('没有 toolResult 的工具行停在 preparing（不冒充已完成）', () => {
    const [turn] = rebuildTurns(history, ['e1', 'e2']);
    expect(turn?.trail.find((item) => item.kind === 'tool')).toMatchObject({
      status: 'preparing',
      output: null,
    });
  });

  it('isStreaming：末轮平铺 + 未回填的工具行标回 running；队列一并恢复', () => {
    const state = applyLiveRun(rebuildChatState(history, ['e1', 'e2']), {
      isStreaming: true,
      isPromptRunning: true,
      queuedMessages: { steering: ['补充'], followUp: [] },
    });
    expect(state.streaming).toBe(true);
    expect(state.queued.steering).toEqual(['补充']);
    expect(state.turns[0]?.status).toBe('streaming');
    expect(isLiveTail(state.turns, state.streaming)).toBe(true);
    expect(state.turns[0]?.trail.find((item) => item.kind === 'tool')).toMatchObject({
      status: 'running',
    });
  });

  it('仅 isPromptRunning（扩展命令等盲区）：composer 视为运行中，但不改轨迹', () => {
    const state = applyLiveRun(rebuildChatState(history, ['e1', 'e2']), {
      isStreaming: false,
      isPromptRunning: true,
      queuedMessages: { steering: [], followUp: [] },
    });
    expect(state.streaming).toBe(true);
    expect(state.turns[0]?.status).toBe('done');
    expect(state.turns[0]?.trail.find((item) => item.kind === 'tool')).toMatchObject({
      status: 'preparing',
    });
  });

  it('历史为空（首轮刷新：会话还没落盘）：快照补孤儿轮承接流式内容，不丢在 undefined 上', () => {
    const stream = new AgentStream('t1');
    // open() 的 404 分支：没有历史，只有运行态
    stream.restore(
      applyLiveRun(emptyChatState(), {
        isStreaming: true,
        isPromptRunning: true,
        queuedMessages: { steering: [], followUp: [] },
      }),
      7,
    );
    stream.applyEvent(
      evSeq(8, { type: 'connected', sessionId: 't1', isStreaming: true, lastSeq: 8 }),
    );
    stream.applyEvent(
      evSeq(9, {
        type: 'message_start',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '先看看' },
            { type: 'text', text: '正在处理' },
          ],
          api: 'anthropic',
          provider: 'anthropic',
          model: 'claude-test',
          usage: USAGE,
          stopReason: 'pending',
          timestamp: 9_000,
        },
      }),
    );

    const chat = stream.getSnapshot();
    expect(chat.turns).toHaveLength(1);
    expect(chat.turns[0]?.orphan).toBe(true);
    expect(chat.turns[0]?.trail[0]).toMatchObject({ kind: 'thinking', text: '先看看' });
    expect(chat.turns[0]?.final?.markdown).toBe('正在处理');
    expect(isLiveTail(chat.turns, chat.streaming)).toBe(true);
    // 后续增量落在这个孤儿轮上（没有锚点时 text_delta 会被丢）
    stream.applyEvent(
      evSeq(10, {
        type: 'message_update',
        usage: USAGE,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '后续' },
      }),
    );
    expect(stream.getSnapshot().turns[0]?.final?.markdown).toBe('正在处理后续');
  });
});

// ---------------------------------------------------------------------------
// rebuild 与 fold 的等价性（docs/05 §6.4 硬要求）
// ---------------------------------------------------------------------------

describe('rebuild：历史消息 → 与 fold 终态同形', () => {
  const liveState = run(standardTurnEvents());
  const messages: AgentMessage[] = [
    { role: 'user', content: '列出目录', timestamp: 1_000 },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '用户要列目录，用 ls 工具' },
        { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'ls -la' } },
      ],
      api: 'anthropic',
      provider: 'anthropic',
      model: 'claude-test',
      usage: USAGE,
      stopReason: 'toolUse',
      timestamp: 3_000,
    },
    {
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'bash',
      content: [{ type: 'text', text: 'total 0\ndrwxr-xr-x src' }],
      isError: false,
      timestamp: 4_000,
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: '目录内容如上' }],
      api: 'anthropic',
      provider: 'anthropic',
      model: 'claude-test',
      usage: USAGE,
      stopReason: 'stop',
      timestamp: 6_000,
    },
  ];

  it('同一轮对话，两条路径产出等价（忽略 id 与 durationMs）', () => {
    const rebuilt = rebuildTurns(messages, ['e1', 'e2', 'e3', 'e4']);
    const normalize = (turns: ChatState['turns']) =>
      JSON.parse(
        JSON.stringify(turns, (key, value) =>
          key === 'id' || key === 'durationMs' || key === 'at' ? undefined : value,
        ),
      );
    expect(normalize(rebuilt)).toEqual(normalize(liveState.turns));
  });

  it('窗口从轮中间开始：前导 assistant/toolResult 建孤儿轮（不丢数据、标记 orphan）', () => {
    const orphanTurns = rebuildTurns(
      [messages[1] as AgentMessage, messages[2] as AgentMessage],
      ['a', 'b'],
    );
    expect(orphanTurns.length).toBe(1);
    expect(orphanTurns[0]?.orphan).toBe(true);
    // 内容仍在：thinking + toolCall 两行，toolResult 输出已回填
    expect(orphanTurns[0]?.trail.length).toBe(2);
    const tool = orphanTurns[0]?.trail.find((item) => item.kind === 'tool');
    expect(tool).toMatchObject({
      kind: 'tool',
      toolCallId: 'call-1',
      output: 'total 0\ndrwxr-xr-x src',
    });
  });
});

// ---------------------------------------------------------------------------
// groupTrail（docs/05 §6.5 方案 2）
// ---------------------------------------------------------------------------

describe('groupTrail', () => {
  const items = [
    { kind: 'thinking', text: 'a', streaming: false },
    {
      kind: 'tool',
      toolCallId: 'c1',
      toolName: 'bash',
      title: 'ls',
      argsText: '',
      status: 'ok',
      output: '',
      isError: false,
    },
    {
      kind: 'tool',
      toolCallId: 'c2',
      toolName: 'read',
      title: 'f',
      argsText: '',
      status: 'ok',
      output: '',
      isError: false,
    },
  ] as const;

  it('静止后成组（1 thinking + 2 tool → 一个组，计数正确）', () => {
    const grouped = groupTrail([...items], false);
    expect(grouped.length).toBe(1);
    expect(grouped[0]).toMatchObject({ kind: 'group', messageCount: 3, toolCallCount: 2 });
  });

  it('流式末轮平铺不分组', () => {
    expect(groupTrail([...items], true).length).toBe(3);
  });

  it('单条纯 thinking 不套组壳；system 行不成组', () => {
    const grouped = groupTrail(
      [items[0], { kind: 'system', text: 'x', tone: 'info' }] as never,
      false,
    );
    expect(grouped.length).toBe(2);
    expect(grouped[0]?.kind).toBe('thinking');
    expect(grouped[1]?.kind).toBe('system');
  });
});

// ---------------------------------------------------------------------------
// AgentStream：seq 对账（docs/05 §5.2）
// ---------------------------------------------------------------------------

describe('AgentStream：seq 水位线', () => {
  it('丢弃 seq ≤ watermark 的事件；connected 更新水位线', () => {
    const stream = new AgentStream('s1');
    stream.restore(emptyChatState(), 0);
    stream.applyEvent(
      evSeq(1, { type: 'connected', sessionId: 's1', isStreaming: false, lastSeq: 3 }),
    );
    // 水位线 = 3：seq 2/3 的旧事件被丢弃
    stream.applyEvent(
      evSeq(2, {
        type: 'message_start',
        message: { role: 'user', content: '旧消息', timestamp: 1 },
      }),
    );
    stream.applyEvent(
      evSeq(3, { type: 'message_start', message: { role: 'user', content: '也旧', timestamp: 2 } }),
    );
    expect(stream.getSnapshot().turns.length).toBe(0);
    // seq 4 的新事件生效
    stream.applyEvent(
      evSeq(4, {
        type: 'message_start',
        message: { role: 'user', content: '新消息', timestamp: 3 },
      }),
    );
    expect(stream.getSnapshot().turns.length).toBe(1);
    expect(stream.getSnapshot().turns[0]?.user.text).toBe('新消息');
  });
});

describe('AgentStream：刷新中途接流', () => {
  it('运行态 restore + connected + 半截消息快照：流式态与已生成内容都在', () => {
    const stream = new AgentStream('s1');
    const history: AgentMessage[] = [{ role: 'user', content: '跑', timestamp: 1 }];
    stream.restore(
      applyLiveRun(rebuildChatState(history, ['e1']), {
        isStreaming: true,
        isPromptRunning: true,
        queuedMessages: { steering: [], followUp: [] },
      }),
      10,
    );
    stream.applyEvent(
      evSeq(11, { type: 'connected', sessionId: 's1', isStreaming: true, lastSeq: 11 }),
    );
    stream.applyEvent(
      evSeq(12, {
        type: 'message_start',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '写到一半' }],
          api: 'anthropic',
          provider: 'anthropic',
          model: 'claude-test',
          usage: USAGE,
          stopReason: 'pending',
          timestamp: 9_000,
        },
      }),
    );

    const chat = stream.getSnapshot();
    expect(chat.streaming).toBe(true);
    expect(chat.turns[0]?.status).toBe('streaming');
    expect(chat.turns[0]?.final?.markdown).toBe('写到一半');
  });
});

// ---------------------------------------------------------------------------
// AgentStream：就绪门禁（docs/05 §5.1；派发命令前必须已订阅）
// ---------------------------------------------------------------------------

describe('AgentStream：waitUntilReady', () => {
  const connected = (sessionId: string, seqNo: number, lastSeq: number): WireAgentEvent =>
    evSeq(seqNo, { type: 'connected', sessionId, isStreaming: false, lastSeq });

  it('收到 connected 帧前一直等，收到即放行', async () => {
    const stream = new AgentStream('s1');
    let released = false;
    const waiting = stream.waitUntilReady().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    stream.applyEvent(connected('s1', 1, 0));
    await waiting;
    expect(released).toBe(true);
  });

  it('即使 connected 被水位线丢弃（重建后 seq 从 1 重新计数）也算就绪', async () => {
    const stream = new AgentStream('s1');
    // 旧 runtime 的水位线远高于新 Entry 的 seq：connected 会被 seq 对账丢掉，但订阅确实已生效
    stream.restore(emptyChatState(), 100);
    const waiting = stream.waitUntilReady();
    stream.applyEvent(connected('s1', 1, 0));
    await expect(waiting).resolves.toBeUndefined();
  });

  it('断开后就绪复位，必须等下一次 connected', async () => {
    const stream = new AgentStream('s1');
    stream.applyEvent(connected('s1', 1, 0));
    await stream.waitUntilReady();
    stream.disconnect();
    let released = false;
    const waiting = stream.waitUntilReady(1_000).then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    stream.applyEvent(connected('s1', 2, 0));
    await waiting;
    expect(released).toBe(true);
  });

  it('超时兜底：连接上不来时不把发送动作钉死', async () => {
    const stream = new AgentStream('s1');
    await expect(stream.waitUntilReady(5)).resolves.toBeUndefined();
  });
});
