import type { SessionReadService, SystemService } from '@ice-ai/core';
import { SystemAccessError, UserInputErrorLite } from '@ice-ai/core';
import {
  CwdBrowseQuerySchema,
  CwdValidateRequestSchema,
  FileIndexQuerySchema,
  FileUploadCheckRequestSchema,
  type FileUploadConflictPolicy,
  FileUploadConflictPolicySchema,
  GitDiffQuerySchema,
  GitStatusQuerySchema,
  WorktreeCreateRequestSchema,
  WorktreeRemoveRequestSchema,
  WorktreesQuerySchema,
} from '@ice-ai/protocol';
import type { Hono } from 'hono';
import { firstIssueMessage } from '../envelope';

/**
 * 系统域路由（docs/02 §6.6 / §6.7）：文件、文件索引、git、worktree、cwd 选择。
 *
 * 新增路由检查清单（docs/04 §6）逐条对照：
 * ① 触碰文件系统 → **全部**走 `SystemService` 的 PathGuard（allowed-roots 白名单）；
 *    roots 唯一的写入入口是 `POST /api/cwd/validate`（用户显式选择）
 * ② 错误响应不泄漏内部路径 → 越权一律回 `Access denied`，**不回显**请求的路径
 * ③ 新增 Origin / Sec-Fetch 例外 → 无
 * ④ 有副作用的 GET → 无（创建/删除 worktree 用 POST/DELETE；上传用 POST）
 *
 * 单文件上传上限 / 总量上限见 `MAX_UPLOAD_BYTES`：multipart 解析前先看
 * `Content-Length`，超出直接 413（不等把字节收进内存再拒）。
 */

/** 单文件上限（协议承诺值：25MB） */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** 单次请求总量上限（多文件时的合计；协议承诺值：100MB） */
const MAX_UPLOAD_TOTAL_BYTES = 100 * 1024 * 1024;

export interface SystemRouteDeps {
  systemService: SystemService;
  readService: SessionReadService;
}

export function registerSystemRoutes(app: Hono, deps: SystemRouteDeps): void {
  const { systemService, readService } = deps;

  const accessDenied = () => ({ error: 'Access denied' });

  /** 会话引用集合：roots 之外的文件若被该会话引用则可读（协议级语义） */
  async function referencesFor(sessionId: string | undefined): Promise<string[]> {
    if (sessionId === undefined) return [];
    const paths = await readService.referencedPaths(sessionId);
    return paths ?? [];
  }

  // ------------------------------------------------------------------
  // §6.6 家目录 / 默认 cwd / 目录选择器
  // ------------------------------------------------------------------

  app.get('/api/home', (c) => c.json({ home: systemService.home() }));

  app.post('/api/default-cwd', async (c) => c.json({ cwd: await systemService.defaultCwd() }));

  app.get('/api/cwd/browse', async (c) => {
    const parsed = CwdBrowseQuerySchema.safeParse({ path: c.req.query('path') });
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const result = await systemService.browseCwd(parsed.data.path);
    if (result === null) return c.json({ error: 'Directory not found' }, 404);
    return c.json(result);
  });

  // POST /api/cwd/validate —— 选定即加入 allowed-roots（roots 的唯一来源）
  app.post('/api/cwd/validate', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = CwdValidateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const result = await systemService.validateCwd(parsed.data.cwd);
    // 校验失败是**业务结果**（success:false）而非传输错误：前端要拿它显示"路径不可用"
    return c.json(result, result.success ? 200 : 200);
  });

  // ------------------------------------------------------------------
  // §6.6 文件读写（路径走通配）
  // ------------------------------------------------------------------

  /** 从通配路径还原目标（`/api/files/<path>`，支持绝对路径与仓库内相对路径） */
  const wildcardPath = (raw: string): string => decodeURIComponent(raw);

  app.get('/api/files/*', async (c) => {
    const rawPath = c.req.path.replace(/^\/api\/files\//, '');
    const type = c.req.query('type') ?? 'read';
    const sessionId = c.req.query('sessionId');
    const path = wildcardPath(rawPath);
    if (path === '') return c.json({ error: 'Missing path' }, 400);

    switch (type) {
      case 'list': {
        // 列目录不支持会话引用放行（协议明文）
        const listed = await systemService.listDirectory(path);
        if (listed === null) return c.json(accessDenied(), 403);
        return c.json(listed);
      }
      case 'meta': {
        const references = await referencesFor(sessionId);
        const meta = await systemService.meta(path, references);
        if (meta === null) return c.json(accessDenied(), 403);
        return c.json(meta);
      }
      case 'read':
      case 'download': {
        const references = await referencesFor(sessionId);
        const file = await systemService.readFile(path, references);
        if (file === null) return c.json(accessDenied(), 403);
        const disposition = type === 'download' ? 'attachment' : 'inline';
        return new Response(new Uint8Array(file.data), {
          headers: {
            'Content-Type': file.mimeType,
            'Content-Length': String(file.data.byteLength),
            // 文件名可能含非 ASCII：同时给 ASCII 回退与 RFC 5987 形式
            'Content-Disposition': `${disposition}; filename="${asciiFallback(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            'Cache-Control': 'private, no-cache',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      case 'preview': {
        // preview 与 read 同源，差别在前端如何渲染（此处保持同一份字节）
        const references = await referencesFor(sessionId);
        const file = await systemService.readFile(path, references);
        if (file === null) return c.json(accessDenied(), 403);
        return new Response(new Uint8Array(file.data), {
          headers: {
            'Content-Type': file.mimeType,
            'Content-Length': String(file.data.byteLength),
            'Cache-Control': 'private, no-cache',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      default:
        return c.json({ error: `Unsupported type: ${type}` }, 400);
    }
  });

  app.post('/api/files/*', async (c) => {
    const rawPath = c.req.path.replace(/^\/api\/files\//, '');
    const type = c.req.query('type') ?? 'upload';
    const path = wildcardPath(rawPath);
    if (path === '') return c.json({ error: 'Missing path' }, 400);

    if (type === 'upload-check') {
      const raw = await c.req.json().catch(() => null);
      const parsed = FileUploadCheckRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
      }
      const conflicts = await systemService.checkUploadConflicts(path, parsed.data.fileNames);
      return c.json({ conflicts });
    }
    if (type !== 'upload') return c.json({ error: `Unsupported type: ${type}` }, 400);

    const policyRaw = c.req.query('conflict');
    const policyParsed = FileUploadConflictPolicySchema.safeParse(policyRaw);
    const policy: FileUploadConflictPolicy = policyParsed.success ? policyParsed.data : 'rename';

    // 先看 Content-Length：超限直接 413，不把字节收进内存再拒
    const declared = Number(c.req.header('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_TOTAL_BYTES) {
      return c.json({ error: 'Upload too large' }, 413);
    }

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Expected multipart/form-data' }, 400);
    }

    const uploaded: Array<{ path: string; size: number; finalName?: string }> = [];
    const skipped: string[] = [];
    let total = 0;
    for (const value of form.values()) {
      if (typeof value === 'string') continue;
      const data = new Uint8Array(await value.arrayBuffer());
      if (data.byteLength > MAX_UPLOAD_BYTES) {
        return c.json({ error: `File too large: ${value.name}` }, 413);
      }
      total += data.byteLength;
      if (total > MAX_UPLOAD_TOTAL_BYTES) return c.json({ error: 'Upload too large' }, 413);

      const result = await systemService.saveUpload(path, value.name, data, policy);
      if (result === null) return c.json(accessDenied(), 403);
      if ('skipped' in result) {
        skipped.push(result.skipped);
        continue;
      }
      uploaded.push({
        path: result.path,
        size: result.size,
        ...(result.finalName !== value.name ? { finalName: result.finalName } : {}),
      });
    }
    return c.json({ uploaded, skipped });
  });

  // ------------------------------------------------------------------
  // §6.6 文件索引
  // ------------------------------------------------------------------

  app.get('/api/file-index', async (c) => {
    const parsed = FileIndexQuerySchema.safeParse({
      cwd: c.req.query('cwd'),
      q: c.req.query('q'),
    });
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      return c.json(await systemService.fileIndex(parsed.data.cwd, parsed.data.q));
    } catch (error) {
      if (error instanceof SystemAccessError) return c.json(accessDenied(), 403);
      throw error;
    }
  });

  // ------------------------------------------------------------------
  // §6.7 git
  // ------------------------------------------------------------------

  app.get('/api/git/status', async (c) => {
    const parsed = GitStatusQuerySchema.safeParse({ cwd: c.req.query('cwd') });
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await systemService.gitStatus(parsed.data.cwd));
  });

  app.get('/api/git/diff', async (c) => {
    const parsed = GitDiffQuerySchema.safeParse({
      cwd: c.req.query('cwd'),
      path: c.req.query('path'),
      staged: c.req.query('staged'),
    });
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const { cwd, path, staged } = parsed.data;
    return c.json(await systemService.gitDiff(cwd, path, staged === '1'));
  });

  // ------------------------------------------------------------------
  // §6.7 worktrees
  // ------------------------------------------------------------------

  app.get('/api/worktrees', async (c) => {
    const parsed = WorktreesQuerySchema.safeParse({ cwd: c.req.query('cwd') });
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await systemService.worktrees(parsed.data.cwd));
  });

  app.post('/api/worktrees', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = WorktreeCreateRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      const created = await systemService.createWorktree(
        parsed.data.cwd,
        parsed.data.branch,
        parsed.data.basePath,
      );
      return c.json(created);
    } catch (error) {
      if (error instanceof SystemAccessError) return c.json(accessDenied(), 403);
      if (error instanceof UserInputErrorLite) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.delete('/api/worktrees', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = WorktreeRemoveRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      const dirty = await systemService.removeWorktree(
        parsed.data.cwd,
        parsed.data.path,
        parsed.data.force === true,
      );
      // 脏工作区且未 force：409 + 脏文件清单（用户据此决定是否强删）
      if (dirty !== null) {
        return c.json({ error: 'Worktree has uncommitted changes', dirty: dirty.dirty }, 409);
      }
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof SystemAccessError) return c.json(accessDenied(), 403);
      if (error instanceof UserInputErrorLite) return c.json({ error: error.message }, 400);
      throw error;
    }
  });
}

/** Content-Disposition 的 ASCII 回退名（非 ASCII 一律换成 `_`） */
function asciiFallback(name: string): string {
  const fallback = name.replace(/[^\x20-\x7E]|["\\;\r\n]/g, '_');
  return fallback === '' ? 'download' : fallback;
}
