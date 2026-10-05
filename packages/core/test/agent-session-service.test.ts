import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { WireAgentEvent } from '@ice-ai/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentSessionService,
  PromptRejectedError,
  SessionNotFoundError,
} from '../src/agent/agent-session-service';
import { fakeRuntime, fakeSessionManager } from './helpers/fake-runtime';

/**
 * AgentSessionService 命令分发测试：注入 fake createSession 工厂，
 * 不触碰真实 SDK / ~/.pi（真实链路由 demo/chat.ts 验收）。
 */

/** 手动放行的 Promise（模拟「一轮还没跑完」） */
function deferred() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

const usage = {
  input: 1,
  output: 2,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 3,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function fakeAgentSession(overrides: Record<string, unknown> = {}) {
  const listeners = new Set<(e: AgentSessionEvent) => void>();
  const session = {
    sessionId: 'sess-1',
    sessionFile: '/tmp/sess-1.jsonl',
    sessionName: undefined as string | undefined,
    isStreaming: false,
    isCompacting: false,
    autoCompactionEnabled: true,
    autoRetryEnabled: true,
    thinkingLevel: 'medium',
    systemPrompt: 'You are a test.',
    pendingMessageCount: 0,
    messages: [] as never[],
    model: { provider: 'anthropic', id: 'claude-test' },
    modelRuntime: { getAvailableSnapshot: () => [{ provider: 'anthropic', id: 'claude-test' }] },
    agent: { state: { tools: [{ name: 'read' }, { name: 'bash' }] } },
    extensionRunner: { getRegisteredCommands: () => [] },
    promptTemplates: [{ name: 'review', description: 'code review', sourceInfo: undefined }],
    resourceLoader: { getSkills: () => ({ skills: [] }) },
    getAllTools: () => [
      {
        name: 'read',
        description: 'Read a file',
        parameters: { type: 'object' },
        promptGuidelines: undefined,
        exposure: 'direct',
        sourceInfo: undefined,
      },
      {
        name: 'write',
        description: 'Write a file',
        parameters: { type: 'object' },
        promptGuidelines: undefined,
        exposure: 'direct',
        sourceInfo: undefined,
      },
    ],
    sessionManager: fakeSessionManager().manager,
    setActiveToolsByName: vi.fn(),
    bindExtensions: vi.fn(async () => {}),
    setThinkingLevel: vi.fn(),
    setAutoCompactionEnabled: vi.fn(),
    setAutoRetryEnabled: vi.fn(),
    abortCompaction: vi.fn(),
    setSessionName: vi.fn(),
    reload: vi.fn(async () => {}),
    compact: vi.fn(async () => ({
      summary: 'sum',
      firstKeptEntryId: 'e1',
      tokensBefore: 10,
    })),
    navigateTree: vi.fn(async () => ({ cancelled: false, editorText: '编辑中的文本' })),
    getContextUsage: () => ({ tokens: 100, contextWindow: 200_000, percent: 0.05 }),
    getSessionStats: () => ({
      sessionId: 'sess-1',
      sessionFile: '/tmp/sess-1.jsonl',
      userMessages: 1,
      assistantMessages: 2,
      toolCalls: 3,
      toolResults: 4,
      totalMessages: 7,
      tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
      cost: 0.5,
      contextUsage: undefined,
    }),
    getLastAssistantText: () => 'final answer',
    prompt: vi.fn(
      async (
        _text: string,
        options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
      ) => {
        // SDK ≥ 1.0 语义：接受时回调一次 disposition（ADR-0033）
        options?.preflightResult?.('started');
      },
    ),
    steer: vi.fn(async () => {}),
    followUp: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    clearQueue: () => ({ steering: ['s1'], followUp: ['f1'] }),
    setModel: vi.fn(async () => {}),
    subscribe(cb: (e: AgentSessionEvent) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose: vi.fn(),
    ...overrides,
  };
  return {
    session: session as unknown as AgentSession,
    emit: (e: AgentSessionEvent) => {
      for (const l of listeners) l(e);
    },
  };
}

/** fake session 上被断言的方法（显式形状，避免索引签名的 undefined 噪音） */
interface SessionSpies {
  setModel: ReturnType<typeof vi.fn>;
  setThinkingLevel: ReturnType<typeof vi.fn>;
  setAutoCompactionEnabled: ReturnType<typeof vi.fn>;
  setAutoRetryEnabled: ReturnType<typeof vi.fn>;
  abortCompaction: ReturnType<typeof vi.fn>;
  compact: ReturnType<typeof vi.fn>;
  setSessionName: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  bindExtensions: ReturnType<typeof vi.fn>;
  sessionManager: Record<string, unknown>;
}

const spies = (session: AgentSession): SessionSpies => session as unknown as SessionSpies;

function serviceWith(fake: ReturnType<typeof fakeAgentSession>) {
  const runtime = fakeRuntime(fake.session);
  const service = new AgentSessionService({
    createRuntime: async () => runtime,
    // 缺省 findSessionFile 在真实 ~/.pi 会话目录里按 id 找文件；测试一律显式注入
    findSessionFile: async () => null,
  });
  return { service, fake, runtime };
}

describe('AgentSessionService.create', () => {
  it('ensure_session：建会话入注册表，返回 NewSessionOk 形状', async () => {
    const { service } = serviceWith(fakeAgentSession());
    const ok = await service.create({ cwd: '/tmp', type: 'ensure_session' });
    expect(ok).toEqual({
      success: true,
      data: null,
      sessionId: 'sess-1',
      model: { provider: 'anthropic', modelId: 'claude-test' },
      thinkingLevel: 'medium',
    });
    expect(service.isResident('sess-1')).toBe(true);
    expect(service.residentSessionIds()).toEqual(['sess-1']);
    // 常驻 ≠ 在跑：刚建的会话是 idle，侧栏不能给它显示「加载中」（2026-09-26）
    expect(service.runningSessions()).toEqual([]);
  });

  it('runningSessions：只列真在跑的（流/提示/压缩）+ 带 cwd，常驻 idle 不算', async () => {
    const { service } = serviceWith(fakeAgentSession({ isStreaming: true }));
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    expect(service.residentSessionIds()).toEqual(['sess-1']);
    expect(service.runningSessions()).toEqual([{ id: 'sess-1', cwd: '/tmp' }]);
  });

  it('显式 provider/modelId：经 modelRuntime 解析后 setModel；找不到则报错不留脏注册', async () => {
    const { service, fake } = serviceWith(fakeAgentSession());
    const ok = await service.create({
      cwd: '/tmp',
      type: 'ensure_session',
      provider: 'anthropic',
      modelId: 'claude-test',
    });
    expect(ok.model).toEqual({ provider: 'anthropic', modelId: 'claude-test' });
    expect(fake.session.setModel).toHaveBeenCalledTimes(1);

    const { service: s2 } = serviceWith(fakeAgentSession());
    await expect(
      s2.create({ cwd: '/tmp', type: 'ensure_session', provider: 'nope', modelId: 'nope' }),
    ).rejects.toThrow(/not available/i);
    expect(s2.residentSessionIds()).toEqual([]);
  });

  it('带 message：create 内部派发 prompt', async () => {
    const { service, fake } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', message: 'hello' });
    expect(fake.session.prompt).toHaveBeenCalledWith('hello', expect.anything());
  });

  it('工厂抛错：上抛且不入注册表', async () => {
    const service = new AgentSessionService({
      createRuntime: async () => {
        throw new Error('no auth configured');
      },
      findSessionFile: async () => null,
    });
    await expect(service.create({ cwd: '/tmp', type: 'ensure_session' })).rejects.toThrow(
      'no auth configured',
    );
    expect(service.runningSessions()).toEqual([]);
  });
});

describe('AgentSessionService.send：命令分发', () => {
  it('未知会话抛 SessionNotFoundError', async () => {
    const { service } = serviceWith(fakeAgentSession());
    await expect(service.send('nope', { type: 'abort' })).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  it('prompt：派发并带 preflight 回调；settle 依据 = SDK agent_settled（2026-09-20 定案）', async () => {
    const { service, fake } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const events: WireAgentEvent[] = [];
    service.subscribe('sess-1', (e) => events.push(e));

    await service.send('sess-1', { type: 'prompt', message: 'hi' });
    expect(fake.session.prompt).toHaveBeenCalledOnce();
    fake.emit({ type: 'agent_settled' });
    expect(events.map((e) => e.type)).toContain('agent_settled');
    expect(service.getRunningState('sess-1')).toMatchObject({
      state: { isPromptRunning: false },
    });
  });

  it('prompt：不起 agent run 的扩展命令也必须销账 isPromptRunning（事件流盲区）', async () => {
    // 模拟 SDK 的扩展命令路径（agent-session.js:828）：执行 handler 后
    // preflightResult('started') 直接 return，不进 _runAgentPrompt → 不发 agent_settled
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fake = fakeAgentSession({
      prompt: vi.fn(
        async (
          _t: string,
          options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
        ) => {
          await gate;
          options?.preflightResult?.('started');
        },
      ),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const events: WireAgentEvent[] = [];
    service.subscribe('sess-1', (e) => events.push(e));

    const sent = service.send('sess-1', { type: 'prompt', message: '/tui' });
    await new Promise((r) => setTimeout(r, 10));
    // handler 执行期：既无 agent 事件、isStreaming 也为 false，
    // isPromptRunning 是客户端唯一能看出"还在跑"的判据
    expect(service.getRunningState('sess-1')).toMatchObject({
      running: true,
      state: { isStreaming: false, isPromptRunning: true },
    });

    release();
    await sent;
    expect(service.getRunningState('sess-1')).toMatchObject({
      running: true,
      state: { isPromptRunning: false },
    });
    expect(events.map((e) => e.type)).not.toContain('agent_settled');
  });

  it('prompt 被拒（preflight 回调未触发）：抛 PromptRejectedError（错误经 REST 信封回发送方）', async () => {
    // SDK ≥ 1.0 语义：拒绝 = preflightResult 不回调（原 false 路径已删，ADR-0033）
    const fake = fakeAgentSession({
      prompt: vi.fn(
        async (
          _t: string,
          options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
        ) => {
          // 不回调：模拟 SDK 拒绝路径
        },
      ),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    await expect(
      service.send('sess-1', { type: 'prompt', message: '/blocked' }),
    ).rejects.toBeInstanceOf(PromptRejectedError);
    expect(service.getRunningState('sess-1')).toMatchObject({
      state: { isPromptRunning: false },
    });
  });

  it('clear_queue 返回可变数组映射', async () => {
    const { service } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const result = await service.send('sess-1', { type: 'clear_queue' });
    expect(result).toEqual({ steering: ['s1'], followUp: ['f1'] });
  });

  it('get_state：装配 AgentState（queued 来自 Entry 跟踪，contextUsage 映射 nullable）', async () => {
    const { service, fake } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    fake.emit({ type: 'queue_update', steering: ['aaa'], followUp: [] });

    const state = await service.send('sess-1', { type: 'get_state' });
    expect(state).toMatchObject({
      sessionId: 'sess-1',
      sessionFile: '/tmp/sess-1.jsonl',
      isStreaming: false,
      isPromptRunning: false,
      isCompacting: false,
      autoCompactionEnabled: true,
      autoRetryEnabled: true,
      model: { provider: 'anthropic', modelId: 'claude-test' },
      messageCount: 0,
      pendingMessageCount: 0,
      queuedMessages: { steering: ['aaa'], followUp: [] },
      contextUsage: { tokens: 100, contextWindow: 200_000, percent: 0.05 },
      systemPrompt: 'You are a test.',
      thinkingLevel: 'medium',
      extensionStatuses: [],
      extensionWidgets: [],
    });
  });

  it('get_session_stats：附加 sessionName', async () => {
    const { service } = serviceWith(fakeAgentSession({ sessionName: '调试会话' }));
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const stats = await service.send('sess-1', { type: 'get_session_stats' });
    expect(stats.sessionName).toBe('调试会话');
    expect(stats.tokens?.total).toBe(10);
  });

  it('get_last_assistant_text：undefined → null', async () => {
    const { service } = serviceWith(fakeAgentSession({ getLastAssistantText: () => undefined }));
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    expect(await service.send('sess-1', { type: 'get_last_assistant_text' })).toEqual({
      text: null,
    });
  });

  it('get_commands：prompt 模板 + 扩展命令 + skills 三源合并', async () => {
    const { service } = serviceWith(
      fakeAgentSession({
        extensionRunner: {
          getRegisteredCommands: () => [
            { invocationName: 'ext:foo', description: 'd', sourceInfo: undefined },
          ],
        },
      }),
    );
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const result = await service.send('sess-1', { type: 'get_commands' });
    expect(result.commands).toEqual([
      { name: 'ext:foo', description: 'd', source: 'extension', sourceInfo: undefined },
      { name: 'review', description: 'code review', source: 'prompt', sourceInfo: undefined },
    ]);
  });

  it('get_tools：active 由 agent.state.tools 叠加', async () => {
    const { service } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const tools = await service.send('sess-1', { type: 'get_tools' });
    expect(tools.map((t) => [t.name, t.active])).toEqual([
      ['read', true],
      ['write', false],
    ]);
  });

  it('set_tools（显式名单）：走 switch 路径返回 null 并持久化选择', async () => {
    const { service, fake } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const result = await service.send('sess-1', { type: 'set_tools', toolNames: ['read'] });
    expect(result).toBeNull();
    expect(fake.session.setActiveToolsByName).toHaveBeenCalledWith(['read']);
    const manager = (fake.session as unknown as { sessionManager: { appendCustomEntry: unknown } })
      .sessionManager;
    expect(manager.appendCustomEntry).toHaveBeenCalledWith('piboat:tool-selection', {
      version: 1,
      tools: ['read'],
    });
  });

  it('set_tools：两形态必须恰好给一个（都给 / 都不给 → 400 类错误）', async () => {
    const { service } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    await expect(service.send('sess-1', { type: 'set_tools' })).rejects.toThrow(/exactly one/);
    await expect(
      service.send('sess-1', { type: 'set_tools', toolNames: [], preset: 'default' }),
    ).rejects.toThrow(/exactly one/);
  });

  it('命令串行化：同会话 FIFO（前一个未完成时后一个排队）', async () => {
    let releasePrompt: () => void = () => {};
    const gate = new Promise<void>((r) => {
      releasePrompt = r;
    });
    const order: string[] = [];
    const fake = fakeAgentSession({
      prompt: vi.fn(
        async (
          _t: string,
          options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
        ) => {
          order.push('prompt-start');
          await gate;
          order.push('prompt-end');
          options?.preflightResult?.('started');
        },
      ),
      setThinkingLevel: vi.fn(() => order.push('thinking')),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const p1 = service.send('sess-1', { type: 'prompt', message: 'a' });
    // 变更类命令（会改会话状态）排队等前一条
    const p2 = service.send('sess-1', { type: 'set_thinking_level', level: 'high' });
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(['prompt-start']);
    releasePrompt();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['prompt-start', 'prompt-end', 'thinking']);
  });

  it('只读命令不排队：prompt 未结束时 get_state / get_tools 等立即返回', async () => {
    const { gate, release } = deferred();
    const fake = fakeAgentSession({
      prompt: vi.fn(
        async (
          _t: string,
          options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
        ) => {
          options?.preflightResult?.('started');
          await gate;
        },
      ),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const prompt = service.send('sess-1', { type: 'prompt', message: '跑 60s' });
    await new Promise((r) => setTimeout(r, 0));
    // 不 release 就该返回：只读命令只是看状态，排到轮末只会白占浏览器连接
    const state = await service.send('sess-1', { type: 'get_state' });
    expect(state.sessionId).toBe('sess-1');
    expect(await service.send('sess-1', { type: 'get_tools' })).toHaveLength(2);
    expect(await service.send('sess-1', { type: 'get_commands' })).toEqual({
      commands: [
        {
          name: 'review',
          description: 'code review',
          source: 'prompt',
          sourceInfo: undefined,
        },
      ],
    });

    release();
    await prompt;
  });

  it('扩展 UI 应答不排队：运行中阻塞等答案时立即回填（否则死锁到 5 分钟超时）', async () => {
    type UiContext = { confirm(title: string, message: string): Promise<boolean | undefined> };
    const { gate, release } = deferred();
    const captured: { uiContext: UiContext | null } = { uiContext: null };
    const fake = fakeAgentSession({
      prompt: vi.fn(
        async (
          _t: string,
          options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
        ) => {
          options?.preflightResult?.('started');
          await gate;
        },
      ),
      bindExtensions: vi.fn(async (options: { uiContext: UiContext }) => {
        captured.uiContext = options.uiContext;
      }),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    // 捕获桥发的请求 id（真实链路上客户端就是这么拿到的）
    const requestIds: string[] = [];
    service.subscribe('sess-1', (event) => {
      if (event.type === 'extension_ui_request') requestIds.push(event.request.id);
    });

    const prompt = service.send('sess-1', { type: 'prompt', message: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    // 扩展在运行中发起阻塞型提问（真实场景：工具里 await uiContext.confirm）
    const uiContext = captured.uiContext;
    if (uiContext === null) throw new Error('扩展 UI 上下文未捕获');
    const answer = uiContext.confirm('标题', '正文');
    const requestId = requestIds[0];
    if (requestId === undefined) throw new Error('扩展 UI 请求未捕获');
    await service.send('sess-1', {
      type: 'extension_ui_response',
      id: requestId,
      confirmed: true,
    });
    await expect(answer).resolves.toBe(true);

    release();
    await prompt;
  });

  it('中断类命令不排队：prompt 未结束时 abort 已派发（停止按钮不等轮末）', async () => {
    const { gate, release } = deferred();
    const abortSpy = vi.fn(async () => {});
    const fake = fakeAgentSession({
      prompt: vi.fn(
        async (
          _t: string,
          options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
        ) => {
          options?.preflightResult?.('started');
          await gate;
        },
      ),
      abort: abortSpy,
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const prompt = service.send('sess-1', { type: 'prompt', message: '跑 60s' });
    await new Promise((r) => setTimeout(r, 0));
    // 不 release 就该返回：abort 直通 SDK，不排在同会话 FIFO 后面
    await service.send('sess-1', { type: 'abort' });
    expect(abortSpy).toHaveBeenCalledTimes(1);
    release();
    await prompt;
  });

  it('中断类命令不排队：运行中的 steer / follow_up / abort_compaction 立即入 SDK 队列', async () => {
    const { gate, release } = deferred();
    const steerSpy = vi.fn(async () => {});
    const followUpSpy = vi.fn(async () => {});
    const abortCompactionSpy = vi.fn();
    const fake = fakeAgentSession({
      prompt: vi.fn(
        async (
          _t: string,
          options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
        ) => {
          options?.preflightResult?.('started');
          await gate;
        },
      ),
      steer: steerSpy,
      followUp: followUpSpy,
      abortCompaction: abortCompactionSpy,
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const prompt = service.send('sess-1', { type: 'prompt', message: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    await service.send('sess-1', { type: 'steer', message: '插队' });
    await service.send('sess-1', { type: 'follow_up', message: '追问' });
    await service.send('sess-1', { type: 'abort_compaction' });
    expect(steerSpy).toHaveBeenCalledWith('插队', undefined);
    expect(followUpSpy).toHaveBeenCalledWith('追问', undefined);
    expect(abortCompactionSpy).toHaveBeenCalledTimes(1);

    release();
    await prompt;
  });

  it('中断类命令不写队列尾：排队中的 prompt 仍等前一个 run 结束（不并发两个 run）', async () => {
    const { gate, release } = deferred();
    const promptSpy = vi.fn(
      async (
        _t: string,
        options?: { preflightResult?: (d: 'started' | 'queued' | 'handled') => void },
      ) => {
        options?.preflightResult?.('started');
        await gate;
      },
    );
    const fake = fakeAgentSession({ prompt: promptSpy });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const first = service.send('sess-1', { type: 'prompt', message: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    // 中断命令插进来，也不该把队列尾推平
    await service.send('sess-1', { type: 'abort' });
    const second = service.send('sess-1', { type: 'prompt', message: 'b' });
    await new Promise((r) => setTimeout(r, 0));
    expect(promptSpy).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);
    expect(promptSpy).toHaveBeenCalledTimes(2);
  });

  it('命令串行化：前一条失败不阻塞后续命令（队列尾恒 fulfilled）', async () => {
    const fake = fakeAgentSession({
      prompt: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const failed = service.send('sess-1', { type: 'prompt', message: 'a' });
    const next = service.send('sess-1', { type: 'get_state' });
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toMatchObject({ sessionId: 'sess-1' });
    // 派发即抛也走销账，不留永久 true
    expect(service.getRunningState('sess-1')).toMatchObject({
      state: { isPromptRunning: false },
    });
  });
});

describe('AgentSessionService.subscribe（late join 时序 ①②③）', () => {
  it('先注册 listener → connected → 半截消息快照 message_start', async () => {
    const fake = fakeAgentSession({ isStreaming: true });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    // 制造流内半截消息
    fake.emit({
      type: 'message_update',
      message: { role: 'assistant', content: [{ type: 'text', text: '半截' }], usage } as never,
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '半' } as never,
    });

    const events: WireAgentEvent[] = [];
    service.subscribe('sess-1', (e) => events.push(e));
    expect(events.map((e) => `${e.type}:${e.seq}`)).toEqual(['connected:2', 'message_start:3']);
    expect(events[0]).toMatchObject({ sessionId: 'sess-1', isStreaming: true });
    expect(events[1]).toMatchObject({ message: { role: 'assistant' } });
  });

  it('无流内消息时只发 connected', async () => {
    const { service } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const events: WireAgentEvent[] = [];
    service.subscribe('sess-1', (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(['connected']);
  });
});

describe('AgentSessionService 轻查与销毁', () => {
  it('getRunningState：运行中附完整 state；未运行 {running:false}', async () => {
    const { service } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    expect(service.getRunningState('sess-1')).toMatchObject({ running: true });
    expect(service.getRunningState('nope')).toEqual({ running: false });
  });

  it('disposeSession：广播 shutdown、出注册表、版本号 +1', async () => {
    const { service } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const v0 = service.registryVersion;
    const events: WireAgentEvent[] = [];
    service.subscribe('sess-1', (e) => events.push(e));

    service.disposeSession('sess-1', 'idle');
    expect(events.map((e) => e.type)).toEqual(['connected', 'session_shutdown']);
    expect(service.isResident('sess-1')).toBe(false);
    expect(service.registryVersion).toBe(v0 + 1);
    await expect(service.send('sess-1', { type: 'abort' })).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// B2：命令面补全（分支 / 压缩 / 模型 / 会话管理 / 扩展 UI）+ 恢复与预设
// ---------------------------------------------------------------------------

describe('AgentSessionService.send：B2 命令面', () => {
  /** 可变会话的 runtime：fork 后 `session` 换成新会话（模拟 SDK 的原地替换） */
  function swappableService() {
    const holder = { current: fakeAgentSession({ sessionId: 'sess-1' }).session };
    const runtime = fakeRuntime(holder.current);
    Object.defineProperty(runtime, 'session', {
      get: () => holder.current,
      configurable: true,
    });
    const service = new AgentSessionService({
      createRuntime: async () => runtime,
      findSessionFile: async () => null,
    });
    return { service, runtime, holder };
  }

  it('set_model：可用模型走 setModel 并回 ModelRef；不可用报 UserInputError', async () => {
    const { service, holder } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const ref = await service.send('sess-1', {
      type: 'set_model',
      provider: 'anthropic',
      modelId: 'claude-test',
    });
    expect(ref).toEqual({ provider: 'anthropic', modelId: 'claude-test' });
    expect(spies(holder.current).setModel).toHaveBeenCalledTimes(1);

    await expect(
      service.send('sess-1', { type: 'set_model', provider: 'x', modelId: 'y' }),
    ).rejects.toThrow(/not available/i);
  });

  it('压缩 / 重试 / 思考档位：逐个落到 SDK 会话方法', async () => {
    const { service, holder } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const s = spies(holder.current);

    await service.send('sess-1', { type: 'set_thinking_level', level: 'high' });
    expect(s.setThinkingLevel).toHaveBeenCalledWith('high');

    await service.send('sess-1', { type: 'set_auto_compaction', enabled: false });
    expect(s.setAutoCompactionEnabled).toHaveBeenCalledWith(false);

    await service.send('sess-1', { type: 'set_auto_retry', enabled: true });
    expect(s.setAutoRetryEnabled).toHaveBeenCalledWith(true);

    await service.send('sess-1', { type: 'abort_compaction' });
    expect(s.abortCompaction).toHaveBeenCalledTimes(1);

    const result = await service.send('sess-1', { type: 'compact', customInstructions: 'x' });
    expect(s.compact).toHaveBeenCalledWith('x');
    expect(result).toEqual({ summary: 'sum', firstKeptEntryId: 'e1', tokensBefore: 10 });
  });

  it('set_session_name：空白名报 UserInputError；否则写 SDK', async () => {
    const { service, holder } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const s = spies(holder.current);

    await expect(service.send('sess-1', { type: 'set_session_name', name: '   ' })).rejects.toThrow(
      /cannot be empty/i,
    );
    await service.send('sess-1', { type: 'set_session_name', name: ' 调试 ' });
    expect(s.setSessionName).toHaveBeenCalledWith('调试');
  });

  it('reload：重载资源并重绑扩展', async () => {
    const { service, holder } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const s = spies(holder.current);
    const before = s.bindExtensions.mock.calls.length;

    await service.send('sess-1', { type: 'reload' });
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(s.bindExtensions.mock.calls.length).toBe(before + 1);
  });

  it('navigate_tree：透传选项并返回 {cancelled, editorText}', async () => {
    const { service } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const result = await service.send('sess-1', {
      type: 'navigate_tree',
      targetId: 'e1',
      summarize: true,
    });
    expect(result).toEqual({ cancelled: false, editorText: '编辑中的文本' });
  });

  it('fork：runtime 原地替换 → 注册表改键 + 旧流下发 session_replaced', async () => {
    const { service, runtime, holder } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const events: WireAgentEvent[] = [];
    service.subscribe('sess-1', (e) => events.push(e));

    (runtime as unknown as { fork: ReturnType<typeof vi.fn> }).fork = vi.fn(async () => {
      holder.current = fakeAgentSession({ sessionId: 'sess-2' }).session;
      return { cancelled: false };
    });

    const result = await service.send('sess-1', { type: 'fork', entryId: 'e1' });
    expect(result).toEqual({ cancelled: false, newSessionId: 'sess-2' });
    expect(events.map((e) => e.type)).toContain('session_replaced');
    expect(events.at(-1)).toMatchObject({
      type: 'session_replaced',
      newSessionId: 'sess-2',
      reason: 'fork',
    });
    // 旧键立即销毁（docs/01 §8-1），新键可用
    expect(service.isResident('sess-1')).toBe(false);
    expect(service.isResident('sess-2')).toBe(true);
    await expect(service.send('sess-1', { type: 'abort' })).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  it('fork / clone：会话在跑时 409 类错误（SessionBusyError），不动 runtime', async () => {
    const { service, runtime } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    Object.defineProperty(runtime.session, 'isStreaming', { get: () => true, configurable: true });

    await expect(service.send('sess-1', { type: 'fork', entryId: 'e1' })).rejects.toThrow(
      /while the session is running/i,
    );
    await expect(service.send('sess-1', { type: 'clone' })).rejects.toThrow(/running/i);
  });

  it('clone：无叶节点报 UserInputError；有 leafId 则按 at 位置 fork', async () => {
    const { service, runtime, holder } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const manager = spies(holder.current).sessionManager;
    manager.getLeafId = () => null;
    await expect(service.send('sess-1', { type: 'clone' })).rejects.toThrow(
      /no current entry selected/i,
    );

    manager.getLeafId = () => 'leaf-9';
    (runtime as unknown as { fork: ReturnType<typeof vi.fn> }).fork = vi.fn(async () => {
      holder.current = fakeAgentSession({ sessionId: 'sess-clone' }).session;
      return { cancelled: false };
    });
    const result = await service.send('sess-1', { type: 'clone' });
    expect(result.newSessionId).toBe('sess-clone');
    expect((runtime as unknown as { fork: ReturnType<typeof vi.fn> }).fork).toHaveBeenCalledWith(
      'leaf-9',
      { position: 'at' },
    );
  });

  it('extension_ui_response：回填桥的未决请求（未知 id 不报错）', async () => {
    const { service } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    // 未知 id 属正常竞态：客户端慢一步
    await expect(
      service.send('sess-1', { type: 'extension_ui_response', id: 'gone', value: 'v' }),
    ).resolves.toBeNull();
    // 三态都不满足 → 400 类错误
    await expect(
      service.send('sess-1', { type: 'extension_ui_response', id: 'x' }),
    ).rejects.toThrow(/requires value, confirmed or cancelled/);
  });

  it('get_state：扩展 statuses/widgets 来自桥的快照', async () => {
    const { service } = swappableService();
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const state = await service.send('sess-1', { type: 'get_state' });
    expect(state.extensionStatuses).toEqual([]);
    expect(state.extensionWidgets).toEqual([]);
  });
});

describe('AgentSessionService：工具预设与纯聊天边界（G2-9/G2-10）', () => {
  it('preset=read-only：即时 switch（无需重建）并持久化', async () => {
    const fake = fakeAgentSession();
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const result = await service.send('sess-1', { type: 'set_tools', preset: 'read-only' });
    expect(result).toBeNull();
    expect(fake.session.setActiveToolsByName).toHaveBeenCalledWith(['read', 'grep', 'find', 'ls']);
  });

  it('preset=chat-only（纯聊天）：整 runtime 重建并返回 {sessionId, recreated:true}', async () => {
    const fake = fakeAgentSession();
    const rebuilt = fakeAgentSession({ sessionId: 'sess-1' });
    const calls: Array<{ sessionFile?: string; chatOnly?: boolean }> = [];
    const service = new AgentSessionService({
      createRuntime: async (input) => {
        calls.push({ sessionFile: input.sessionFile, chatOnly: input.chatOnly });
        return fakeRuntime(input.sessionFile === undefined ? fake.session : rebuilt.session);
      },
      findSessionFile: async () => null,
    });
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const result = await service.send('sess-1', { type: 'set_tools', preset: 'chat-only' });
    expect(result).toEqual({ sessionId: 'sess-1', recreated: true });
    expect(calls.at(-1)).toMatchObject({ sessionFile: '/tmp/sess-1.jsonl', chatOnly: true });
    expect(service.isResident('sess-1')).toBe(true);
  });

  it('set_tools：跨出纯聊天边界也要重建（空 runtime 激活无从谈起），激活名单在重建后应用', async () => {
    const first = fakeAgentSession().session; // sess-1
    const chatOnlySession = fakeAgentSession({ sessionId: 'sess-2' }).session;
    (chatOnlySession as { getAllTools: () => unknown[] }).getAllTools = () => [];
    const full = fakeAgentSession({ sessionId: 'sess-3' }).session;
    const runtimes = [first, chatOnlySession, full];
    const calls: Array<{ chatOnly?: boolean; tools?: string[] | undefined }> = [];
    const service = new AgentSessionService({
      createRuntime: async (input) => {
        calls.push({ chatOnly: input.chatOnly, tools: input.tools });
        return fakeRuntime(runtimes[calls.length - 1] ?? full);
      },
      findSessionFile: async () => null,
    });
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    // 进纯聊天：重建，注册名单为空
    await service.send('sess-1', { type: 'set_tools', preset: 'chat-only' });
    expect(calls[1]).toMatchObject({ chatOnly: true, tools: [] });

    // 跨出：当前 runtime 没注册任何工具，必须重建（注册全量）并重建后激活名单
    const result = await service.send('sess-2', { type: 'set_tools', preset: 'read-only' });
    expect(calls[2]).toMatchObject({ chatOnly: false, tools: undefined });
    expect(result).toEqual({ sessionId: 'sess-3', recreated: true });
    expect(full.setActiveToolsByName).toHaveBeenCalledWith(['read', 'grep', 'find', 'ls']);
  });

  it('agent/new 带空 toolNames：直接按纯聊天建会话', async () => {
    const calls: Array<{ chatOnly?: boolean }> = [];
    const service = new AgentSessionService({
      createRuntime: async (input) => {
        calls.push({ chatOnly: input.chatOnly });
        return fakeRuntime(fakeAgentSession().session);
      },
      findSessionFile: async () => null,
    });
    await service.create({ cwd: '/tmp', type: 'ensure_session', toolNames: [] });
    expect(calls[0]).toMatchObject({ chatOnly: true });
  });
});

describe('AgentSessionService：恢复与 cwd 校验（ADR-0013 / docs02 §4.1）', () => {
  it('resume：冷会话找不到文件 → SessionNotFoundError；命中则建 runtime 并登记', async () => {
    const missing = new AgentSessionService({
      createRuntime: async () => fakeRuntime(fakeAgentSession().session),
      findSessionFile: async () => null,
    });
    await expect(missing.resume('nope')).rejects.toBeInstanceOf(SessionNotFoundError);

    const calls: Array<{ sessionFile?: string; cwd: string }> = [];
    const service = new AgentSessionService({
      createRuntime: async (input) => {
        calls.push({ sessionFile: input.sessionFile, cwd: input.cwd });
        return fakeRuntime(fakeAgentSession({ sessionId: 'cold-1' }).session);
      },
      findSessionFile: async (id) =>
        id === 'cold-1' ? { path: '/tmp/cold-1.jsonl', cwd: '/tmp' } : null,
      openSessionManager: () => fakeSessionManager().manager as never,
    });

    const ok = await service.resume('cold-1');
    expect(ok.sessionId).toBe('cold-1');
    expect(calls[0]).toMatchObject({ sessionFile: '/tmp/cold-1.jsonl', cwd: '/tmp' });
    expect(service.isResident('cold-1')).toBe(true);

    // 幂等：已在注册表内不再建 runtime
    const again = await service.resume('cold-1');
    expect(again.sessionId).toBe('cold-1');
    expect(calls).toHaveLength(1);
  });

  it('resume：读回会话自己钉过的工具选择（空名单 ⇒ 纯聊天重建）', async () => {
    const calls: Array<{ chatOnly?: boolean; tools?: string[] }> = [];
    const service = new AgentSessionService({
      createRuntime: async (input) => {
        calls.push({ chatOnly: input.chatOnly, tools: input.tools });
        return fakeRuntime(fakeAgentSession({ sessionId: 'cold-2' }).session);
      },
      findSessionFile: async () => ({ path: '/tmp/cold-2.jsonl', cwd: '/tmp' }),
      openSessionManager: () =>
        ({
          getEntries: () => [
            {
              type: 'custom',
              customType: 'piboat:tool-selection',
              data: { version: 1, tools: [] },
            },
          ],
        }) as never,
    });
    await service.resume('cold-2');
    expect(calls[0]).toMatchObject({ chatOnly: true, tools: [] });
  });

  it('create：cwd 不存在或不是目录 → UserInputError（SDK 不会报错，必须前置拦）', async () => {
    const service = new AgentSessionService({
      createRuntime: async () => fakeRuntime(fakeAgentSession().session),
      findSessionFile: async () => null,
    });
    await expect(
      service.create({ cwd: '/definitely/not/here', type: 'ensure_session' }),
    ).rejects.toThrow(/does not exist/i);
    // 文件但不是目录
    await expect(service.create({ cwd: '/etc/hosts', type: 'ensure_session' })).rejects.toThrow(
      /does not exist/i,
    );
  });

  it('get_session_stats：本进程跑过才带 perf（冷会话不带）', async () => {
    const fake = fakeAgentSession();
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const cold = await service.send('sess-1', { type: 'get_session_stats' });
    expect(cold.perf).toBeUndefined();

    fake.emit({ type: 'agent_start' });
    fake.emit({ type: 'turn_start' });
    fake.emit({ type: 'agent_settled' });
    const warm = await service.send('sess-1', { type: 'get_session_stats' });
    expect(warm.perf).toMatchObject({ rounds: 1, steps: 1 });
    expect(warm.perf?.tokensPerSecond).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// B4：外部写入探测（ADR-0013b）与 transient 列表项
// ---------------------------------------------------------------------------

describe('AgentSessionService：外部写入探测与 transient', () => {
  it('transientInfos：只有尚未落盘的会话（sessionFile 为空）', async () => {
    const withFile = fakeAgentSession();
    const inMemory = fakeAgentSession({ sessionId: 'mem-1', sessionFile: undefined });
    // 两次建会话：第一次落盘（有 sessionFile），第二次只在内存里
    let call = 0;
    const service = new AgentSessionService({
      createRuntime: async () => {
        call += 1;
        return fakeRuntime(call === 1 ? withFile.session : inMemory.session);
      },
      findSessionFile: async () => null,
    });
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const transient = service.transientInfos();
    expect(transient.map((info) => info.id)).toEqual(['mem-1']);
    expect(transient[0]).toMatchObject({ transient: true, cwd: '/tmp', firstMessage: '' });
  });

  it('probeExternalWrite：未登记会话 / 会话文件缺失 → false（不重建）', async () => {
    const service = new AgentSessionService({
      createRuntime: async () => fakeRuntime(fakeAgentSession().session),
      findSessionFile: async () => null,
    });
    expect(await service.probeExternalWrite('nope')).toBe(false);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    // fake 的 sessionFile 指向不存在的路径 ⇒ statFingerprint 返回 null ⇒ 不重建
    expect(await service.probeExternalWrite('sess-1')).toBe(false);
  });

  it('probeExternalWrite：run 期间一律跳过（换掉正在跑的 runtime 会丢流）', async () => {
    const fake = fakeAgentSession();
    const service = new AgentSessionService({
      createRuntime: async () => fakeRuntime(fake.session),
      findSessionFile: async () => null,
    });
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    Object.defineProperty(fake.session, 'isStreaming', { get: () => true, configurable: true });
    expect(await service.probeExternalWrite('sess-1')).toBe(false);
  });
});
