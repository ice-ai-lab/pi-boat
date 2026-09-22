import {
  type AgentSessionService,
  type ProjectReadService,
  PromptRejectedError,
  type SessionListOptions,
  SessionNotFoundError,
  type SessionReadService,
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
    /** 测试驱动：向某会话的全部订阅者广播事件（seq 由本 fake 重排） */
    emit: (id: string, event: WireAgentEvent) => {
      seq += 1;
      for (const listener of listeners.get(id) ?? []) listener({ ...event, seq });
    },
  };
  return service as unknown as AgentSessionService & { emit: typeof service.emit };
}

function fakeReadService() {
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
    detail: vi.fn(async (id: string) => (id === 'sess-disk' ? { sessionId: id } : null)),
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

function makeApp() {
  const agentService = fakeAgentService();
  const readService = fakeReadService();
  const projectService = fakeProjectService();
  const app = createAgentServer({
    agentService,
    readService,
    projectService,
  });
  return { app, agentService, readService, projectService };
}

// ---------------------------------------------------------------------------
// 安全层（docs/04 §6、ADR-0007）
// ---------------------------------------------------------------------------

describe('安全层（docs/04 §6）', () => {
  it('health 可访问（Electron 健康检查）', async () => {
    const { app } = makeApp();
    const res = await request(app, '/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: 'piboat-server' });
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
    const unknown = await post(app, { type: 'fork', entryId: 'e1' }); // fork 是 M2 命令
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: expect.stringContaining('command') });

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
    expect(readService.list).toHaveBeenCalledWith({ force: true, projectKey: undefined });
  });

  it('GET /api/sessions?projectKey：透传给 core 的项目过滤；非法 force 值 → 400', async () => {
    const { app, readService } = makeApp();
    const filtered = await request(app, '/api/sessions?projectKey=%2Frepo');
    expect(filtered.status).toBe(200);
    expect(readService.list).toHaveBeenCalledWith({ force: false, projectKey: '/repo' });

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
