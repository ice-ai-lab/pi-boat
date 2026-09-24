import type { AgentSessionService, ResourceService, SessionReadService } from '@ice-ai/core';
import { InvalidScopeEditError, SkillInstallError } from '@ice-ai/core';
import {
  type CommandError,
  PluginActionRequestSchema,
  PluginsQuerySchema,
  ProjectTrustQuerySchema,
  ProjectTrustRequestSchema,
  SkillInstallRequestSchema,
  SkillPatchRequestSchema,
  SkillSearchRequestSchema,
  SkillsQuerySchema,
  SkillUpdateRequestSchema,
  ToolSettingsUpdateSchema,
} from '@ice-ai/protocol';
import type { Hono } from 'hono';
import { firstIssueMessage } from '../envelope';

/**
 * 资源域路由（docs/02 §6.9）：skills / plugins / 工具设置 / 项目信任。
 *
 * 新增路由检查清单（docs/04 §6）逐条对照：
 * ① 触碰文件系统 → 全部经 core 的 ResourceService（读资源目录、写 SKILL.md 与
 *    settings.json）；`?cwd` 只是"看哪个项目"，不是任意路径读
 * ② 错误响应不泄漏路径 → 安装失败只回包管理器的可读原因；信任拒绝回 reason 枚举
 * ③ 新增 Origin / Sec-Fetch 例外 → 无
 * ④ 有副作用的 GET → 无（改信任用 POST，改 skill 用 PATCH，工具开关用 PUT）
 *
 * 联网：`/api/skills/search`、`/api/skills/install`、`/api/skills/update`、
 * `/api/plugins`（install/update）、`/api/plugins/check`。
 */

export interface ResourceRouteDeps {
  resourceService: ResourceService;
  agentService: AgentSessionService;
  readService: SessionReadService;
}

export function registerResourceRoutes(app: Hono, deps: ResourceRouteDeps): void {
  const { resourceService, agentService, readService } = deps;

  // ------------------------------------------------------------------
  // 项目信任
  // ------------------------------------------------------------------

  app.get('/api/project-trust', (c) => {
    const parsed = ProjectTrustQuerySchema.safeParse({ cwd: c.req.query('cwd') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(resourceService.trust(parsed.data.cwd));
  });

  app.post('/api/project-trust', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ProjectTrustRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const { cwd, trusted } = parsed.data;
    const wantsTrust = trusted !== false;
    // 该 cwd 有活跃会话时不许改信任：已加载的项目资源不能中途撤下（换信任要重开会话）
    const hasActiveSession = await hasSessionForCwd(readService, agentService, cwd);
    const result = resourceService.setTrust(cwd, wantsTrust, hasActiveSession);
    if ('rejection' in result) {
      return c.json(
        { error: describeTrustRejection(result.rejection), reason: result.rejection },
        409,
      );
    }
    return c.json(result.response);
  });

  // ------------------------------------------------------------------
  // skills
  // ------------------------------------------------------------------

  app.get('/api/skills', async (c) => {
    const parsed = SkillsQuerySchema.safeParse({ cwd: c.req.query('cwd') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await resourceService.skills(parsed.data.cwd));
  });

  // PATCH /api/skills —— 切换 disable-model-invocation（**改 SKILL.md 原文**）
  app.patch('/api/skills', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = SkillPatchRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      return c.json(await resourceService.patchSkill(parsed.data));
    } catch (error) {
      const { status, body } = mapResourceError(error);
      return c.json(body, status);
    }
  });

  app.post('/api/skills/search', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = SkillSearchRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await resourceService.searchSkills(parsed.data.query, parsed.data.limit));
  });

  app.post('/api/skills/install', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = SkillInstallRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      return c.json(await resourceService.installSkill(parsed.data));
    } catch (error) {
      const { status, body } = mapResourceError(error);
      return c.json(body, status);
    }
  });

  app.post('/api/skills/check', async (c) => {
    const cwd = c.req.query('cwd');
    if (cwd === undefined) {
      return c.json<CommandError>({ error: 'Missing cwd' }, 400);
    }
    return c.json(await resourceService.checkSkillUpdates(cwd));
  });

  app.post('/api/skills/update', async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = SkillUpdateRequestSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const cwd = c.req.query('cwd');
    if (cwd === undefined) {
      return c.json<CommandError>({ error: 'Missing cwd' }, 400);
    }
    return c.json(await resourceService.updateSkills(cwd, parsed.data.package));
  });

  // ------------------------------------------------------------------
  // plugins
  // ------------------------------------------------------------------

  app.get('/api/plugins', async (c) => {
    const parsed = PluginsQuerySchema.safeParse({ cwd: c.req.query('cwd') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await resourceService.plugins(parsed.data.cwd));
  });

  app.post('/api/plugins', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = PluginActionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      return c.json(await resourceService.pluginAction(parsed.data));
    } catch (error) {
      const { status, body } = mapResourceError(error);
      return c.json(body, status);
    }
  });

  app.post('/api/plugins/check', async (c) => {
    const cwd = c.req.query('cwd');
    if (cwd === undefined) {
      return c.json<CommandError>({ error: 'Missing cwd' }, 400);
    }
    return c.json(await resourceService.checkPluginUpdates(cwd));
  });

  // ------------------------------------------------------------------
  // 工具设置
  // ------------------------------------------------------------------

  app.get('/api/tools/settings', async (c) => {
    const cwd = c.req.query('cwd') ?? process.cwd();
    return c.json(await resourceService.toolSettings(cwd));
  });

  app.put('/api/tools/settings', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ToolSettingsUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const cwd = c.req.query('cwd') ?? process.cwd();
    try {
      return c.json(await resourceService.updateToolSettings(cwd, parsed.data.powerShellEnabled));
    } catch (error) {
      const { status, body } = mapResourceError(error);
      return c.json(body, status);
    }
  });
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

function mapResourceError(error: unknown): {
  status: 400 | 404 | 409 | 500;
  body: CommandError;
} {
  if (error instanceof InvalidScopeEditError || error instanceof SkillInstallError) {
    return { status: 400, body: { error: error.message } };
  }
  console.error('[server] resource operation failed:', error);
  return { status: 500, body: { error: 'Internal server error' } };
}

function describeTrustRejection(reason: 'no-trusted-resources' | 'session-active'): string {
  return reason === 'session-active'
    ? 'Cannot change project trust while a session from this project is running'
    : 'This project has no resources that require trust';
}

/** 该 cwd 是否已有活跃会话（信任变更的前置条件） */
async function hasSessionForCwd(
  readService: SessionReadService,
  agentService: AgentSessionService,
  cwd: string,
): Promise<boolean> {
  const runningIds = new Set(agentService.runningSessionIds());
  if (runningIds.size === 0) return false;
  const sessions = await readService.list({ summary: true });
  return sessions.some((session) => runningIds.has(session.id) && samePathLite(session.cwd, cwd));
}

/** 保守的路径同一性判断（避免为了一处比较把整个 PathGuard 拉进路由层） */
function samePathLite(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '');
  const a = normalize(left);
  const b = normalize(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
