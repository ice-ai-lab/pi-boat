import type { SessionContext, SessionDetailResponse } from '@ice-ai/protocol';
import { getJson, http } from '../http';

/**
 * 会话域端点（docs/02 §6）。F1 只取详情/上下文（历史重建）；列表/搜索/生命周期随 F2 侧栏接入。
 */

/** GET /api/sessions/:id?deferMedia=1 —— 详情（context 即最新窗口，tail 默认 50） */
export function getSessionDetail(
  sessionId: string,
  query: { deferMedia?: boolean } = {},
): Promise<SessionDetailResponse> {
  const qs = query.deferMedia === true ? '?deferMedia=1' : '';
  return getJson<SessionDetailResponse>(`/sessions/${encodeURIComponent(sessionId)}${qs}`);
}

/** GET /api/sessions/:id/context?before=&tail=&deferMedia= —— 向上翻页（excludeLeaf） */
export function getSessionContext(
  sessionId: string,
  query: { before?: string; tail?: number; deferMedia?: boolean } = {},
): Promise<SessionContext> {
  const params = new URLSearchParams();
  if (query.before !== undefined) params.set('before', query.before);
  if (query.tail !== undefined) params.set('tail', String(query.tail));
  if (query.deferMedia === true) params.set('deferMedia', '1');
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  return getJson<SessionContext>(`/sessions/${encodeURIComponent(sessionId)}/context${qs}`);
}

/**
 * 历史图片的惰性取数 URL（`deferMedia` 下图片块只有坐标，没有字节；ADR-0024）。
 *
 * ⚠️ 带 `/api` 前缀：本函数的结果会直接进 `<img src>`，**不经过 axios 的 baseURL**
 * （同 `sessionExportUrl`）。少了前缀在 dev 下会被 vite 的 SPA fallback 吃掉——回 200
 * 但内容是 index.html，图片静默不显示（2026-09-26 实测）。
 */
export function entryImageUrl(sessionId: string, entryId: string, blockIndex: number): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/entries/${encodeURIComponent(entryId)}/image?blockIndex=${blockIndex}`;
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
