import type { SessionContext, SessionDetailResponse } from '@ice-ai/protocol';
import { getJson, http } from '../http';

/**
 * 会话域端点（docs/02 §6）。F1 只取详情/上下文（历史重建）；列表/搜索/生命周期随 F2 侧栏接入。
 */

/** GET /api/sessions/:id —— 详情（context 即最新窗口，tail 默认 50） */
export function getSessionDetail(sessionId: string): Promise<SessionDetailResponse> {
  return getJson<SessionDetailResponse>(`/sessions/${encodeURIComponent(sessionId)}`);
}

/** GET /api/sessions/:id/context?before=&tail= —— 向上翻页（excludeLeaf） */
export function getSessionContext(
  sessionId: string,
  query: { before?: string; tail?: number } = {},
): Promise<SessionContext> {
  const params = new URLSearchParams();
  if (query.before !== undefined) params.set('before', query.before);
  if (query.tail !== undefined) params.set('tail', String(query.tail));
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  return getJson<SessionContext>(`/sessions/${encodeURIComponent(sessionId)}/context${qs}`);
}

/** POST /api/sessions/:id/auto-name —— LLM 生成标题（dryRun=只回名字不落盘） */
export function autoNameSession(
  sessionId: string,
  options: { cwd?: string; dryRun?: boolean } = {},
): Promise<{ title: string }> {
  return http
    .post<{ title: string }>(`/sessions/${encodeURIComponent(sessionId)}/auto-name`, options)
    .then((res) => res.data);
}

/** GET /api/sessions/:id/export —— HTML 导出（inline=1 浏览器内预览，否则附件下载） */
export function sessionExportUrl(sessionId: string, inline = false): string {
  const qs = inline ? '?inline=1' : '';
  return `/api/sessions/${encodeURIComponent(sessionId)}/export${qs}`;
}
