import {
  type AgentSessionService,
  type ConfigService,
  InvalidScopeEditError,
  LastModelRejectionError,
  type ProjectReadService,
  PromptRejectedError,
  type ResourceService,
  type SessionListOptions,
  SessionNotFoundError,
  type SessionReadService,
  SkillInstallError,
  SystemAccessError,
  type SystemService,
  UserInputError,
} from '@ice-ai/core';
import type { AgentCommand, SessionContextQuery, WireAgentEvent } from '@ice-ai/protocol';
import { describe, expect, it, vi } from 'vitest';
import { createAgentServer } from '../src/server';
import { closeAllAgentEventStreams } from '../src/sse';

/**
 * M1 路由测试：注入 fake core 服务（docs/04 §2 DI 的存在意义），
 * 用 Hono app.request() 走全链路（安全中间件 → 校验 → 路由 → 信封）。
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

/** app.request 的 Request 不自动携带 Host（HTTP/1.1 真实请求恒有），测试统一补上 */
function request(app: ReturnType<typeof makeApp>['app'], path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('host')) headers.set('host', '127.0.0.1:9527');
  return app.request(path, { ...init, headers });
}

// ---------------------------------------------------------------------------
// fake core 服务（只实现路由面用到的方法；subscribe 模仿 core late-join 时序）
// ---------------------------------------------------------------------------

type Listener = (event: WireAgentEvent) => void;

function fakeAgentService() {
  const listeners = new Map<string, Set<Listener>>();
  const running = new Set<string>(['sess-live']);
  let seq = 0;
  const service = {
    create: vi.fn(async () => ({
      success: true,
      data: null,
      sessionId: 'sess-new',
      model: { provider: 'anthropic', modelId: 'claude-test' },
      thinkingLevel: 'medium' as const,
    })),
    send: vi.fn(async (id: string, _command: AgentCommand) => ({ sessionId: id })),
    resume: vi.fn(async (id: string) => {
      if (!running.has(id)) throw new SessionNotFoundError(id);
      return {
        success: true,
        data: null,
        sessionId: id,
        model: { provider: 'anthropic', modelId: 'claude-test' },
        thinkingLevel: 'medium' as const,
      };
    }),
    subscribe: vi.fn((id: string, listener: Listener) => {
      // 模仿 core 时序：注册 → connected{lastSeq}（§5.2；快照 message_start 场景略）
      const set = listeners.get(id) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(id, set);
      seq += 1;
      listener({ type: 'connected', sessionId: id, isStreaming: false, lastSeq: seq, seq });
      return () => set.delete(listener);
    }),
    getRunningState: (id: string) =>
      running.has(id) ? { running: true, state: { sessionId: id } } : { running: false },
    isRunning: (id: string) => running.has(id),
    runningSessionIds: () => [...running],
    registryVersion: 7,
    disposeAll: vi.fn(),
    transientInfos: vi.fn(() => []),
    probeExternalWrite: vi.fn(async () => false),
    /** 测试驱动：向某会话的全部订阅者广播事件（seq 由本 fake 重排） */
    emit: (id: string, event: WireAgentEvent) => {
      seq += 1;
      for (const listener of listeners.get(id) ?? []) listener({ ...event, seq });
    },
  };
  return service as unknown as AgentSessionService & { emit: typeof service.emit };
}

function fakeReadService() {
  // B4 新增面（export / auto-name / thinking / revision）——路由层只验校验与错误映射
  const info = {
    path: '/tmp/s1.jsonl',
    id: 'sess-disk',
    cwd: '/tmp',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    messageCount: 2,
    firstMessage: 'hello',
  };
  const service = {
    list: vi.fn(async (_options?: SessionListOptions) => [info]),
    listFingerprint: vi.fn(async () => 'fp-test'),
    search: vi.fn(async () => [info]),
    searchDetailed: vi.fn(async () => ({
      results: [
        {
          session: info,
          entryId: null,
          blockIndex: null,
          before: '',
          match: 'hello',
          after: '',
        },
      ],
      truncated: false,
    })),
    detail: vi.fn(async (id: string) =>
      id === 'sess-disk'
        ? {
            sessionId: id,
            filePath: '/tmp/s1.jsonl',
            info: {
              path: '/tmp/s1.jsonl',
              id,
              cwd: '/tmp',
              created: '2026-01-01T00:00:00.000Z',
              modified: '2026-01-01T00:00:00.000Z',
              messageCount: 2,
              firstMessage: 'hello',
            },
            leafId: null,
            tree: [],
            context: {
              messages: [],
              entryIds: [],
              thinkingLevel: 'medium',
              model: null,
              hasMore: false,
            },
            stats: {
              sessionId: id,
              userMessages: 1,
              assistantMessages: 1,
              toolCalls: 0,
              toolResults: 0,
              totalMessages: 2,
              tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              cost: 0,
            },
            totalActiveMs: 0,
          }
        : null,
    ),
    revision: vi.fn(async (id: string) => (id === 'sess-disk' ? '12:34' : null)),
    referencedPaths: vi.fn(async (id: string) =>
      id === 'sess-disk' ? ['/outside/ref.png'] : null,
    ),
    exportHtml: vi.fn(async (id: string) =>
      id === 'sess-disk' ? '<html><body>ok</body></html>' : null,
    ),
    thinking: vi.fn(async (_id: string, entryId: string) =>
      entryId === 'e1' ? { thinking: '推理全文' } : null,
    ),
    autoName: vi.fn(async (id: string) => (id === 'sess-disk' ? { title: '自动命名' } : null)),
    context: vi.fn(async (id: string, _q: SessionContextQuery) =>
      id === 'sess-disk'
        ? { messages: [], entryIds: [], thinkingLevel: 'medium', model: null, hasMore: false }
        : null,
    ),
    rename: vi.fn(async (id: string, name: string) => {
      if (id !== 'sess-disk') return null;
      if (name.trim() === '') throw new UserInputError('Session name cannot be blank');
      return info;
    }),
    delete: vi.fn(async (id: string) => (id === 'sess-disk' ? [id, 'sess-child'] : null)),
    toolResultImage: vi.fn(async (id: string, entryId: string, blockIndex: number) => {
      if (id !== 'sess-disk' || entryId !== 'e1' || blockIndex !== 0) return null;
      // 1x1 PNG（最小合法位图）
      return {
        data: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
          'base64',
        ),
        mimeType: 'image/png',
      };
    }),
  };
  return service as unknown as SessionReadService;
}

function fakeProjectService() {
  const service = {
    listProjects: vi.fn(async (_options?: { force?: boolean }) => ({
      projects: [
        {
          projectKey: '/tmp',
          projectRoot: '/tmp',
          cwd: '/tmp',
          cwds: ['/tmp'],
          sessionCount: 1,
          lastModified: '2026-01-01T00:00:00.000Z',
          isGit: false,
        },
      ],
      listFingerprint: 'fp-test',
    })),
  };
  return service as unknown as ProjectReadService;
}

/** 模型域 fake：路由层只做校验与错误映射（真实语义归 core 单测） */
function fakeConfigService() {
  const enabledResponse = {
    patterns: ['anthropic/claude-*'],
    models: [{ id: 'claude-x', name: 'Claude X', provider: 'anthropic', input: ['text'] }],
    scope: 'global' as const,
    settingsPath: '/tmp/agent/settings.json',
    canWrite: true,
    warnings: [],
  };
  return {
    models: vi.fn(async () => ({
      models: { 'anthropic:claude-x': 'Claude X' },
      modelList: enabledResponse.models,
      defaultModel: { provider: 'anthropic', modelId: 'claude-x' },
      defaultThinkingLevel: 'medium' as const,
      thinkingLevels: { 'anthropic:claude-x': ['off', 'high'] },
      thinkingLevelMaps: {},
      thinkingLevelPins: {},
    })),
    readConfig: vi.fn(() => ({ modelsPath: '/tmp/agent/models.json', config: { providers: {} } })),
    writeConfig: vi.fn(() => ({ modelsPath: '/tmp/agent/models.json' })),
    discover: vi.fn(async () => ({ models: [{ id: 'm1', name: 'M1' }] })),
    testModel: vi.fn(async () => ({ ok: true, latencyMs: 12, text: 'ok' })),
    catalog: vi.fn(async () => ({ models: [] })),
    enabled: vi.fn(async () => enabledResponse),
    updateEnabled: vi.fn(async (_cwd: string, input: { providerId?: string }) => {
      if (input.providerId === 'last') {
        throw new LastModelRejectionError();
      }
      return enabledResponse;
    }),
    refresh: vi.fn(async () => ({ ok: true, changed: false })),
  };
}

/** 系统域 fake：路由层只验校验/鉴权映射（真实语义归 core 单测） */
function fakeSystemService() {
  const allowed = (path: string) => path.startsWith('/repo');
  return {
    home: vi.fn(() => '/home/tester'),
    defaultCwd: vi.fn(async () => '/home/tester/pi-cwd-20260215'),
    browseCwd: vi.fn(async (path?: string) =>
      path === '/nope'
        ? null
        : {
            path: path ?? '/home/tester',
            parentPath: '/home',
            directories: [{ name: 'repo', path: '/home/tester/repo', readable: true }],
          },
    ),
    validateCwd: vi.fn(async (cwd: string) =>
      cwd === '/repo'
        ? { success: true, cwd, projectRoot: cwd, projectKey: cwd }
        : { success: false, cwd, projectRoot: cwd, projectKey: '' },
    ),
    listDirectory: vi.fn(async (path: string) =>
      path.startsWith('/repo')
        ? {
            path,
            entries: [{ name: 'a.ts', path: `${path}/a.ts`, type: 'file' as const, size: 3 }],
          }
        : null,
    ),
    // 模仿 PathGuard：roots 内直接放行；roots 之外需要会话引用命中
    meta: vi.fn(async (path: string, references: string[] = []) =>
      path.startsWith('/repo') || references.includes(path)
        ? {
            path,
            type: 'file' as const,
            size: 3,
            modified: '2026-02-15T10:00:00.000Z',
            category: 'text' as const,
          }
        : null,
    ),
    readFile: vi.fn(async (path: string, references: string[] = []) =>
      path.startsWith('/repo') || references.includes(path)
        ? { data: Buffer.from('abc'), mimeType: 'text/plain', name: 'a.ts' }
        : null,
    ),
    checkUploadConflicts: vi.fn(async (_dir: string, names: string[]) =>
      names.map((name) => ({ name, exists: name === 'exists.txt' })),
    ),
    saveUpload: vi.fn(async (_dir: string, name: string, data: Uint8Array, policy: string) => {
      if (name === 'skip.txt' && policy === 'skip') return { skipped: name };
      return { path: `/repo/${name}`, size: data.byteLength, finalName: name };
    }),
    fileIndex: vi.fn(async (cwd: string, q?: string) => {
      if (!allowed(cwd)) throw new SystemAccessError();
      return { files: q === undefined ? ['a.ts', 'b/c.ts'] : ['a.ts'], truncated: false };
    }),
    gitStatus: vi.fn(async (cwd: string) =>
      allowed(cwd)
        ? {
            isGitRepository: true,
            repositoryRoot: '/repo',
            branch: 'main',
            files: [{ path: 'a.ts', kind: 'modified' as const, staged: false }],
            additions: 1,
            deletions: 2,
          }
        : {
            isGitRepository: false,
            repositoryRoot: null,
            branch: null,
            files: [],
            additions: 0,
            deletions: 0,
          },
    ),
    gitDiff: vi.fn(async (_cwd: string, path: string, _staged: boolean) =>
      path === 'a.ts'
        ? { supported: true, status: 'modified' as const, patch: '@@ -1 +1 @@' }
        : { supported: false, reason: 'file-not-changed' },
    ),
    worktrees: vi.fn(async (cwd: string) => ({
      projectRoot: '/repo',
      projectKey: '/repo',
      isGit: allowed(cwd),
      isTopLevel: true,
      currentWorktreePath: '/repo',
      worktrees: allowed(cwd)
        ? [{ path: '/repo', branch: 'main', head: 'abc12345', bare: false, current: true }]
        : [],
    })),
    createWorktree: vi.fn(async (_cwd: string, branch: string) => ({
      path: `/repo.worktrees/${branch}`,
      branch,
    })),
    removeWorktree: vi.fn(async (_cwd: string, path: string, force: boolean) =>
      !force && path === '/dirty' ? { dirty: ['a.ts'] } : null,
    ),
  };
}

function fakeResourceService() {
  return {
    trust: vi.fn((cwd: string) => ({ requiresTrust: true, trusted: cwd === '/trusted' })),
    setTrust: vi.fn((cwd: string, trusted: boolean, active: boolean) => {
      if (active) return { rejection: 'session-active' as const };
      if (trusted && cwd === '/nothing') return { rejection: 'no-trusted-resources' as const };
      return { response: { requiresTrust: true, trusted } };
    }),
    skills: vi.fn(async () => ({ skills: [], diagnostics: [], projectResourcesLoaded: true })),
    patchSkill: vi.fn(async (_input: unknown) => {
      throw new InvalidScopeEditError('Unknown skill: nope');
    }),
    searchSkills: vi.fn(async (query: string) => ({
      results: [{ package: query, installs: 1, url: 'https://npm' }],
    })),
    installSkill: vi.fn(async (input: { package: string }) => {
      if (input.package === 'bad') throw new SkillInstallError('registry unreachable');
      return { skills: [], diagnostics: [], projectResourcesLoaded: true };
    }),
    checkSkillUpdates: vi.fn(async () => ({ results: [] })),
    updateSkills: vi.fn(async () => ({ results: [] })),
    plugins: vi.fn(async () => ({
      packages: [],
      standaloneExtensions: [],
      totals: { packages: 0, extensions: 0, skills: 0 },
      diagnostics: [],
      projectResourcesLoaded: true,
    })),
    pluginAction: vi.fn(async () => ({
      packages: [],
      standaloneExtensions: [],
      totals: { packages: 0, extensions: 0, skills: 0 },
      diagnostics: [],
      projectResourcesLoaded: true,
    })),
    checkPluginUpdates: vi.fn(async () => ({ results: [] })),
    toolSettings: vi.fn(async () => ({ isWindows: false, powerShellEnabled: false })),
    updateToolSettings: vi.fn(async (_cwd: string, enabled: boolean) => ({
      isWindows: process.platform === 'win32',
      powerShellEnabled: enabled,
    })),
  };
}

function makeApp() {
  const agentService = fakeAgentService();
  const readService = fakeReadService();
  const projectService = fakeProjectService();
  const configService = fakeConfigService();
  const systemService = fakeSystemService();
  const resourceService = fakeResourceService();
  const app = createAgentServer({
    agentService,
    readService,
    projectService,
    configService: configService as unknown as ConfigService,
    systemService: systemService as unknown as SystemService,
    resourceService: resourceService as unknown as ResourceService,
  });
  return {
    app,
    agentService,
    readService,
    projectService,
    configService,
    systemService,
    resourceService,
  };
}

// ---------------------------------------------------------------------------
// 安全层（docs/04 §6、ADR-0007）
// ---------------------------------------------------------------------------

describe('安全层（docs/04 §6）', () => {
  it('health 可访问（Electron 健康检查）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/health');
    expect(res.status).toBe(200);
    // piVersion 是运行时读数（core 从 SDK VERSION 取），只断言形状
    const body = (await res.json()) as { ok: boolean; name: string; piVersion: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe('piboat-server');
    expect(body.piVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('异常 Host（DNS 重绑定）→ 403', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/sessions', {
      headers: { host: 'evil.example.com:9527' },
    });
    expect(res.status).toBe(403);
  });

  it('白名单外 Origin → 403（Origin 校验不可关）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/sessions', {
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(403);
  });

  it('Sec-Fetch-Site: cross-site → 403（挡无 Origin 的跨站子资源请求，ADR-0007）', async () => {
    const { app } = makeApp();
    // 模拟 <img>/<script> 型请求：无 Origin，但有 Sec-Fetch-*
    const res = await request(app, '/api/sessions', {
      headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' },
    });
    expect(res.status).toBe(403);
  });

  it('同源 / dev web（同主机名跨源 same-site）/ 无 Sec-Fetch-* 头（curl）→ 放行', async () => {
    const { app } = makeApp();
    const sameOrigin = await request(app, '/api/sessions', {
      headers: {
        host: '127.0.0.1:9527',
        origin: 'http://127.0.0.1:9527',
        'sec-fetch-site': 'same-origin',
      },
    });
    expect(sameOrigin.status).toBe(200);
    const dev = await request(app, '/api/sessions', {
      headers: { origin: 'http://localhost:9528', 'sec-fetch-site': 'same-site' },
    });
    expect(dev.status).toBe(200);
    // CORS 头与 Origin 校验共用同一份白名单（security.ts 单一来源，防两份漂移）
    expect(dev.headers.get('access-control-allow-origin')).toBe('http://localhost:9528');
    expect((await request(app, '/api/sessions')).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 命令通道信封（docs/04 §4）
// ---------------------------------------------------------------------------

describe('POST /api/agent/:id 命令通道', () => {
  const post = (app: ReturnType<typeof makeApp>['app'], body: unknown) =>
    request(app, '/api/agent/sess-live', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });

  it('正常命令 → 200 {success:true, data}', async () => {
    const { app, agentService } = makeApp();
    const res = await post(app, { type: 'get_state' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { sessionId: 'sess-live' } });
    expect(agentService.send).toHaveBeenCalledOnce();
  });

  it('未知命令 type → 400（区别于 404）；缺 type / 非法 JSON 同为 400', async () => {
    const { app } = makeApp();
    const unknown = await post(app, { type: 'no_such_command' }); // 未登记的命令字面量
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: expect.stringContaining('command') });

    // B2 起 fork 是合法命令：不再被「未知 type」挡下（fake service 一律 200）
    const fork = await post(app, { type: 'fork', entryId: 'e1' });
    expect(fork.status).not.toBe(400);

    const noType = await post(app, { message: 'hi' });
    expect(noType.status).toBe(400);

    const bad = await request(app, '/api/agent/sess-live', {
      method: 'POST',
      headers: { ...JSON_HEADERS },
      body: 'not json',
    });
    expect(bad.status).toBe(400);
  });

  it('参数不过 schema → 400（prompt 空消息）', async () => {
    const { app } = makeApp();
    expect((await post(app, { type: 'prompt', message: '' })).status).toBe(400);
  });

  it('SessionNotFoundError → 404 CommandError', async () => {
    const { app, agentService } = makeApp();
    (agentService.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new SessionNotFoundError('sess-x'),
    );
    const res = await post(app, { type: 'abort' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Session not found: sess-x' });
  });

  it('PromptRejectedError → 400 + code + accepted:false', async () => {
    const { app, agentService } = makeApp();
    (agentService.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new PromptRejectedError(),
    );
    const res = await post(app, { type: 'prompt', message: '/blocked' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Prompt rejected',
      code: 'prompt_rejected',
      accepted: false,
    });
  });

  it('UserInputError → 400；未知异常 → 500 且不泄漏内部信息', async () => {
    const { app, agentService } = makeApp();
    (agentService.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new UserInputError('bad input'),
    );
    const bad = await post(app, { type: 'abort' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'bad input' });

    (agentService.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('secret /home/user path leak'),
    );
    const boom = await post(app, { type: 'abort' });
    expect(boom.status).toBe(500);
    expect(await boom.json()).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/agent/:id/resume（ADR-0013）', () => {
  it('冷会话 → 404；注册表内会话 → 200 NewSessionOk 形状', async () => {
    const { app } = makeApp();
    const cold = await request(app, '/api/agent/nope/resume', { method: 'POST' });
    expect(cold.status).toBe(404);

    const warm = await request(app, '/api/agent/sess-live/resume', { method: 'POST' });
    expect(warm.status).toBe(200);
    expect(await warm.json()).toMatchObject({ success: true, sessionId: 'sess-live' });
  });

  it('必须是 POST：GET 该路径不被路由（GET 不得有副作用，ADR-0007）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/agent/sess-live/resume');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/agent/new', () => {
  it('合法 body → NewSessionOk 扩展信封', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/agent/new', {
      method: 'POST',
      headers: { ...JSON_HEADERS },
      body: JSON.stringify({ cwd: '/tmp' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, sessionId: 'sess-new' });
  });

  it('provider/modelId 不成对 → 400', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/agent/new', {
      method: 'POST',
      headers: { ...JSON_HEADERS },
      body: JSON.stringify({ cwd: '/tmp', provider: 'anthropic' }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 轻查 / 轮询 / 浏览路由
// ---------------------------------------------------------------------------

describe('轻查与浏览路由', () => {
  it('GET /api/agent/:id 轻查（未运行不报错）', async () => {
    const { app } = makeApp();
    const live = await request(app, '/api/agent/sess-live');
    expect(await live.json()).toEqual({ running: true, state: { sessionId: 'sess-live' } });
    const cold = await request(app, '/api/agent/sess-x');
    expect(await cold.json()).toEqual({ running: false });
  });

  it('GET /api/agent/running：registryVersion + runningSessionIds + 恒空抑制列表', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/agent/running');
    expect(await res.json()).toEqual({
      registryVersion: 7,
      runningSessionIds: ['sess-live'],
      completionNotificationSuppressedSessionIds: [],
    });
  });

  it('GET /api/sessions：磁盘扫描 + 注册表合并字段（force 忽略）', async () => {
    const { app, readService } = makeApp();
    const res = await request(app, '/api/sessions?force=1');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      registryVersion: 7,
      listFingerprint: 'fp-test',
      runningSessionIds: ['sess-live'],
      sessions: [{ id: 'sess-disk' }],
    });
    // force=1 不再被忽略：交给 core 跳过列表缓存（ADR-0008）
    expect(readService.list).toHaveBeenCalledWith({
      force: true,
      projectKey: undefined,
      summary: false,
      transient: [],
    });
  });

  it('GET /api/sessions?projectKey：透传给 core 的项目过滤；非法 force 值 → 400', async () => {
    const { app, readService } = makeApp();
    const filtered = await request(app, '/api/sessions?projectKey=%2Frepo');
    expect(filtered.status).toBe(200);
    expect(readService.list).toHaveBeenCalledWith({
      force: false,
      projectKey: '/repo',
      summary: false,
      transient: [],
    });
    // summary=1：快路径透传（跳过 core 的项目解析）
    await request(app, '/api/sessions?summary=1');
    expect(readService.list).toHaveBeenLastCalledWith({
      force: false,
      projectKey: undefined,
      summary: true,
      transient: [],
    });

    const bad = await request(app, '/api/sessions?force=true');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: expect.stringContaining('force') });
  });

  it('GET /api/projects：项目清单 + listFingerprint；force=1 透传', async () => {
    const { app, projectService } = makeApp();
    const res = await request(app, '/api/projects');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      listFingerprint: 'fp-test',
      projects: [{ projectKey: '/tmp', cwd: '/tmp', sessionCount: 1, isGit: false }],
    });
    expect(projectService.listProjects).toHaveBeenCalledWith({ force: false });

    await request(app, '/api/projects?force=1');
    expect(projectService.listProjects).toHaveBeenCalledWith({ force: true });
  });

  it('GET /api/sessions/search：q 缺省 → 400；超长 → 400；合法 → 200', async () => {
    const { app } = makeApp();
    expect((await request(app, '/api/sessions/search')).status).toBe(400);
    const long = await request(app, `/api/sessions/search?q=${'a'.repeat(201)}`);
    expect(long.status).toBe(400);
    expect((await request(app, '/api/sessions/search?q=hello')).status).toBe(200);
  });

  it('GET /api/sessions/:id：详情 404 vs 200', async () => {
    const { app } = makeApp();
    expect((await request(app, '/api/sessions/sess-disk')).status).toBe(200);
    expect((await request(app, '/api/sessions/nope')).status).toBe(404);
  });

  it('GET /api/sessions/:id/state：文件不存在 → 404；存在但未运行 → {running:false}', async () => {
    const { app } = makeApp();
    const missing = await request(app, '/api/sessions/nope/state');
    expect(missing.status).toBe(404);
    const cold = await request(app, '/api/sessions/sess-disk/state');
    expect(cold.status).toBe(200);
    expect(await cold.json()).toEqual({ running: false });
  });

  it('GET /api/sessions/:id/context：tail/deferMedia 收敛 + 非法值 400 + 不存在 404', async () => {
    const { app } = makeApp();
    const ok = await request(app, '/api/sessions/sess-disk/context?tail=30&deferMedia=1');
    expect(ok.status).toBe(200);
    const bad = await request(app, '/api/sessions/sess-disk/context?tail=abc');
    expect(bad.status).toBe(400);
    const missing = await request(app, '/api/sessions/nope/context');
    expect(missing.status).toBe(404);
  });

  it('PATCH /api/sessions/:id：运行中 409；成功 {success,data}；空白名 400；不存在 404', async () => {
    const { app } = makeApp();
    const patch = (body: unknown, id = 'sess-disk') =>
      request(app, `/api/sessions/${id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });

    expect((await patch({ name: 'n' }, 'sess-live')).status).toBe(409);
    const ok = await patch({ name: 'new name' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ success: true, data: { id: 'sess-disk' } });
    expect((await patch({ name: '   ' })).status).toBe(400);
    expect((await patch({ name: 'x' }, 'nope')).status).toBe(404);
  });

  it('DELETE /api/sessions/:id：运行中 409；级联返回 deletedIds；不存在 404', async () => {
    const { app } = makeApp();
    const running = await request(app, '/api/sessions/sess-live', { method: 'DELETE' });
    expect(running.status).toBe(409);
    const ok = await request(app, '/api/sessions/sess-disk', { method: 'DELETE' });
    expect(await ok.json()).toEqual({ deletedIds: ['sess-disk', 'sess-child'] });
    expect((await request(app, '/api/sessions/nope', { method: 'DELETE' })).status).toBe(404);
  });

  it('GET .../tool-result-image：二进制直发 + nosniff；blockIndex 非法 400；无此块 404', async () => {
    const { app } = makeApp();
    const ok = await request(
      app,
      '/api/sessions/sess-disk/entries/e1/tool-result-image?blockIndex=0',
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const badIndex = await request(
      app,
      '/api/sessions/sess-disk/entries/e1/tool-result-image?blockIndex=-1',
    );
    expect(badIndex.status).toBe(400);

    const missing = await request(
      app,
      '/api/sessions/sess-disk/entries/e1/tool-result-image?blockIndex=5',
    );
    expect(missing.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// SSE 事件流（docs/04 §5）
// ---------------------------------------------------------------------------

describe('会话域 B4 路由（docs/02 §6.2/§6.3、ADR-0013b）', () => {
  it('GET /api/sessions/:id/revision：指纹 200 / 未知会话 404', async () => {
    const { app } = makeApp();
    const ok = await request(app, '/api/sessions/sess-disk/revision');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ revision: '12:34' });
    expect((await request(app, '/api/sessions/nope/revision')).status).toBe(404);
  });

  it('GET /api/sessions/:id/export：text/html + 下载头（inline=1 改内联）；未知 404', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/sessions/sess-disk/export');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('<html>');

    const inline = await request(app, '/api/sessions/sess-disk/export?inline=1');
    expect(inline.headers.get('content-disposition')).toContain('inline');

    expect((await request(app, '/api/sessions/nope/export')).status).toBe(404);
  });

  it('POST /api/sessions/:id/auto-name：dryRun 透传 + 未知会话 404', async () => {
    const { app, readService } = makeApp();
    const res = await request(app, '/api/sessions/sess-disk/auto-name', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ dryRun: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: '自动命名' });
    expect(readService.autoName).toHaveBeenCalledWith('sess-disk', {
      cwd: undefined,
      persist: false,
    });
    expect((await request(app, '/api/sessions/nope/auto-name', { method: 'POST' })).status).toBe(
      404,
    );
  });

  it('GET .../thinking：blockIndex 非法 → 400；无此块 → 404；命中 → {thinking}', async () => {
    const { app } = makeApp();
    expect(
      (await request(app, '/api/sessions/sess-disk/entries/e1/thinking?blockIndex=x')).status,
    ).toBe(400);
    expect(
      (await request(app, '/api/sessions/sess-disk/entries/e2/thinking?blockIndex=0')).status,
    ).toBe(404);
    const ok = await request(app, '/api/sessions/sess-disk/entries/e1/thinking?blockIndex=0');
    expect(await ok.json()).toEqual({ thinking: '推理全文' });
  });

  it('GET /api/sessions/:id?force=1：外部写入探测 → wrapperRebuilt', async () => {
    const { app, agentService } = makeApp();
    const plain = await request(app, '/api/sessions/sess-disk');
    expect(await plain.json()).not.toHaveProperty('wrapperRebuilt');
    expect(agentService.probeExternalWrite).not.toHaveBeenCalled();

    (
      agentService as unknown as { probeExternalWrite: ReturnType<typeof vi.fn> }
    ).probeExternalWrite.mockResolvedValueOnce(true);
    const forced = await request(app, '/api/sessions/sess-disk?force=1');
    expect(agentService.probeExternalWrite).toHaveBeenCalledWith('sess-disk');
    expect(await forced.json()).toMatchObject({ wrapperRebuilt: true });
  });
});

describe('GET /api/agent/:id/events（SSE）', () => {
  it('冷会话 → 404（不自动拉起，§5.3 条件 3）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/agent/sess-x/events');
    expect(res.status).toBe(404);
  });

  it('建流无需凭据（ADR-0007：票据层已删）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/agent/sess-live/events');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    void res.body?.cancel();
  });

  it('建流同样受三闸保护：跨站 → 403，异常 Host → 403', async () => {
    const { app } = makeApp();
    const crossSite = await request(app, '/api/agent/sess-live/events', {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(crossSite.status).toBe(403);
    const badHost = await request(app, '/api/agent/sess-live/events', {
      headers: { host: 'evil.example.com:9527' },
    });
    expect(badHost.status).toBe(403);
  });

  it('建流时序与帧格式：注释帧 → connected → 增量带 id: seq；session_shutdown → 关流', async () => {
    const { app, agentService } = makeApp();
    const res = await request(app, '/api/agent/sess-live/events');
    expect(res.status).toBe(200);

    // 建流后 core 广播增量（subscribe 已在 ReadableStream.start 内同步完成）
    agentService.emit('sess-live', { type: 'agent_settled', seq: 0 });
    agentService.emit('sess-live', { type: 'queue_update', steering: [], followUp: [], seq: 0 });
    // dispose 路径：shutdown 帧送达后 graceful 关流
    agentService.emit('sess-live', { type: 'session_shutdown', reason: 'server_shutdown', seq: 0 });

    const text = await new Response(res.body).text();
    expect(text.startsWith(':\n\n')).toBe(true); // 首帧为注释（强制冲刷，§5.1）
    expect(/id: 1\ndata: .*"type":"connected"/.test(text)).toBe(true);
    expect(/id: 2\ndata: .*"type":"agent_settled"/.test(text)).toBe(true);
    expect(/id: 3\ndata: .*"type":"queue_update"/.test(text)).toBe(true);
    expect(/"type":"session_shutdown"/.test(text)).toBe(true);
  });

  it('closeAllAgentEventStreams：进程关停硬断（§5.4）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/agent/sess-live/events');
    const stream = res.body;
    if (stream === null) throw new Error('SSE 响应缺少 body');
    const reader = stream.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(':\n\n');
    closeAllAgentEventStreams();
    await expect(reader.read()).rejects.toThrow(/shutting down/);
  });
});

// ---------------------------------------------------------------------------
// 模型域路由（docs/02 §6.4、ADR-0011）
// ---------------------------------------------------------------------------

describe('模型域路由', () => {
  it('GET /api/models：只读快照（含 thinkingLevels / defaultModel）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/models?cwd=/tmp');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      defaultModel: { provider: 'anthropic', modelId: 'claude-x' },
      thinkingLevels: { 'anthropic:claude-x': ['off', 'high'] },
    });
  });

  it('GET /api/models：cwd 不存在 / 不是目录 → 400', async () => {
    const { app } = makeApp();
    expect((await request(app, '/api/models?cwd=/nope/nope')).status).toBe(400);
    expect((await request(app, `/api/models?cwd=${encodeURIComponent('/etc/hosts')}`)).status).toBe(
      400,
    );
  });

  it('GET/PUT /api/models-config：原文读写；body 不是对象 → 400', async () => {
    const { app, configService } = makeApp();
    const read = await request(app, '/api/models-config');
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ modelsPath: expect.stringContaining('models.json') });

    const put = await request(app, '/api/models-config', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ config: { providers: {} } }),
    });
    expect(put.status).toBe(200);
    expect(configService.writeConfig).toHaveBeenCalledTimes(1);

    const bad = await request(app, '/api/models-config', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ config: 'nope' }),
    });
    expect(bad.status).toBe(400);
  });

  it('POST /api/models-config/discover：校验 provider 草稿；缺 baseUrl → 400', async () => {
    const { app } = makeApp();
    const ok = await request(app, '/api/models-config/discover', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        providerName: 'p',
        provider: { baseUrl: 'http://x', api: 'openai-completions' },
      }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ models: [{ id: 'm1' }] });

    const bad = await request(app, '/api/models-config/discover', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ providerName: 'p', provider: { api: 'x' } }),
    });
    expect(bad.status).toBe(400);
  });

  it('POST /api/models-config/test：model.id 必填', async () => {
    const { app } = makeApp();
    const ok = await request(app, '/api/models-config/test', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        providerName: 'p',
        provider: { baseUrl: 'http://x', api: 'openai-completions' },
        model: { id: 'm' },
      }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, latencyMs: 12 });

    const bad = await request(app, '/api/models-config/test', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        providerName: 'p',
        provider: { baseUrl: 'http://x', api: 'openai-completions' },
        model: {},
      }),
    });
    expect(bad.status).toBe(400);
  });

  it('GET /api/models-config/catalog：透传 q', async () => {
    const { app, configService } = makeApp();
    expect((await request(app, '/api/models-config/catalog?q=gpt')).status).toBe(200);
    expect(configService.catalog).toHaveBeenCalledWith('gpt');
  });

  it('GET /api/models/enabled：只读范围（scope / canWrite / settingsPath）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/models/enabled?cwd=/tmp');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      patterns: ['anthropic/claude-*'],
      scope: 'global',
      canWrite: true,
    });
  });

  it('PUT /api/models/enabled：最后一个模型 → 409 reason=last-model', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/models/enabled', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/tmp', providerId: 'last', modelId: 'm', enabled: false }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: 'last-model' });

    const ok = await request(app, '/api/models/enabled', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/tmp', providerId: 'p', modelId: 'm', enabled: true }),
    });
    expect(ok.status).toBe(200);
  });

  it('POST /api/models/refresh：空 body 合法（缺省刷全部）', async () => {
    const { app, configService } = makeApp();
    const res = await request(app, '/api/models/refresh', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(configService.refresh).toHaveBeenCalledWith({});
  });
});

// ---------------------------------------------------------------------------
// 系统域路由（docs/02 §6.6 / §6.7）
// ---------------------------------------------------------------------------

describe('系统域路由', () => {
  it('GET /api/home、POST /api/default-cwd', async () => {
    const { app } = makeApp();
    expect(await (await request(app, '/api/home')).json()).toEqual({ home: '/home/tester' });
    const cwd = await request(app, '/api/default-cwd', { method: 'POST' });
    expect(await cwd.json()).toMatchObject({ cwd: expect.stringContaining('pi-cwd-') });
  });

  it('GET /api/cwd/browse：缺省家目录；不存在 → 404', async () => {
    const { app } = makeApp();
    expect((await request(app, '/api/cwd/browse')).status).toBe(200);
    expect((await request(app, '/api/cwd/browse?path=/nope')).status).toBe(404);
  });

  it('POST /api/cwd/validate：success:false 也是 200（业务结果而非传输错误）', async () => {
    const { app } = makeApp();
    const ok = await request(app, '/api/cwd/validate', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/repo' }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ success: true, projectKey: '/repo' });

    const bad = await request(app, '/api/cwd/validate', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/nope' }),
    });
    expect(bad.status).toBe(200);
    expect(await bad.json()).toMatchObject({ success: false });

    expect(
      (
        await request(app, '/api/cwd/validate', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: '{}',
        })
      ).status,
    ).toBe(400);
  });

  it('GET /api/files/*：list 走 roots；read 缺省内联、download 附件；拒绝 → 403', async () => {
    const { app } = makeApp();
    const list = await request(app, '/api/files//repo?type=list');
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ entries: [{ name: 'a.ts' }] });

    const read = await request(app, '/api/files//repo/a.ts?type=read');
    expect(read.headers.get('content-disposition')).toContain('inline');
    const download = await request(app, '/api/files//repo/a.ts?type=download');
    expect(download.headers.get('content-disposition')).toContain('attachment');

    // 越权：路径不含 /repo 前缀 ⇒ fake 返回 null ⇒ 403 且不回显路径
    const denied = await request(app, '/api/files//etc/passwd?type=read');
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'Access denied' });
  });

  it('GET /api/files/*?sessionId=：会话引用放行（roots 之外也可读）', async () => {
    const { app, readService } = makeApp();
    const denied = await request(app, '/api/files//outside/ref.png?type=meta');
    expect(denied.status).toBe(403);

    const allowed = await request(app, '/api/files//outside/ref.png?type=meta&sessionId=sess-disk');
    expect(allowed.status).toBe(200);
    expect(readService.referencedPaths).toHaveBeenCalledWith('sess-disk');
  });

  it('GET /api/files/*?type=watch → 400（一期不做文件监听）', async () => {
    const { app } = makeApp();
    expect((await request(app, '/api/files//repo?type=watch')).status).toBe(400);
  });

  it('POST /api/files/*?type=upload-check：冲突预检；缺 fileNames → 400', async () => {
    const { app } = makeApp();
    const ok = await request(app, '/api/files//repo?type=upload-check', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ fileNames: ['exists.txt', 'new.txt'] }),
    });
    expect(await ok.json()).toEqual({
      conflicts: [
        { name: 'exists.txt', exists: true },
        { name: 'new.txt', exists: false },
      ],
    });
    expect(
      (
        await request(app, '/api/files//repo?type=upload-check', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ fileNames: [] }),
        })
      ).status,
    ).toBe(400);
  });

  it('POST /api/files/*?type=upload：multipart 落盘 + 冲突跳过', async () => {
    const { app, systemService } = makeApp();
    const form = new FormData();
    form.append('file', new Blob(['hello']), 'note.txt');
    form.append('file', new Blob(['x']), 'skip.txt');
    const res = await request(app, '/api/files//repo?type=upload&conflict=skip', {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      uploaded: [{ path: '/repo/note.txt', size: 5 }],
      skipped: ['skip.txt'],
    });
    expect(systemService.saveUpload).toHaveBeenCalledTimes(2);
  });

  it('GET /api/file-index：越权 → 403；正常 → files', async () => {
    const { app } = makeApp();
    expect((await request(app, '/api/file-index?cwd=/repo')).status).toBe(200);
    expect(await (await request(app, '/api/file-index?cwd=/repo&q=a')).json()).toMatchObject({
      files: ['a.ts'],
    });
    expect((await request(app, '/api/file-index?cwd=/outside')).status).toBe(403);
    expect((await request(app, '/api/file-index')).status).toBe(400);
  });

  it('GET /api/git/status 与 /api/git/diff', async () => {
    const { app } = makeApp();
    expect(await (await request(app, '/api/git/status?cwd=/repo')).json()).toMatchObject({
      isGitRepository: true,
      additions: 1,
    });
    expect(await (await request(app, '/api/git/diff?cwd=/repo&path=a.ts')).json()).toMatchObject({
      supported: true,
      patch: expect.stringContaining('@@'),
    });
    expect(await (await request(app, '/api/git/diff?cwd=/repo&path=b.ts')).json()).toMatchObject({
      supported: false,
      reason: 'file-not-changed',
    });
    expect((await request(app, '/api/git/diff?cwd=/repo')).status).toBe(400);
  });

  it('worktrees：GET 清单 / POST 创建 / DELETE 脏工作区 409', async () => {
    const { app } = makeApp();
    expect(await (await request(app, '/api/worktrees?cwd=/repo')).json()).toMatchObject({
      isGit: true,
      worktrees: [{ branch: 'main', current: true }],
    });

    const created = await request(app, '/api/worktrees', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/repo', branch: 'feat-x' }),
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ branch: 'feat-x' });

    const dirty = await request(app, '/api/worktrees', {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/repo', path: '/dirty' }),
    });
    expect(dirty.status).toBe(409);
    expect(await dirty.json()).toMatchObject({ dirty: ['a.ts'] });

    const forced = await request(app, '/api/worktrees', {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/repo', path: '/dirty', force: true }),
    });
    expect(forced.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 生命周期（liveness lease，docs/02 §7、B7）
// ---------------------------------------------------------------------------

describe('liveness lease 路由', () => {
  it('POST /api/agent/:id/lease：renewed:true / false（**不是** 404）', async () => {
    const { app } = makeApp();
    const ok = await request(app, '/api/agent/sess-live/lease', { method: 'POST' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ success: true, renewed: true });

    const gone = await request(app, '/api/agent/nope/lease', { method: 'POST' });
    expect(gone.status).toBe(200);
    expect(await gone.json()).toEqual({ success: true, renewed: false });
  });
});

// ---------------------------------------------------------------------------
// 资源域路由（docs/02 §6.9、B6）
// ---------------------------------------------------------------------------

describe('资源域路由', () => {
  it('GET /api/project-trust：requiresTrust + trusted；缺 cwd → 400', async () => {
    const { app } = makeApp();
    expect(await (await request(app, '/api/project-trust?cwd=/trusted')).json()).toEqual({
      requiresTrust: true,
      trusted: true,
    });
    expect((await request(app, '/api/project-trust')).status).toBe(400);
  });

  it('POST /api/project-trust：两种拒绝都是 409 + reason', async () => {
    const { app } = makeApp();
    const nothing = await request(app, '/api/project-trust', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/nothing' }),
    });
    expect(nothing.status).toBe(409);
    expect(await nothing.json()).toMatchObject({ reason: 'no-trusted-resources' });

    // fake agentService 的 runningSessionIds 含 sess-live，而 sessions 列表含 sess-disk ⇒ 无交集
    const ok = await request(app, '/api/project-trust', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ cwd: '/repo' }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ trusted: true });
  });

  it('GET /api/skills 与 PATCH /api/skills（未知 skill → 400）', async () => {
    const { app, resourceService } = makeApp();
    expect(await (await request(app, '/api/skills?cwd=/repo')).json()).toMatchObject({
      skills: [],
      projectResourcesLoaded: true,
    });

    const patched = await request(app, '/api/skills', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: 'nope', disableModelInvocation: true }),
    });
    expect(patched.status).toBe(400);
    expect(await patched.json()).toMatchObject({ error: 'Unknown skill: nope' });
    expect(resourceService.patchSkill).toHaveBeenCalled();
  });

  it('skills search / install（安装失败 → 400）/ check / update', async () => {
    const { app } = makeApp();
    const search = await request(app, '/api/skills/search', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ query: 'pi-skill' }),
    });
    expect(await search.json()).toMatchObject({ results: [{ package: 'pi-skill' }] });
    expect(
      (
        await request(app, '/api/skills/search', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(400);

    const okInstall = await request(app, '/api/skills/install', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ package: 'good', scope: 'global' }),
    });
    expect(okInstall.status).toBe(200);
    const badInstall = await request(app, '/api/skills/install', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ package: 'bad', scope: 'project' }),
    });
    expect(badInstall.status).toBe(400);

    expect((await request(app, '/api/skills/check', { method: 'POST' })).status).toBe(400);
    expect((await request(app, '/api/skills/check?cwd=/repo', { method: 'POST' })).status).toBe(
      200,
    );
    expect((await request(app, '/api/skills/update?cwd=/repo', { method: 'POST' })).status).toBe(
      200,
    );
  });

  it('plugins：列表 / 动作 / 更新检查', async () => {
    const { app, resourceService } = makeApp();
    expect(await (await request(app, '/api/plugins?cwd=/repo')).json()).toMatchObject({
      totals: { packages: 0 },
      projectResourcesLoaded: true,
    });

    const action = await request(app, '/api/plugins', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ action: 'install', source: 'pi-skill-x', cwd: '/repo' }),
    });
    expect(action.status).toBe(200);
    expect(resourceService.pluginAction).toHaveBeenCalledWith({
      action: 'install',
      source: 'pi-skill-x',
      cwd: '/repo',
    });

    // 缺 source 的 install 由 core 拦（route 只校验形状）
    expect(
      (
        await request(app, '/api/plugins', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: 'nope', cwd: '/repo' }),
        })
      ).status,
    ).toBe(400);

    expect((await request(app, '/api/plugins/check?cwd=/repo', { method: 'POST' })).status).toBe(
      200,
    );
  });

  it('GET/PUT /api/tools/settings：PowerShell 开关', async () => {
    const { app, resourceService } = makeApp();
    expect(await (await request(app, '/api/tools/settings')).json()).toEqual({
      isWindows: false,
      powerShellEnabled: false,
    });
    const put = await request(app, '/api/tools/settings', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ powerShellEnabled: true }),
    });
    expect(put.status).toBe(200);
    expect(resourceService.updateToolSettings).toHaveBeenCalled();

    expect(
      (
        await request(app, '/api/tools/settings', {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(400);
  });
});
