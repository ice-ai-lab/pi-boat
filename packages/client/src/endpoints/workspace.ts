import type {
  GitDiffResponse,
  GitStatusResponse,
  ProjectInfo,
  SessionListResponse,
  SessionSearchResponse,
  WorktreeInfo,
  WorktreesResponse,
} from '@ice-ai/protocol';
import { getJson, http } from '../http';

/**
 * 会话 / 项目 / git / worktree 端点（F2 侧栏域，docs/02 §6.1 / §6.7）。
 * 路由字面量归 client 持有（protocol 不导出路径常量）。
 */

/** GET /api/sessions?force=1&projectKey=&summary=1 */
export function listSessions(
  query: { projectKey?: string; summary?: boolean; force?: boolean } = {},
): Promise<SessionListResponse> {
  const params = new URLSearchParams();
  if (query.projectKey !== undefined) params.set('projectKey', query.projectKey);
  if (query.summary === true) params.set('summary', '1');
  if (query.force === true) params.set('force', '1');
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  return getJson<SessionListResponse>(`/sessions${qs}`);
}

/** GET /api/sessions/search?q= —— 服务端有界正文搜索（G2-7） */
export function searchSessions(q: string): Promise<SessionSearchResponse> {
  return getJson<SessionSearchResponse>(`/sessions/search?q=${encodeURIComponent(q)}`);
}

/** PATCH /api/sessions/:id —— 改名（运行中 409：改走 set_session_name 命令） */
export async function renameSession(sessionId: string, name: string): Promise<void> {
  await http.patch(`/sessions/${encodeURIComponent(sessionId)}`, { name });
}

/** DELETE /api/sessions/:id —— 级联删除子代理会话，返回受影响 id */
export async function deleteSession(sessionId: string): Promise<{ deleted: string[] }> {
  const res = await http.delete<{ deleted?: string[] }>(
    `/sessions/${encodeURIComponent(sessionId)}`,
  );
  return { deleted: res.data.deleted ?? [sessionId] };
}

/** GET /api/projects?force=1 */
export function listProjects(force = false): Promise<{
  projects: ProjectInfo[];
  listFingerprint: string;
}> {
  return getJson(`/projects${force ? '?force=1' : ''}`);
}

/** GET /api/git/status?cwd= */
export function getGitStatus(cwd: string): Promise<GitStatusResponse> {
  return getJson<GitStatusResponse>(`/git/status?cwd=${encodeURIComponent(cwd)}`);
}

/** GET /api/git/diff?cwd=&path=&staged= —— 单文件 unified patch（二进制/无差异时 supported=false） */
export function getGitDiff(
  cwd: string,
  path: string,
  options: { staged?: boolean } = {},
): Promise<GitDiffResponse> {
  const params = new URLSearchParams({ cwd, path });
  if (options.staged === true) params.set('staged', '1');
  return getJson<GitDiffResponse>(`/git/diff?${params.toString()}`);
}

/** GET /api/worktrees?cwd= */
export function listWorktrees(cwd: string): Promise<WorktreesResponse> {
  return getJson<WorktreesResponse>(`/worktrees?cwd=${encodeURIComponent(cwd)}`);
}

/** POST /api/worktrees —— 分支已存在则检出，否则新建并检出 */
export async function createWorktree(
  cwd: string,
  branch: string,
): Promise<{ path: string; branch: string }> {
  const res = await http.post<{ path: string; branch: string }>('/worktrees', { cwd, branch });
  return res.data;
}

/** DELETE /api/worktrees —— 脏 worktree 返回 409（ApiError.status=409） */
export async function removeWorktree(cwd: string, path: string, force = false): Promise<void> {
  await http.delete('/worktrees', { data: { cwd, path, force } });
}

export type { WorktreeInfo };
