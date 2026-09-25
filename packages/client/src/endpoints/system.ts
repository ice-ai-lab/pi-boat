import type { CwdBrowseResponse } from '@ice-ai/protocol';
import { getJson, http } from '../http';

/** 辅助通道端点（docs/02 §6.6 目录选择器 + §7 家目录） */

/** GET /api/home */
export function getHome(): Promise<{ home: string }> {
  return getJson('/home');
}

/** POST /api/default-cwd —— 创建 `~/pi-cwd-YYYYMMDD` 并加入 allowed-roots */
export function getDefaultCwd(): Promise<{ cwd: string }> {
  return http.post<{ cwd: string }>('/default-cwd', {}).then((res) => res.data);
}

/** GET /api/cwd/browse?path= —— 目录选择器（**不受 allowed-roots 限制**：必须能走到任意目录才能选中它） */
export function browseCwd(path?: string): Promise<CwdBrowseResponse> {
  const qs = path === undefined || path.length === 0 ? '' : `?path=${encodeURIComponent(path)}`;
  return getJson<CwdBrowseResponse>(`/cwd/browse${qs}`);
}
