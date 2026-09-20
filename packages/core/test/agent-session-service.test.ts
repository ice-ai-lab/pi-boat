import type {
  AgentSession,
  AgentSessionEvent,
  CreateAgentSessionOptions,
  CreateAgentSessionResult,
} from '@earendil-works/pi-coding-agent';
import type { WireAgentEvent } from '@ice-ai/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentSessionService,
  PromptRejectedError,
  SessionNotFoundError,
} from '../src/agent/agent-session-service';

/**
 * AgentSessionService 命令分发测试：注入 fake createSession 工厂，
 * 不触碰真实 SDK / ~/.pi（真实链路由 demo/chat.ts 验收）。
 */

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
    isBashRunning: false,
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
        sourceInfo: undefined,
      },
      {
        name: 'write',
        description: 'Write a file',
        parameters: { type: 'object' },
        promptGuidelines: undefined,
        sourceInfo: undefined,
      },
    ],
    setActiveToolsByName: vi.fn(),
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
    prompt: vi.fn(async (_text: string, options?: { preflightResult?: (ok: boolean) => void }) => {
      options?.preflightResult?.(true);
    }),
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

function serviceWith(fake: ReturnType<typeof fakeAgentSession>) {
  const service = new AgentSessionService(async () => {
    const result = {
      session: fake.session,
      extensionsResult: {},
    } as unknown as CreateAgentSessionResult;
    return Promise.resolve(result);
  });
  return { service, fake };
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
    expect(service.isRunning('sess-1')).toBe(true);
    expect(service.runningSessionIds()).toEqual(['sess-1']);
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
    expect(s2.runningSessionIds()).toEqual([]);
  });

  it('带 message：create 内部派发 prompt', async () => {
    const { service, fake } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', message: 'hello' });
    expect(fake.session.prompt).toHaveBeenCalledWith('hello', expect.anything());
  });

  it('工厂抛错：上抛且不入注册表', async () => {
    const service = new AgentSessionService(async (_options: CreateAgentSessionOptions) => {
      throw new Error('no auth configured');
    });
    await expect(service.create({ cwd: '/tmp', type: 'ensure_session' })).rejects.toThrow(
      'no auth configured',
    );
    expect(service.runningSessionIds()).toEqual([]);
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
  });

  it('prompt 被拒（preflight false）：抛 PromptRejectedError（错误经 REST 信封回发送方）', async () => {
    const fake = fakeAgentSession({
      prompt: vi.fn(async (_t: string, options?: { preflightResult?: (ok: boolean) => void }) => {
        options?.preflightResult?.(false);
      }),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    await expect(
      service.send('sess-1', { type: 'prompt', message: '/blocked' }),
    ).rejects.toBeInstanceOf(PromptRejectedError);
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

  it('set_tools：走 switch 路径返回 null（冷会话重建路径 M2 归 server）', async () => {
    const { service, fake } = serviceWith(fakeAgentSession());
    await service.create({ cwd: '/tmp', type: 'ensure_session' });
    const result = await service.send('sess-1', { type: 'set_tools', toolNames: ['read'] });
    expect(result).toBeNull();
    expect(fake.session.setActiveToolsByName).toHaveBeenCalledWith(['read']);
  });

  it('命令串行化：同会话 FIFO（前一个未完成时后一个排队）', async () => {
    let releasePrompt: () => void = () => {};
    const gate = new Promise<void>((r) => {
      releasePrompt = r;
    });
    const order: string[] = [];
    const fake = fakeAgentSession({
      prompt: vi.fn(async (_t: string, options?: { preflightResult?: (ok: boolean) => void }) => {
        order.push('prompt-start');
        await gate;
        order.push('prompt-end');
        options?.preflightResult?.(true);
      }),
    });
    const { service } = serviceWith(fake);
    await service.create({ cwd: '/tmp', type: 'ensure_session' });

    const p1 = service.send('sess-1', { type: 'prompt', message: 'a' });
    const p2 = service.send('sess-1', { type: 'get_state' }).then((s) => {
      order.push(`state(${s.sessionId})`);
      return s;
    });
    // get_state 在 prompt 完成前不得插队
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(['prompt-start']);
    releasePrompt();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['prompt-start', 'prompt-end', 'state(sess-1)']);
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
    const v0 = service.sessionListVersion;
    const events: WireAgentEvent[] = [];
    service.subscribe('sess-1', (e) => events.push(e));

    service.disposeSession('sess-1', 'idle');
    expect(events.map((e) => e.type)).toEqual(['connected', 'session_shutdown']);
    expect(service.isRunning('sess-1')).toBe(false);
    expect(service.sessionListVersion).toBe(v0 + 1);
    await expect(service.send('sess-1', { type: 'abort' })).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });
});
