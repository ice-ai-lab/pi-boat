import { z } from 'zod';
import { ThinkingLevelSchema } from '../constants';
import {
  type ExtensionStatusItem,
  ExtensionStatusItemSchema,
  type ExtensionWidgetItem,
  ExtensionWidgetItemSchema,
} from './extension-ui';
import { type ModelRef, ModelRefSchema } from './session-info';

/**
 * 状态与统计（docs/02 §3.4）。
 * AgentState 为 `get_state` / `GET /api/agent/:id` 的返回形状，
 * 在 SDK RpcSessionState 基础上补齐 PiBoat 所需运行时字段。
 */

/** 上下文窗口占用（对齐 SDK extensions ContextUsage） */
export const ContextUsageSchema = z.object({
  /** 估算上下文 token 数；未知（如压缩后首轮前）为 null */
  tokens: z.number().nullable(),
  contextWindow: z.number(),
  /** 占窗口百分比；tokens 未知时为 null */
  percent: z.number().nullable(),
});
export type ContextUsage = z.infer<typeof ContextUsageSchema>;

/** 排队消息快照（steering = 插队，followUp = 收尾后追问） */
export const QueuedMessagesSchema = z.object({
  steering: z.array(z.string()),
  followUp: z.array(z.string()),
});
export type QueuedMessages = z.infer<typeof QueuedMessagesSchema>;

export const AgentStateSchema = z.object({
  sessionId: z.string(),
  sessionFile: z.string().optional(),
  isStreaming: z.boolean(),
  isPromptRunning: z.boolean(),
  isBashRunning: z.boolean(),
  isCompacting: z.boolean(),
  autoCompactionEnabled: z.boolean(),
  autoRetryEnabled: z.boolean(),
  model: ModelRefSchema.nullable(),
  messageCount: z.number(),
  pendingMessageCount: z.number(),
  queuedMessages: QueuedMessagesSchema,
  /**
   * 事件流水位线：本快照反映截至该 seq 的状态（与各字段同块同步读取，
   * 单线程 + 同步 dispatch 保证「在快照里 ⇒ seq ≤ lastSeq」）；
   * 客户端丢弃 SSE 流中 seq ≤ lastSeq 的事件（docs/01 §5.4 双通道对账）。
   */
  lastSeq: z.number(),
  contextUsage: ContextUsageSchema.nullable(),
  systemPrompt: z.string(),
  thinkingLevel: ThinkingLevelSchema,
  extensionStatuses: z.array(ExtensionStatusItemSchema),
  extensionWidgets: z.array(ExtensionWidgetItemSchema),
});
export type AgentState = z.infer<typeof AgentStateSchema>;

/** token 四项汇总（SessionStatsInfo.tokens） */
export const TokenSummarySchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  total: z.number(),
});
export type TokenSummary = z.infer<typeof TokenSummarySchema>;

/** `get_session_stats` 返回（对齐 SDK SessionStats + rpc 层附加 sessionName/totalActiveMs） */
export const SessionStatsInfoSchema = z.object({
  sessionFile: z.string().optional(),
  sessionId: z.string(),
  userMessages: z.number(),
  assistantMessages: z.number(),
  toolCalls: z.number(),
  toolResults: z.number(),
  totalMessages: z.number(),
  tokens: TokenSummarySchema,
  cost: z.number(),
  contextUsage: ContextUsageSchema.optional(),
  /** rpc 层附加：会话活跃时长（毫秒） */
  totalActiveMs: z.number().optional(),
  /** rpc 层附加：当前会话名 */
  sessionName: z.string().optional(),
});
export type SessionStatsInfo = z.infer<typeof SessionStatsInfoSchema>;

/** 保留具名导出避免与 ModelRef 循环引用时的类型擦拭 */
export type { ExtensionStatusItem, ExtensionWidgetItem, ModelRef };
