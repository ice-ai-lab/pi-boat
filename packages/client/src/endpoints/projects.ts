import {
  PROJECTS_PATH,
  type ProjectInfo,
  type ProjectsResponse,
  ProjectsResponseSchema,
} from '@ice-ai/protocol';
import type { ApiClient } from '../http';

/**
 * 项目分组域的端点封装（docs/05 §2，ADR-0008）：
 * `projectKey` 是前端分组键，`listFingerprint` 是列表失效键（无单调性，只比较相等）。
 */

export function listProjects(
  client: ApiClient,
  options: { force?: boolean } = {},
): Promise<ProjectsResponse> {
  return client.request(
    {
      method: 'GET',
      url: PROJECTS_PATH,
      params: options.force === true ? { force: '1' } : {},
    },
    ProjectsResponseSchema,
  );
}

/** 项目 → 代表性 cwd（M1 首页的路径输入初值） */
export function primaryCwd(projects: ProjectInfo[]): string | null {
  return projects[0]?.cwd ?? null;
}
