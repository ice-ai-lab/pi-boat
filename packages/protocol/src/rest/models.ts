import { z } from 'zod';
import { ThinkingLevelSchema } from '../constants';
import { ModelRefSchema } from '../domain/session-info';

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
 */

// ---------------------------------------------------------------------------
// §6.4 可见模型与思考档位
// ---------------------------------------------------------------------------

/** 选择器条目（`input` 声明模型接受的模态，前端据此决定是否挂图片按钮） */
export const ModelListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  input: z.array(z.string()),
});
export type ModelListItem = z.infer<typeof ModelListItemSchema>;

export const ModelsQuerySchema = z.object({
  /** 解析项目资源的 cwd；缺省 = 服务进程 cwd（必须已存在且为目录） */
  cwd: z.string().optional(),
});
export type ModelsQuery = z.infer<typeof ModelsQuerySchema>;

export const ModelsResponseSchema = z.object({
  /** `provider:id` → display name（会话列表等处按 key 查名） */
  models: z.record(z.string(), z.string()),
  modelList: z.array(ModelListItemSchema),
  defaultModel: ModelRefSchema.nullable(),
  defaultThinkingLevel: ThinkingLevelSchema.nullable(),
  /** `provider:id` → 该模型支持的思考档位 */
  thinkingLevels: z.record(z.string(), z.array(z.string())),
  /** `provider:id` → 档位映射（`null` = 该档位不可用；缺键 = 用默认语义） */
  thinkingLevelMaps: z.record(z.string(), z.record(z.string(), z.string().nullable())),
  /** `provider:id` → 模式里钉住的档位（`model:high` 这种） */
  thinkingLevelPins: z.record(z.string(), z.string()),
  /** 作用域解析的诊断（匹配不到的 pattern / 非法档位后缀） */
  modelScopeWarnings: z.array(z.string()).optional(),
  /** 模型源加载错误（如 models.json 崩了）；有值时上方各表可能为空 */
  error: z.string().optional(),
});
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;

// ---------------------------------------------------------------------------
// models.json 原文读写
// ---------------------------------------------------------------------------

/** GET /api/models-config —— 原文（含注释剥离后的解析结果）+ 实际文件路径 */
export const ModelsConfigResponseSchema = z.object({
  modelsPath: z.string(),
  config: z.record(z.string(), z.unknown()),
});
export type ModelsConfigResponse = z.infer<typeof ModelsConfigResponseSchema>;

/** PUT /api/models-config —— 整份覆盖（面板保存的草稿） */
export const ModelsConfigUpdateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type ModelsConfigUpdate = z.infer<typeof ModelsConfigUpdateSchema>;

/** 自定义 provider 描述（discover/test 共用） */
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

export const DiscoveredModelSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type DiscoveredModel = z.infer<typeof DiscoveredModelSchema>;

export const ModelsConfigDiscoverResponseSchema = z.object({
  models: z.array(DiscoveredModelSchema),
  /** 发现失败时的可读原因（HTTP 状态 / 网络错误），不抛 500——是诊断端点 */
  error: z.string().optional(),
});
export type ModelsConfigDiscoverResponse = z.infer<typeof ModelsConfigDiscoverResponseSchema>;

/** POST /api/models-config/test —— 真实补全请求测连通 */
export const ModelsConfigTestRequestSchema = z.object({
  providerName: z.string().min(1),
  provider: ProviderDraftSchema,
  model: z.object({ id: z.string().min(1) }),
});
export type ModelsConfigTestRequest = z.infer<typeof ModelsConfigTestRequestSchema>;

export const ModelsConfigTestResponseSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
  /** 模型回显的一小段文本（成功时） */
  text: z.string().optional(),
});
export type ModelsConfigTestResponse = z.infer<typeof ModelsConfigTestResponseSchema>;

/**
 * GET /api/models-config/catalog?q —— models.dev 目录的服务端代理
 * （1h 缓存；浏览器不直连外网，避免 CORS 与隐私泄漏）
 */
export const ModelsCatalogQuerySchema = z.object({
  q: z.string().optional(),
});
export type ModelsCatalogQuery = z.infer<typeof ModelsCatalogQuerySchema>;

export const CatalogModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  /** 上下文窗口（目录里给得出时才带） */
  contextWindow: z.number().optional(),
  reasoning: z.boolean().optional(),
});
export type CatalogModel = z.infer<typeof CatalogModelSchema>;

export const ModelsCatalogResponseSchema = z.object({
  models: z.array(CatalogModelSchema),
  /** 目录不可用（离线 / 上游挂） */
  error: z.string().optional(),
});
export type ModelsCatalogResponse = z.infer<typeof ModelsCatalogResponseSchema>;

// ---------------------------------------------------------------------------
// §6.4 可见范围（enabledModels）——ADR-0011
// ---------------------------------------------------------------------------

export const MODELS_ENABLED_SCOPES = ['global', 'project'] as const;
export const ModelsEnabledScopeSchema = z.enum(MODELS_ENABLED_SCOPES);
export type ModelsEnabledScope = z.infer<typeof ModelsEnabledScopeSchema>;

/**
 * GET /api/models/enabled
 *
 * `scope` 是**生效来源**：`project` 表示项目 `.pi/settings.json` 里有
 * `enabledModels`，它整体替换全局值 ⇒ 面板必须只读渲染（ADR-0011②）。
 */
export const ModelsEnabledResponseSchema = z.object({
  /** 原始 pattern 列表（**未解析**；含匹配不到任何模型的项，用户可能是为将来备的） */
  patterns: z.array(z.string()),
  /** 解析结果（选择器实际可见的模型） */
  models: z.array(ModelListItemSchema),
  scope: ModelsEnabledScopeSchema,
  /** 生效的 settings.json 路径（前端要告诉用户"改的是哪个文件"） */
  settingsPath: z.string(),
  /** 项目 shadow 时不可写（ADR-0011②） */
  canWrite: z.boolean(),
  warnings: z.array(z.string()),
});
export type ModelsEnabledResponse = z.infer<typeof ModelsEnabledResponseSchema>;

export const MODELS_ENABLED_OPS = ['toggle', 'prune', 'resync'] as const;
export const ModelsEnabledOpSchema = z.enum(MODELS_ENABLED_OPS);
export type ModelsEnabledOp = z.infer<typeof ModelsEnabledOpSchema>;

/**
 * PUT /api/models/enabled
 *
 * - `toggle`（缺省）：只改**这一个模型**的可见性，其余 pattern 原样保留
 *   （最小编辑：匹配不到的项、`:level` 后缀、用户手写的具名列表都不动）
 * - `prune`：丢弃匹配不到任何模型的 pattern（显式修复操作，普通开关永不隐式重写）
 * - `resync`：按当前目录修复改名残留（模型改名 / provider 前缀不再覆盖）
 *
 * ⚠️ 禁用最后一个模型 → **409 + reason:'last-model'**：空列表在 pi 里等于"全开"，
 * 与用户意图相反（ADR-0011）。
 */
export const ModelsEnabledUpdateSchema = z.object({
  cwd: z.string().optional(),
  op: ModelsEnabledOpSchema.optional(),
  /** `prune` / `resync` 下可省（它们作用于整份列表） */
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  enabled: z.boolean().optional(),
});
export type ModelsEnabledUpdate = z.infer<typeof ModelsEnabledUpdateSchema>;

/** 409 的 reason 载荷（server 直接下发，前端据文案提示） */
export const MODELS_ENABLED_REJECTIONS = [
  'last-model',
  'project-shadow',
  'no-enabled-models',
] as const;
export const ModelsEnabledRejectionSchema = z.enum(MODELS_ENABLED_REJECTIONS);
export type ModelsEnabledRejection = z.infer<typeof ModelsEnabledRejectionSchema>;

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

export const MODELS_REFRESH_REASONS = ['offline', 'no-refreshable-provider', 'error'] as const;
export const ModelsRefreshReasonSchema = z.enum(MODELS_REFRESH_REASONS);
export type ModelsRefreshReason = z.infer<typeof ModelsRefreshReasonSchema>;

/**
 * POST /api/models/refresh —— 只有用户点按钮才联网。
 * 响应只说「跑没跑、变了没」，**不返回模型列表**（列表照常由
 * `/api/models` 与 `/api/models/enabled` 重新读取，避免第二份形状）。
 */
export const ModelsRefreshResponseSchema = z.object({
  ok: z.boolean(),
  changed: z.boolean(),
  /** 没跑或跑了但没用的原因 */
  reason: ModelsRefreshReasonSchema.optional(),
  /** 各 provider 的失败原因（不抛整体错误——一家挂了不该影响别人） */
  errors: z.record(z.string(), z.string()).optional(),
});
export type ModelsRefreshResponse = z.infer<typeof ModelsRefreshResponseSchema>;
