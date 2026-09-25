import type {
  CatalogModel,
  DiscoveredModel,
  ModelsConfigTestRequest,
  ModelsConfigTestResponse,
  ModelsEnabledResponse,
  ModelsEnabledUpdate,
  ModelsRefreshRequest,
  ModelsRefreshResponse,
  ModelsResponse,
  ProviderDraft,
} from '@ice-ai/protocol';
import { getJson, http } from '../http';

/**
 * 模型域端点（docs/02 §6.4 / ADR-0011）。
 * 联网纪律（ADR-0011③）：只有 discover / test / catalog / refresh 会联网——都是用户显式点击。
 */

/** GET /api/models?cwd= —— 可见模型与思考档位（离线） */
export function getModels(cwd?: string): Promise<ModelsResponse> {
  const qs = cwd === undefined ? '' : `?cwd=${encodeURIComponent(cwd)}`;
  return getJson<ModelsResponse>(`/models${qs}`);
}

/** GET /api/models-config —— models.json 原文（不可解析时 422，前端据此阻止覆盖写） */
export function getModelsConfig(): Promise<{
  modelsPath: string;
  config: Record<string, unknown>;
}> {
  return getJson(`/models-config`);
}

/** PUT /api/models-config —— 整份覆盖（面板保存的草稿） */
export async function putModelsConfig(
  config: Record<string, unknown>,
): Promise<{ modelsPath: string }> {
  const res = await http.put<{ success: true; modelsPath: string }>('/models-config', { config });
  return { modelsPath: res.data.modelsPath };
}

/** POST /api/models-config/discover —— 按 provider /models 发现（联网） */
export function discoverModels(
  providerName: string,
  provider: ProviderDraft,
): Promise<{ models: DiscoveredModel[]; error?: string }> {
  return http
    .post<{ models: DiscoveredModel[]; error?: string }>('/models-config/discover', {
      providerName,
      provider,
    })
    .then((res) => res.data);
}

/** POST /api/models-config/test —— 真实补全测连通（联网） */
export function testModel(input: ModelsConfigTestRequest): Promise<ModelsConfigTestResponse> {
  return http.post<ModelsConfigTestResponse>('/models-config/test', input).then((res) => res.data);
}

/** GET /api/models-config/catalog?q= —— models.dev 目录（服务端代理 + 1h 缓存，联网） */
export function getModelCatalog(q?: string): Promise<{ models: CatalogModel[]; error?: string }> {
  const qs = q === undefined || q.length === 0 ? '' : `?q=${encodeURIComponent(q)}`;
  return getJson(`/models-config/catalog${qs}`);
}

/** GET /api/models/enabled?cwd= —— 可见范围（只读；scope=project 时 canWrite=false） */
export function getEnabledModels(cwd?: string): Promise<ModelsEnabledResponse> {
  const qs = cwd === undefined ? '' : `?cwd=${encodeURIComponent(cwd)}`;
  return getJson<ModelsEnabledResponse>(`/models/enabled${qs}`);
}

/**
 * PUT /api/models/enabled —— 最小编辑（toggle 只动一个模型）/ prune / resync。
 * 禁用最后一个模型 → 409 reason:'last-model'；项目 shadow → 409 reason:'project-shadow'。
 */
export function updateEnabledModels(update: ModelsEnabledUpdate): Promise<ModelsEnabledResponse> {
  return http.put<ModelsEnabledResponse>('/models/enabled', update).then((res) => res.data);
}

/** POST /api/models/refresh —— 只有用户点按钮才联网刷新目录 */
export function refreshModels(request: ModelsRefreshRequest = {}): Promise<ModelsRefreshResponse> {
  return http.post<ModelsRefreshResponse>('/models/refresh', request).then((res) => res.data);
}
