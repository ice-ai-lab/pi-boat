import { z } from 'zod';
import {
  SessionContextSchema,
  SessionInfoSchema,
  SessionTreeNodeSchema,
} from '../domain/session-info';
import { SessionStatsInfoSchema } from '../domain/state';
import { type AgentRunningState, AgentRunningStateSchema } from './agent';

/**
 * ⑤ REST 资源——会话域（docs/02 §6.1 列表/搜索 / §6.2 详情与生命周期 / §6.3 分页与惰性加载）。
 * agent 运行时域（/api/agent/*）拆至 ./agent——按 core 双服务边界分域（2026-09-22）。
 * 路径常量 + 请求/响应类型 + Zod schema 三件套（docs/02 §10）。
 */

// ---------------------------------------------------------------------------
// 路径常量（server 路由与 client SDK 共用的单一来源）
// ---------------------------------------------------------------------------

export const SESSIONS_PATH = '/api/sessions' as const;
export const SESSION_SEARCH_PATH = '/api/sessions/search' as const;
export const sessionPath = (id: string) => `/api/sessions/${id}` as const;
export const sessionStatePath = (id: string) => `/api/sessions/${id}/state` as const;
export const sessionExportPath = (id: string) => `/api/sessions/${id}/export` as const;
export const sessionAutoNamePath = (id: string) => `/api/sessions/${id}/auto-name` as const;
export const sessionContextPath = (id: string) => `/api/sessions/${id}/context` as const;
export const entryThinkingPath = (id: string, entryId: string) =>
  `/api/sessions/${id}/entries/${entryId}/thinking` as const;
export const entryToolResultImagePath = (id: string, entryId: string) =>
  `/api/sessions/${id}/entries/${entryId}/tool-result-image` as const;

// ---------------------------------------------------------------------------
// §6.1 会话列表
// ---------------------------------------------------------------------------

/**
 * GET /api/sessions?force=1（磁盘扫描与运行时注册表合并）
 *
 * ⚠️ `registryVersion` 只反映**运行时注册表**的结构性变动（create/dispose）。
 * 磁盘扫描侧的变动（其他进程写入会话、本 server 建的会话首条 assistant 消息落盘、
 * 改名/fork）都不在此列——客户端不能只靠它决定要不要全量刷新列表；
 * 跨进程/磁盘侧的变更通知待 M2 定（2026-09-21 改名定案）。
 */
export const SessionListResponseSchema = z.object({
  sessions: z.array(SessionInfoSchema),
  /** 运行时注册表版本号：每次 create/dispose +1 */
  registryVersion: z.number(),
  runningSessionIds: z.array(z.string()),
  /** 已抑制完成通知的会话（避免轮询刷新期间重复弹通知） */
  completionNotificationSuppressedSessionIds: z.array(z.string()),
});
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

/** GET /api/sessions/search?q —— q ≤ 200 字符，结果复用列表项渲染 */
export const SessionSearchRequestSchema = z.object({
  q: z.string().max(200),
});
export type SessionSearchRequest = z.infer<typeof SessionSearchRequestSchema>;
export const SessionSearchResponseSchema = z.object({
  sessions: z.array(SessionInfoSchema),
});
export type SessionSearchResponse = z.infer<typeof SessionSearchResponseSchema>;

// ---------------------------------------------------------------------------
// §6.2 会话详情与生命周期
// ---------------------------------------------------------------------------

/** GET /api/sessions/:id（tail 默认 50，上限 1000） */
export const SessionDetailResponseSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
  info: SessionInfoSchema,
  leafId: z.string().nullable(),
  tree: z.array(SessionTreeNodeSchema),
  context: SessionContextSchema,
  stats: SessionStatsInfoSchema,
  totalActiveMs: z.number(),
  toolNames: z.array(z.string()).optional(),
});
export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;

/** PATCH /api/sessions/:id —— 改名（历史未运行会话直接追加 session_info 行） */
export const SessionRenameRequestSchema = z.object({
  name: z.string(),
});
export type SessionRenameRequest = z.infer<typeof SessionRenameRequestSchema>;

/** DELETE /api/sessions/:id —— 级联删除全部 subagent 子会话，返回受影响 id */
export const SessionDeleteResponseSchema = z.object({
  deletedIds: z.array(z.string()),
});
export type SessionDeleteResponse = z.infer<typeof SessionDeleteResponseSchema>;

/**
 * GET /api/sessions/:id/state —— 形状同 AgentRunningState，
 * 但会话文件不存在时 404（而非 {running:false}；语义差异需保留）。
 */
export type SessionStateResponse = AgentRunningState;
export const SessionStateResponseSchema = AgentRunningStateSchema;

/** POST /api/sessions/:id/auto-name —— LLM 生成会话名 */
export const SessionAutoNameResponseSchema = z.object({
  title: z.string(),
  usage: z.unknown().optional(),
});
export type SessionAutoNameResponse = z.infer<typeof SessionAutoNameResponseSchema>;

// ---------------------------------------------------------------------------
// §6.3 历史分页与惰性加载
// ---------------------------------------------------------------------------

/**
 * GET /api/sessions/:id/context 查询参数：
 * - leafId：从该叶向根回溯（缺省 = 当前 leaf）
 * - before：客户端已有最老条目 id（excludeLeaf 向上翻页；不在会话中/即根 → 空页）
 * - tail：窗口大小（默认 50，上限 1000；只计 user/assistant/压缩分隔条，toolResult 不吃预算）
 * - deferMedia：工具结果图片以占位符下发
 *
 * 行为保证：历史分页不做压缩过滤——压缩前条目照常可翻（compaction 投影为
 * compactionSummary 分隔条，不是翻页终点）；LLM 上下文投影（SDK
 * buildContextEntries）是另一回事，不用于本接口。
 */
export const SessionContextQuerySchema = z.object({
  leafId: z.string().optional(),
  before: z.string().optional(),
  tail: z.number().int().min(1).max(1000).optional(),
  deferMedia: z.boolean().optional(),
});
export type SessionContextQuery = z.infer<typeof SessionContextQuerySchema>;

/** GET /api/sessions/:id/entries/:entryId/thinking?blockIndex —— 全量推理文本 */
export const EntryThinkingQuerySchema = z.object({
  blockIndex: z.number().int().min(0),
});
export type EntryThinkingQuery = z.infer<typeof EntryThinkingQuerySchema>;
export const EntryThinkingResponseSchema = z.object({
  thinking: z.string(),
});
export type EntryThinkingResponse = z.infer<typeof EntryThinkingResponseSchema>;

/** GET /api/sessions/:id/entries/:entryId/tool-result-image?blockIndex —— 二进制图片（无 JSON schema） */
export const ToolResultImageQuerySchema = z.object({
  blockIndex: z.number().int().min(0),
});
export type ToolResultImageQuery = z.infer<typeof ToolResultImageQuerySchema>;
