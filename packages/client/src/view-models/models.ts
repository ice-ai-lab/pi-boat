import type { ModelListItem, ModelsEnabledResponse } from '@ice-ai/protocol';

/**
 * 模型设置面板的展示派生（纯函数）。
 *
 * ⚠️ **不重写可见范围引擎**：glob 解析、最小编辑、prune/resync 全在 core
 * （ADR-0011 / G2-2），前端只做分组与护栏。这里刻意不实现"自己算哪些 pattern 命中"——
 * 那是第二份实现，两边一旦分叉就是 bug（ADR-0017 同款理由）。
 */

export interface ProviderGroup {
  provider: string;
  models: ModelListItem[];
}

/** 按 provider 分组（保持服务端顺序：组内按名称排） */
export function groupModelsByProvider(models: readonly ModelListItem[]): ProviderGroup[] {
  const groups = new Map<string, ModelListItem[]>();
  for (const model of models) {
    const list = groups.get(model.provider) ?? [];
    list.push(model);
    groups.set(model.provider, list);
  }
  return [...groups.entries()].map(([provider, list]) => ({
    provider,
    models: [...list].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/**
 * 是否禁止关闭这个模型的开关（禁用最后一个模型服务端会 409 reason:'last-model'，
 * 本地先拦一道，省一次往返与一次报错弹窗）。
 */
export function isLastEnabledModel(models: readonly ModelListItem[], modelRef: string): boolean {
  if (models.length !== 1) return false;
  const only = models[0];
  if (only === undefined) return false;
  // 接受两种写法：裸 id（`glm-5.3`）与 wire 的 `provider:id`（面板用的是后者）
  return only.id === modelRef || `${only.provider}:${only.id}` === modelRef;
}

/** 面板顶部的一句话状态（scope 决定能否改） */
export function enabledScopeLabel(
  state: Pick<ModelsEnabledResponse, 'scope' | 'canWrite'>,
): string {
  if (state.scope === 'project') return '当前由项目 .pi/settings.json 覆盖（本项目内只读）';
  return state.canWrite ? '全局设置（写入 ~/.pi/agent/settings.json）' : '只读（设置文件不可写）';
}

/** 可关闭的模型数（用于「至少留一个」的提示文案） */
export function toggleHint(models: readonly ModelListItem[]): string | null {
  if (models.length === 0) return '没有可见模型：模型选择器会退化为「全部可用」';
  if (models.length === 1) return '只剩 1 个可见模型：关闭它会退回「全部可用」语义，故被禁止';
  return null;
}

/** models.json 的 provider 名列表（配置编辑器用，保持文件里的顺序） */
export function configProviderNames(config: Record<string, unknown>): string[] {
  const providers = config.providers;
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)) return [];
  return Object.keys(providers as Record<string, unknown>);
}

/** JSON 文本是否可解析为对象（保存前的本地校验；不代替服务端校验） */
export function parseModelsConfigDraft(
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: '顶层必须是 JSON 对象' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'JSON 解析失败' };
  }
}
