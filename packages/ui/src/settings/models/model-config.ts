import type { ModelCostRates, ProviderModelConfig } from '@ice-ai/protocol';

/**
 * models.json 草稿的编辑形状（ADR-0011；面板见 docs/06 §4.4）。
 *
 * 字段复用 SDK 公开导出 `ProviderModelConfig`（ADR-0017），但 models.json 的
 * `ModelDefinitionSchema` 允许**每个字段都可选**（含 cost 的四个费率），
 * 因此这里用 `Partial` 派生、cost 用 `Partial<ModelCostRates>`——不手写第二份字段清单。
 */
export type CustomModelEntry = Partial<Omit<ProviderModelConfig, 'cost'>> & {
  id?: string;
  cost?: Partial<ModelCostRates>;
};

export interface CustomProviderEntry {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  models?: CustomModelEntry[];
}

export interface ModelsDraft {
  providers: Record<string, CustomProviderEntry>;
}

/** 宽松解析草稿（parse 失败返回 null：编辑入口全部禁用，保存由宿主拦） */
export function parseDraft(text: string): ModelsDraft | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const providers =
      typeof record.providers === 'object' && record.providers !== null
        ? (record.providers as Record<string, CustomProviderEntry>)
        : {};
    return { providers };
  } catch {
    return null;
  }
}

/**
 * 把 providers 写回草稿文本（2 空格缩进，与初次载入的展示一致）。
 *
 * `JSON.stringify` 会丢掉值为 `undefined` 的键，但会保留空对象/空数组；
 * 面板的输入框清空后我们写的是 `undefined`，故这里只需再清掉空容器，
 * 避免在 models.json 里留下 `"headers": {}` / `"models": []` 这类噪音。
 */
export function serializeDraft(providers: Record<string, CustomProviderEntry>): string {
  return `${JSON.stringify({ providers: pruneEmpty(providers) }, null, 2)}\n`;
}

function pruneEmpty<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => pruneEmpty(item)) as unknown as T;
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      // 空键（Headers 编辑器里尚未填键名的新行）不落盘
      if (key === '' || item === undefined) continue;
      const pruned = pruneEmpty(item);
      if (pruned === undefined) continue;
      if (
        typeof pruned === 'object' &&
        pruned !== null &&
        !Array.isArray(pruned) &&
        Object.keys(pruned).length === 0
      ) {
        continue;
      }
      if (Array.isArray(pruned) && pruned.length === 0) continue;
      result[key] = pruned;
    }
    return result as unknown as T;
  }
  return value;
}

/** 支持的 API 协议族（models.json 的 `api` 字段） */
export const API_OPTIONS = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
] as const;

/** 价格四列（美元 / 百万 token）；缺项不补 0，保存时省略 */
export const COST_KEYS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;
export type CostKey = (typeof COST_KEYS)[number];
