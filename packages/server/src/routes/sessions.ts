import type { AgentSessionService, SessionReadService } from '@ice-ai/core';
import {
  type CommandError,
  type CommandOk,
  EntryThinkingQuerySchema,
  type EntryThinkingResponse,
  SessionAutoNameRequestSchema,
  type SessionAutoNameResponse,
  SessionContextQuerySchema,
  SessionDetailQuerySchema,
  type SessionExportQuery,
  SessionExportQuerySchema,
  type SessionInfo,
  type SessionListQuery,
  SessionListQuerySchema,
  type SessionListResponse,
  SessionRenameRequestSchema,
  SessionSearchRequestSchema,
  type SessionSearchResponse,
  ToolResultImageQuerySchema,
} from '@ice-ai/protocol';
import type { Hono } from 'hono';
import { firstIssueMessage, mapCoreError } from '../envelope';

/** 工具结果图片 MIME 白名单（浏览器可渲染的位图；形状判定是实现细节，不进 protocol） */
const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

/** 单张图片字节上限：会话文件可被手工编辑/旧版本写入，属不可信输入（ADR-0005） */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * 会话浏览域路由（docs/04 §3 M1 路由总表下半；数据源 SessionReadService 磁盘只读
 * + 运行时注册表合并）。注册顺序敏感：search 先于 /:id。
 */

export interface SessionRouteDeps {
  agentService: AgentSessionService;
  readService: SessionReadService;
}

export function registerSessionRoutes(app: Hono, deps: SessionRouteDeps): void {
  const { agentService, readService } = deps;

  // GET /api/sessions?force=1&projectKey —— 磁盘扫描 ∪ 运行时注册表（docs/02 §6.1）。
  // force 跳过服务端列表缓存（缓存键 = 会话目录指纹，磁盘侧变动自动失效）；
  // projectKey 只返回一个项目的会话（分组键由 core 的 ProjectResolver 归一）。
  // ⚠️ ensure_session 建的未落盘会话暂不在列表中（首条条目落盘后才可见，transient 合并归 M2）
  app.get('/api/sessions', async (c) => {
    const parsed = SessionListQuerySchema.safeParse({
      force: c.req.query('force'),
      projectKey: c.req.query('projectKey'),
      summary: c.req.query('summary'),
    });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const query: SessionListQuery = parsed.data;
    const [sessions, listFingerprint] = await Promise.all([
      readService.list({
        force: query.force === '1',
        projectKey: query.projectKey,
        summary: query.summary === '1',
        // 内存会话（ensure_session 建的还没落盘）也要出现在列表里
        transient: agentService.transientInfos(),
      }),
      readService.listFingerprint(),
    ]);
    const body: SessionListResponse = {
      sessions,
      registryVersion: agentService.registryVersion,
      listFingerprint,
      runningSessionIds: agentService.runningSessionIds(),
      completionNotificationSuppressedSessionIds: [],
    };
    return c.json(body);
  });

  // GET /api/sessions/search?q（先于 /:id 注册；q ≤ 200 由 schema 保证）
  app.get('/api/sessions/search', async (c) => {
    const q = c.req.query('q');
    if (q === undefined) {
      return c.json<CommandError>({ error: 'Missing search query' }, 400);
    }
    const parsed = SessionSearchRequestSchema.safeParse({ q });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const body: SessionSearchResponse = await readService.searchDetailed(parsed.data.q);
    return c.json(body);
  });

  // GET /api/sessions/:id?force=1 —— 详情（null → 404）。
  // force=1 额外做**外部写入探测**（ADR-0013b）：detect → 若磁盘更新则重建 runtime
  // 并回 `wrapperRebuilt:true`，客户端据此重拉历史。非 force 路径不探测（省一次 stat
  // 是次要的，主要是避免在热路径上误判运行中的会话）。
  app.get('/api/sessions/:id', async (c) => {
    const query = SessionDetailQuerySchema.safeParse({ force: c.req.query('force') });
    if (!query.success) {
      return c.json<CommandError>({ error: firstIssueMessage(query.error.issues) }, 400);
    }
    const id = c.req.param('id');
    const detail = await readService.detail(id);
    if (detail === null) {
      return c.json<CommandError>({ error: 'Session not found' }, 404);
    }
    if (query.data.force === '1') {
      const rebuilt = await agentService.probeExternalWrite(id);
      if (rebuilt) detail.wrapperRebuilt = true;
    }
    return c.json(detail);
  });

  // GET /api/sessions/:id/revision —— 单会话文件指纹（G2-6 详情缓存失效判据）
  app.get('/api/sessions/:id/revision', async (c) => {
    // 先于 /:id/context 之类的具体段无关紧要，但要**在 /:id 之后**注册吗？不——
    // Hono 按注册顺序匹配，路径段数不同不会互相遮蔽
    const revision = await readService.revision(c.req.param('id'));
    if (revision === null) {
      return c.json<CommandError>({ error: 'Session not found' }, 404);
    }
    return c.json({ revision });
  });

  // GET /api/sessions/:id/export?inline=1 —— 自包含 HTML（attachment / inline）
  app.get('/api/sessions/:id/export', async (c) => {
    const parsed = SessionExportQuerySchema.safeParse({ inline: c.req.query('inline') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const query: SessionExportQuery = parsed.data;
    const html = await readService.exportHtml(c.req.param('id'));
    if (html === null) {
      return c.json<CommandError>({ error: 'Session not found' }, 404);
    }
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `${query.inline === '1' ? 'inline' : 'attachment'}; filename="session.html"`,
        // 导出内容含会话正文：不许任何中间层缓存
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });

  // POST /api/sessions/:id/auto-name —— LLM 生成会话名（会真发一次模型请求）
  app.post('/api/sessions/:id/auto-name', async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = SessionAutoNameRequestSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      const result = await readService.autoName(c.req.param('id'), {
        cwd: parsed.data.cwd,
        persist: parsed.data.dryRun !== true,
      });
      if (result === null) {
        return c.json<CommandError>({ error: 'Session not found' }, 404);
      }
      const body: SessionAutoNameResponse = { title: result.title };
      return c.json(body);
    } catch (error) {
      const { status, body } = mapCoreError(error);
      return c.json(body, status);
    }
  });

  // GET /api/sessions/:id/entries/:entryId/thinking?blockIndex —— 全量推理文本
  app.get('/api/sessions/:id/entries/:entryId/thinking', async (c) => {
    const parsed = EntryThinkingQuerySchema.safeParse({
      blockIndex: Number(c.req.query('blockIndex')),
    });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const result = await readService.thinking(
      c.req.param('id'),
      c.req.param('entryId'),
      parsed.data.blockIndex,
    );
    if (result === null) {
      return c.json<CommandError>({ error: 'Thinking block not found' }, 404);
    }
    const body: EntryThinkingResponse = result;
    return c.json(body);
  });

  // GET /api/sessions/:id/state —— 形状同轻查，但会话文件不存在 → 404
  //（区别于轻查的 {running:false}；存在性 M1 用 detail() !== null，贵但正确，
  // docs/04 §8-5；量大后 core 加 exists(id)）
  app.get('/api/sessions/:id/state', async (c) => {
    const id = c.req.param('id');
    if ((await readService.detail(id)) === null) {
      return c.json<CommandError>({ error: 'Session not found' }, 404);
    }
    return c.json(agentService.getRunningState(id));
  });

  // GET /api/sessions/:id/context —— 历史分页（docs/03 §7.1：父链回溯，不做压缩过滤）
  app.get('/api/sessions/:id/context', async (c) => {
    const id = c.req.param('id');
    const q = c.req.query();
    // query 参数全是字符串：数字/布尔在此收敛（NaN 会被 schema 拒为 400）
    const parsed = SessionContextQuerySchema.safeParse({
      ...q,
      tail: q.tail !== undefined ? Number(q.tail) : undefined,
      deferMedia:
        q.deferMedia !== undefined ? q.deferMedia === 'true' || q.deferMedia === '1' : undefined,
    });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const context = await readService.context(id, parsed.data);
    if (context === null) {
      return c.json<CommandError>({ error: 'Session not found' }, 404);
    }
    return c.json(context);
  });

  // GET /api/sessions/:id/entries/:entryId/tool-result-image?blockIndex ——
  // 历史工具结果图片惰性读取（docs/04 §8-3；deferMedia 的取数端点）
  app.get('/api/sessions/:id/entries/:entryId/tool-result-image', async (c) => {
    const parsed = ToolResultImageQuerySchema.safeParse({
      blockIndex: Number(c.req.query('blockIndex')),
    });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const image = await readService.toolResultImage(
      c.req.param('id'),
      c.req.param('entryId'),
      parsed.data.blockIndex,
    );
    if (image === null || image.data.byteLength === 0) {
      return c.json<CommandError>({ error: 'Tool result image not found' }, 404);
    }
    if (!IMAGE_MIMES.has(image.mimeType)) {
      return c.json<CommandError>({ error: 'Unsupported image type' }, 415);
    }
    if (image.data.byteLength > MAX_IMAGE_BYTES) {
      return c.json<CommandError>({ error: 'Image too large' }, 413);
    }
    return new Response(Buffer.from(image.data), {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(image.data.byteLength),
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });

  // PATCH /api/sessions/:id —— 改名（仅冷会话：直接追加 session_info 行）。
  // 运行中会话必须走 set_session_name 命令——改文件与 SDK 写盘会互相覆盖（409）
  app.patch('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const raw = await c.req.json().catch(() => null);
    const parsed = SessionRenameRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    if (agentService.isRunning(id)) {
      return c.json<CommandError>(
        {
          error:
            'Session is running; rename it via the set_session_name command on POST /api/agent/:id',
        },
        409,
      );
    }
    try {
      const info = await readService.rename(id, parsed.data.name);
      if (info === null) {
        return c.json<CommandError>({ error: 'Session not found' }, 404);
      }
      return c.json<CommandOk<SessionInfo>>({ success: true, data: info });
    } catch (error) {
      const { status, body } = mapCoreError(error);
      return c.json(body, status);
    }
  });

  // DELETE /api/sessions/:id —— 级联删除 subagent 子会话（core delete，docs/04 §8-2）；
  // 运行中 → 409（删注册表内会话会与 SDK 写盘竞争）
  app.delete('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    if (agentService.isRunning(id)) {
      return c.json<CommandError>({ error: 'Session is running; dispose it before deletion' }, 409);
    }
    const deletedIds = await readService.delete(id);
    if (deletedIds === null) {
      return c.json<CommandError>({ error: 'Session not found' }, 404);
    }
    return c.json({ deletedIds });
  });
}
