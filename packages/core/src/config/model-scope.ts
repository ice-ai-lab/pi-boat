import type { ModelRuntime, ScopedModel } from '@earendil-works/pi-coding-agent';
import { resolveModelScopeWithDiagnostics } from '@earendil-works/pi-coding-agent';
import type { SdkModelRef } from '../agent/sdk-types';

/**
 * 可见模型范围（`enabledModels`）的解析与**最小编辑**写入（ADR-0011）。
 *
 * 两条铁律：
 * 1. **解析一律委托** SDK 的 `resolveModelScopeWithDiagnostics()`（globs / fuzzy /
 *    `:level` 后缀 / 诊断都与 CLI、TUI 同源），本仓不写第二套匹配逻辑
 * 2. **写入只动被切换的那一项覆盖到的 pattern**，其余原样保留——包括匹配不到任何
 *    模型的项、`:level` 后缀、用户手写的具名列表
 *
 * 两个实证坑（写在代码里防回归）：
 * - minimatch 的 `*` **遇 `/` 即停**：`provider/*` 覆盖不了嵌套模型 id
 *   （`commandcode/sakana/fugu-ultra`）。所以「provider 全开」要判**实际匹配集**
 *   是否等于该 provider 的全部模型，而不是看 pattern 长得像不像
 * - **不得整表重写**：`getAvailable()` 只列**当前鉴权通过**的 provider，整表重写会
 *    静默删掉缺凭据 provider 的条目
 */

/** 一个 provider 在「全开」时用的 glob（`**` 才跨 `/`） */
const providerGlob = (providerId: string): string => `${providerId}/**`;

export interface VisibleScope {
  /** 解析出的可见模型（选择器数据源） */
  visible: ScopedModel[];
  /** `provider:id` → 模式里钉住的档位 */
  thinkingLevelPins: Record<string, string>;
  /** 诊断文本（匹配不到 / 非法档位） */
  warnings: string[];
}

/**
 * 解析可见范围。
 *
 * `patterns` 为 undefined 或**空数组**都表示"不限制"——pi 的语义是空列表等于全开
 * （这正是「禁用最后一个模型」必须报 409 的原因：用户想要"一个都不要"，
 * 而 pi 会理解成"全都要"，方向正好相反）。
 */
export async function resolveVisibleModels(
  modelRuntime: ModelRuntime,
  patterns: readonly string[] | undefined,
): Promise<VisibleScope> {
  if (patterns === undefined || patterns.length === 0) {
    const available = await modelRuntime.getAvailable();
    return {
      visible: available.map((model) => ({ model })),
      thinkingLevelPins: {},
      warnings: [],
    };
  }
  const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics(
    [...patterns],
    modelRuntime,
  );
  const thinkingLevelPins: Record<string, string> = {};
  for (const scoped of scopedModels) {
    if (scoped.thinkingLevel !== undefined) {
      thinkingLevelPins[modelKey(scoped.model)] = scoped.thinkingLevel;
    }
  }
  return {
    visible: scopedModels,
    thinkingLevelPins,
    warnings: diagnostics.map((diagnostic) => `[${diagnostic.code}] ${diagnostic.message}`),
  };
}

export const modelKey = (model: SdkModelRef): string => `${model.provider}:${model.id}`;

// ---------------------------------------------------------------------------
// pattern 的最小编辑
// ---------------------------------------------------------------------------

/** `provider/model:level` 拆三段；无 `:level` 时 level 为 undefined */
export function parsePattern(pattern: string): {
  providerId?: string;
  modelId?: string;
  level?: string;
} {
  const colon = pattern.lastIndexOf(':');
  const level = colon > 0 ? pattern.slice(colon + 1) : undefined;
  const body = level !== undefined ? pattern.slice(0, colon) : pattern;
  const slash = body.indexOf('/');
  if (slash === -1) return { modelId: body, level };
  return { providerId: body.slice(0, slash), modelId: body.slice(slash + 1), level };
}

/** 该 pattern 是否在**文本上**涉及这个 provider（`p/x`、`p/**` 或裸 id 属于 p） */
function patternTouchesProvider(
  pattern: string,
  providerId: string,
  providerModelIds: ReadonlySet<string>,
): boolean {
  const parsed = parsePattern(pattern);
  if (parsed.providerId !== undefined) return parsed.providerId === providerId;
  // 裸 model id：它属于这个 provider 才算涉及
  return parsed.modelId !== undefined && providerModelIds.has(parsed.modelId);
}

/**
 * 把「某个 provider 的期望可见集」重新编码成 pattern 列表。
 *
 * - 等于该 provider 的全部模型 → 一条 `${provider}/**`（`**` 才跨 `/`，见头注坑 1）
 * - 否则逐模型写 `provider/model`，并**保留原有的 `:level` 后缀**
 * - 其余 pattern 由调用方原样拼接，本函数只负责这一个 provider 的片段
 */
function encodeProviderSelection(
  providerId: string,
  selectedModelIds: readonly string[],
  allModelIds: readonly string[],
  levels: ReadonlyMap<string, string>,
): string[] {
  const selected = new Set(selectedModelIds);
  const isFull = allModelIds.length >= 2 && allModelIds.every((id) => selected.has(id));
  if (isFull) {
    // 整体启用：只有全部模型自己都没钉档位时才收敛成 glob，
    // 否则收敛会把 `:level` 静默丢掉
    const anyPinned = allModelIds.some((id) => levels.has(id));
    if (!anyPinned) return [providerGlob(providerId)];
  }
  return [...selectedModelIds].sort().map((id) => {
    const level = levels.get(id);
    return level === undefined ? `${providerId}/${id}` : `${providerId}/${id}:${level}`;
  });
}

export interface ToggleInput {
  patterns: readonly string[];
  providerId: string;
  modelId: string;
  enabled: boolean;
  /** 该 provider 的**全部**模型 id（来自目录，不是 getAvailable——见头注坑 2） */
  providerModelIds: readonly string[];
  /** 当前解析结果（避免重复解析） */
  visible: readonly ScopedModel[];
}

export class LastModelRejectionError extends Error {
  constructor() {
    super('Cannot disable the last visible model: an empty list means "all models" in pi');
    this.name = 'LastModelRejectionError';
  }
}

/**
 * 切换单个模型的可见性（最小编辑）。
 *
 * 幂等：目标已在期望状态时**原样返回**（不重排、不归一化——用户手写的列表不该
 * 因为一次无意义的点击被改写成我们喜欢的形状）。
 */
export function toggleModelInPatterns(input: ToggleInput): string[] {
  const { patterns, providerId, modelId, enabled, providerModelIds, visible } = input;
  const targetKey = `${providerId}:${modelId}`;
  const visibleKeys = new Set(visible.map((scoped) => modelKey(scoped.model)));
  const isVisible = visibleKeys.has(targetKey);

  if (enabled === isVisible) return [...patterns];

  const providerModelIdSet = new Set(providerModelIds);
  const levels = new Map<string, string>();
  for (const scoped of visible) {
    if (scoped.model.provider !== providerId) continue;
    if (scoped.thinkingLevel !== undefined) {
      levels.set(scoped.model.id, scoped.thinkingLevel);
    }
  }

  const selectedIds = new Set(
    visible.filter((s) => s.model.provider === providerId).map((s) => s.model.id),
  );
  if (enabled) selectedIds.add(modelId);
  else selectedIds.delete(modelId);

  // 拒绝条件是**全局**只剩 0 个可见模型，而不是「该 provider 空了」——
  // 别家还有模型时，关掉本家最后一个模型是合法操作（空列表才等于"全部可用"）。
  const otherProvidersVisible = visible.filter(
    (scoped) => scoped.model.provider !== providerId,
  ).length;
  if (selectedIds.size + otherProvidersVisible === 0) throw new LastModelRejectionError();

  // patterns 为空 = 隐含「全部可见」。此时**必须把所有 provider 显式化**：
  // 一旦写入非空列表，未列出的模型就不可见——只写被 toggle 的那家会让别家整体消失
  // （docs/07 §7 的同类陷阱；既有测试只覆盖了 patterns 非空的路径）。
  if (patterns.length === 0) {
    const byProvider = new Map<string, string[]>();
    for (const scoped of visible) {
      const list = byProvider.get(scoped.model.provider) ?? [];
      list.push(scoped.model.id);
      byProvider.set(scoped.model.provider, list);
    }
    const explicit: string[] = [];
    for (const [provider, allIds] of byProvider) {
      const ids = provider === providerId ? [...selectedIds] : allIds;
      if (ids.length === 0) continue;
      explicit.push(...encodeProviderSelection(provider, ids, allIds, new Map()));
    }
    return explicit;
  }

  // 保留不涉及该 provider 的 pattern（原样、原顺序）
  const kept = patterns.filter(
    (pattern) => !patternTouchesProvider(pattern, providerId, providerModelIdSet),
  );
  const encoded = encodeProviderSelection(providerId, [...selectedIds], providerModelIds, levels);
  // 新片段插在第一个涉及该 provider 的 pattern 处（保持用户感知的顺序），
  // 没有就追加
  const firstIndex = patterns.findIndex((pattern) =>
    patternTouchesProvider(pattern, providerId, providerModelIdSet),
  );
  if (firstIndex === -1) return [...kept, ...encoded];
  return [...kept.slice(0, firstIndex), ...encoded, ...kept.slice(firstIndex)];
}

/**
 * 丢弃**匹配不到任何模型**的 pattern（显式修复操作，`op:'prune'`）。
 * 普通开关永不隐式重写未触碰的条目——用户可能是为将来准备的（ADR-0011）。
 */
export function prunePatterns(patterns: readonly string[], warnings: readonly string[]): string[] {
  const unmatched = new Set<string>();
  for (const warning of warnings) {
    // 诊断文本格式：[no-match] No models matched pattern "xxx"
    const match = /pattern "([^"]+)"/.exec(warning);
    if (match?.[1] !== undefined && warning.includes('no-match')) unmatched.add(match[1]);
  }
  return patterns.filter((pattern) => !unmatched.has(pattern));
}

/**
 * 修复改名残留（`op:'resync'`）。
 *
 * 两件事：
 * 1. 匹配不到的 `provider/model`：若同 provider 下有模型 id 以该 model 部分**结尾**
 *    （README → README-v2 这类改名），改写成新 id
 * 2. provider 前缀不再覆盖某模型（改名后 `provider/*` 漏了嵌套 id）：无法从 pattern
 *    本身推断"曾经覆盖过谁"，因此只在能匹配到同 provider 的**唯一**前缀候选时才动
 */
export function resyncPatterns(
  patterns: readonly string[],
  warnings: readonly string[],
  available: readonly SdkModelRef[],
): string[] {
  const unmatched = new Set<string>();
  for (const warning of warnings) {
    const match = /pattern "([^"]+)"/.exec(warning);
    if (match?.[1] !== undefined && warning.includes('no-match')) unmatched.add(match[1]);
  }
  return patterns.map((pattern) => {
    if (!unmatched.has(pattern)) return pattern;
    const parsed = parsePattern(pattern);
    const { providerId, modelId } = parsed;
    if (providerId === undefined || modelId === undefined) return pattern;
    const candidates = available.filter(
      (model) =>
        model.provider === providerId &&
        (model.id === modelId || model.id.endsWith(modelId) || model.id.startsWith(modelId)),
    );
    if (candidates.length !== 1) return pattern;
    const only = candidates[0];
    if (only === undefined) return pattern;
    const replacement = `${providerId}/${only.id}`;
    return parsed.level === undefined ? replacement : `${replacement}:${parsed.level}`;
  });
}
