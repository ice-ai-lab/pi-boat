import type { SessionReadService } from '@ice-ai/core';
import {
  type CommandError,
  type ProjectsQuery,
  ProjectsQuerySchema,
  type ProjectsResponse,
} from '@ice-ai/protocol';
import type { Hono } from 'hono';
import { firstIssueMessage } from '../envelope';

/**
 * 项目域路由（docs/04 §3；决策见 ADR-0008）。
 *
 * "项目"是会话目录的**分组视图**而非独立实体：数据源是会话根目录的元数据扫描
 * （`readdir` + `stat` + 每目录一次首行头），与 sessions 域共用同一份扫描与缓存。
 * 单独成文件是因为它服务的前端视图不同（侧栏导航 vs 会话列表），而非资源独立。
 *
 * 路径字面量与其他路由一致（path 常量留给 client SDK 消费，见 protocol rest/*）。
 */

export interface ProjectRouteDeps {
  readService: SessionReadService;
}

export function registerProjectRoutes(app: Hono, deps: ProjectRouteDeps): void {
  const { readService } = deps;

  // GET /api/projects?force=1 —— 项目清单：O(项目数) 的目录元数据扫描，不解析会话正文，
  // 因此不分页（量级 10¹；需要分页的是会话列表，见 ADR-0008）
  app.get('/api/projects', async (c) => {
    const parsed = ProjectsQuerySchema.safeParse({ force: c.req.query('force') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const query: ProjectsQuery = parsed.data;
    const body: ProjectsResponse = await readService.listProjects({ force: query.force === '1' });
    return c.json(body);
  });
}
