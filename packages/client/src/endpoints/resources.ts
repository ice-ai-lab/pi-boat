import type {
  PluginActionRequest,
  PluginsResponse,
  ProjectTrustResponse,
  SkillCheckResponse,
  SkillPatchRequest,
  SkillSearchResponse,
  SkillsResponse,
  SkillUpdateResult,
  ToolSettingsResponse,
} from '@ice-ai/protocol';
import { getJson, http } from '../http';

/**
 * 资源域端点（docs/02 §6.9）：skills / plugins / 工具设置 / 项目信任。
 * `?cwd` 不只是"看哪个项目"——它还决定项目级资源是否加载（未信任则不加载，
 * 响应里的 `projectResourcesLoaded:false` 就是那个信号）。
 * 联网：skills/install、plugins 动作、skills/update、plugins/check（npm registry）。
 */

// —— 项目信任 ——
export function getProjectTrust(cwd: string): Promise<ProjectTrustResponse> {
  return getJson<ProjectTrustResponse>(`/project-trust?cwd=${encodeURIComponent(cwd)}`);
}

/** POST /api/project-trust —— 改变信任状态的**唯一**入口（trusted=false 可撤销） */
export function putProjectTrust(cwd: string, trusted = true): Promise<ProjectTrustResponse> {
  return http
    .post<ProjectTrustResponse>('/project-trust', { cwd, trusted })
    .then((res) => res.data);
}

// —— skills ——
export function getSkills(cwd: string): Promise<SkillsResponse> {
  return getJson<SkillsResponse>(`/skills?cwd=${encodeURIComponent(cwd)}`);
}

/** PATCH /api/skills —— 只切「禁止模型自动调用」（写 settings.json 覆盖表，不改 SKILL.md） */
export function patchSkill(request: SkillPatchRequest): Promise<void> {
  return http.patch('/skills', request).then(() => undefined);
}

export function searchSkills(query: string, limit?: number): Promise<SkillSearchResponse> {
  return http
    .post<SkillSearchResponse>('/skills/search', limit === undefined ? { query } : { query, limit })
    .then((res) => res.data);
}

export function installSkill(request: {
  package: string;
  scope: 'global' | 'project';
  cwd?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  return http.post('/skills/install', request).then((res) => res.data);
}

/** POST /api/skills/check —— 版本对比（联网） */
export function checkSkillUpdates(): Promise<SkillCheckResponse> {
  return http.post<SkillCheckResponse>('/skills/check', {}).then((res) => res.data);
}

/** POST /api/skills/update —— 更新（缺省全部可更新的） */
export function updateSkills(pkg?: string): Promise<{ results: SkillUpdateResult[] }> {
  return http
    .post('/skills/update', pkg === undefined ? {} : { package: pkg })
    .then((res) => res.data);
}

// —— plugins ——
export function getPlugins(cwd: string): Promise<PluginsResponse> {
  return getJson<PluginsResponse>(`/plugins?cwd=${encodeURIComponent(cwd)}`);
}

/** POST /api/plugins —— install / remove / update / disable / enable（会联网） */
export function pluginAction(request: PluginActionRequest): Promise<unknown> {
  return http.post('/plugins', request).then((res) => res.data);
}

export function checkPluginUpdates(cwd: string): Promise<{ results: SkillUpdateResult[] }> {
  return http
    .post<{ results: SkillUpdateResult[] }>('/plugins/check', { cwd })
    .then((res) => res.data);
}

// —— 工具设置 ——
export function getToolsSettings(): Promise<ToolSettingsResponse> {
  return getJson<ToolSettingsResponse>('/tools/settings');
}

export function putToolsSettings(powerShellEnabled: boolean): Promise<ToolSettingsResponse> {
  return http
    .put<ToolSettingsResponse>('/tools/settings', { powerShellEnabled })
    .then((res) => res.data);
}
