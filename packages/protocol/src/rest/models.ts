import { z } from 'zod';
import type { ModelRef } from '../domain/session-info';

/**
 * ⑤ REST 资源——模型域（docs/02 §6.4；决策见 ADR-0011）。
 *
 * 八条端点分三组：
 * 1. 可见模型与思考档位（`/api/models`）：**只读快照**，供选择器渲染
 * 2. `models.json` 配置（`/api/models-config` + discover/test/catalog）：原文读写 + 网络诊断
 * 3. 可见范围与目录刷新（`/api/models/enabled`、`/api/models/refresh`）：ADR-0011 的两项
 *
 * 贯穿全局的一条约束（ADR-0011③）：**联网只发生在用户显式请求时**——
 * `/api/models-config/discover`、`/test`、`/catalog`、`/api/models/refresh` 会联网；
 * 其余全部离线（读已落盘的 overlay）。
 *
 * 入参用 zod（server 校验），出参只是类型（ADR-0017）。
 */

// ---------------------------------------------------------------------------
// §6.4 可见模型与思考档位
// ---------------------------------------------------------------------------

/** 选择器条目（`input` 声明模型接受的模态，前端据此决定是否挂图片按钮） */
export type ModelListItem = {
  id: string;
  name: string;
  provider: string;
  input: string[];
};

export const ModelsQuerySchema = z.object({
  /** 解析项目资源的 cwd；缺省 = 服务进程 cwd（必须已存在且为目录） */
  cwd: z.string().optional(),
});
export type ModelsResponse = {
  /** `provider:id` → display name（会话列表等处按 key 查名） */
  models: Record<string, string>;
  modelList: ModelListItem[];
  defaultModel: ModelRef | null;
  defaultThinkingLevel: import('../constants').ThinkingLevel | null;
  /** `provider:id` → 该模型支持的思考档位 */
  thinkingLevels: Record<string, string[]>;
  /** `provider:id` → 档位映射（`null` = 该档位不可用；缺键 = 用默认语义） */
  thinkingLevelMaps: Record<string, Record<string, string | null>>;
  /** `provider:id` → 模式里钉住的档位（`model:high` 这种） */
  thinkingLevelPins: Record<string, string>;
  /** 作用域解析的诊断（匹配不到的 pattern / 非法档位后缀） */
  modelScopeWarnings?: string[];
  /** 模型源加载错误（如 models.json 崩了）；有值时上方各表可能为空 */
  error?: string;
};

// ---------------------------------------------------------------------------
// models.json 原文读写
// ---------------------------------------------------------------------------

/** PUT /api/models-config —— 整份覆盖（面板保存的草稿） */
export const ModelsConfigUpdateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
/** 自定义 provider 描述（discover/test 的入参共用） */
export const ProviderDraftSchema = z.object({
  baseUrl: z.string().min(1),
  /** 协议族（`openai-completions` / `anthropic-messages` / …） */
  api: z.string().min(1),
  apiKey: z.string().optional(),
});
export type ProviderDraft = z.infer<typeof ProviderDraftSchema>;

/** POST /api/models-config/discover —— 按 provider 的 `/models` 端点发现模型列表 */
export const ModelsConfigDiscoverRequestSchema = z.object({
  providerName: z.string().min(1),
  provider: ProviderDraftSchema,
});
export type ModelsConfigDiscoverRequest = z.infer<typeof ModelsConfigDiscoverRequestSchema>;

export type DiscoveredModel = {
  id: string;
  name: string;
};

/** POST /api/models-config/test —— 真实补全请求测连通 */
export const ModelsConfigTestRequestSchema = z.object({
  providerName: z.string().min(1),
  provider: ProviderDraftSchema,
  model: z.object({ id: z.string().min(1) }),
});
export type ModelsConfigTestRequest = z.infer<typeof ModelsConfigTestRequestSchema>;

export type ModelsConfigTestResponse = {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  /** 模型回显的一小段文本（成功时） */
  text?: string;
};

/**
 * GET /api/models-config/catalog?q —— models.dev 目录的服务端代理
 * （1h 缓存；浏览器不直连外网，避免 CORS 与隐私泄漏）
 */
export const ModelsCatalogQuerySchema = z.object({
  q: z.string().optional(),
});
export type CatalogModel = {
  id: string;
  name: string;
  provider: string;
  /** 上下文窗口（目录里给得出时才带） */
  contextWindow?: number;
  reasoning?: boolean;
};

// ---------------------------------------------------------------------------
// §6.4 可见范围（enabledModels）——ADR-0011
// ---------------------------------------------------------------------------

export type ModelsEnabledScope = 'global' | 'project';

/**
 * GET /api/models/enabled
 *
 * `scope` 是**生效来源**：`project` 表示项目 `.pi/settings.json` 里有
 * `enabledModels`，它整体替换全局值 ⇒ 面板必须只读渲染（ADR-0011②）。
 */
export type ModelsEnabledResponse = {
  /** 原始 pattern 列表（**未解析**；含匹配不到任何模型的项，用户可能是为将来备的） */
  patterns: string[];
  /** 解析结果（选择器实际可见的模型） */
  models: ModelListItem[];
  /**
   * 该 runtime 的**完整目录**（含当前不可见的模型；`getModels()`，不看鉴权）。
   *
   * 面板要能显示「关掉的模型」并允许再打开（ADR-0011 后果：必须区分「未启用」/
   * 「缺凭据」/「目录里没有」）——只给 `models` 的话，关掉一条它就从列表消失了，
   * 用户再也点不回来。`input` 与 `models` 同形状，前端可直接合并成一张表。
   */
  catalog: ModelListItem[];
  scope: ModelsEnabledScope;
  /** 生效的 settings.json 路径（前端要告诉用户"改的是哪个文件"） */
  settingsPath: string;
  /** 项目 shadow 时不可写（ADR-0011②） */
  canWrite: boolean;
  warnings: string[];
};

/**
 * PUT /api/models/enabled
 *
 * 只改**这一个模型**的可见性，其余 pattern 原样保留（最小编辑：匹配不到的项、
 * `:level` 后缀、用户手写的具名列表都不动）。
 *
 * ⚠️ 禁用最后一个模型 → **409 + reason:'last-model'**：空列表在 pi 里等于"全开"，
 * 与用户意图相反（ADR-0011）。
 *
 * 没有 `prune` / `resync`（ADR-0027）：先把"不可用"与"目录里没有"混为一谈的
 * 批量修复操作删掉，只留面板开关这一条写入路径。
 */
export const ModelsEnabledUpdateSchema = z.object({
  cwd: z.string().optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  enabled: z.boolean(),
});
export type ModelsEnabledUpdate = z.infer<typeof ModelsEnabledUpdateSchema>;

// ---------------------------------------------------------------------------
// Provider 鉴权（API Key）——与 usage 一样只有用户显式操作才联网/写盘
// ---------------------------------------------------------------------------

/** 可用 API Key 登录的 provider 清单条目（`GET /api/models/auth-providers`） */
export type ApiKeyProviderInfo = {
  id: string;
  /** 展示名（provider 定义里的 name，如 "DeepSeek"） */
  displayName: string;
  /** 当前是否已有可用凭据（auth.json 或环境变量） */
  configured: boolean;
  /** 凭据来源标签（如 "DEEPSEEK_API_KEY"；缺省 = auth.json） */
  source?: string;
  /** 目录里的模型数（给「输入 key 即启用 N 个模型」的提示用） */
  modelCount: number;
  /** 同一 provider 也能 OAuth 登录（当前 UI 只做 API Key，留作展示提示） */
  supportsOAuth: boolean;
};

export type AuthProvidersResponse = {
  providers: ApiKeyProviderInfo[];
};

/** PUT /api/models/api-key —— 保存 API Key（写入 `~/.pi/agent/auth.json`） */
export const ApiKeySetRequestSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
});
export type ApiKeySetRequest = z.infer<typeof ApiKeySetRequestSchema>;

/** DELETE /api/models/api-key 的结果（type-mismatch = 该 provider 是 OAuth 凭据，不混删） */
export type ApiKeyRemoveResult =
  | { status: 'removed' | 'not_found' }
  | { status: 'type_mismatch'; storedType: string };

// ---------------------------------------------------------------------------
// Provider 用量（余额 / 额度）——只有用户点「刷新」才联网
// ---------------------------------------------------------------------------

export const ProviderUsageRequestSchema = z.object({
  providerId: z.string().min(1),
});
export type ProviderUsageRequest = z.infer<typeof ProviderUsageRequestSchema>;

export type UsageUnit = 'percent' | 'currency' | 'count';

/** 一个额度窗口（如 5h / 周窗口的已用/剩余百分比） */
export type UsageBucket = {
  id: string;
  label: string;
  groupLabel?: string;
  used?: number;
  remaining?: number;
  limit?: number;
  unit: UsageUnit;
  currency?: string;
  windowMinutes?: number;
  /** Unix 秒（Codex 风格的 reset 时间） */
  resetsAt?: number;
  period?: string;
};

/** 一条标量指标（如 Total balance CNY 19.40） */
export type UsageMetric = {
  id: string;
  label: string;
  value: number | string;
  unit?: UsageUnit;
  currency?: string;
};

export type UsageReport = {
  providerId: string;
  providerName: string;
  capturedAt: number;
  buckets: UsageBucket[];
  metrics: UsageMetric[];
  notes?: string[];
};

export type ProviderUsageResponse =
  | { providerId: string; status: 'ready'; report: UsageReport }
  | {
      providerId: string;
      status: 'auth-unavailable' | 'query-failed';
      message: string;
    };

// ---------------------------------------------------------------------------
// 目录刷新——ADR-0011③
// ---------------------------------------------------------------------------

export const ModelsRefreshRequestSchema = z.object({
  /** 只刷这些 provider；缺省 = 全部可刷新的 */
  provider: z.string().min(1).optional(),
  /** 跳过 SDK 的新鲜度窗口立即拉取；**不覆盖** `PI_OFFLINE` */
  force: z.boolean().optional(),
});
export type ModelsRefreshRequest = z.infer<typeof ModelsRefreshRequestSchema>;

export type ModelsRefreshReason = 'offline' | 'no-refreshable-provider' | 'error';

/**
 * POST /api/models/refresh —— 只有用户点按钮才联网。
 * 响应只说「跑没跑、变了没」，**不返回模型列表**（列表照常由
 * `/api/models` 与 `/api/models/enabled` 重新读取，避免第二份形状）。
 */
export type ModelsRefreshResponse = {
  ok: boolean;
  changed: boolean;
  /** 没跑或跑了但没用的原因 */
  reason?: ModelsRefreshReason;
  /** 各 provider 的失败原因（不抛整体错误——一家挂了不该影响别人） */
  errors?: Record<string, string>;
};
