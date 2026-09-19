import { z } from 'zod';
import { ThinkingLevelSchema } from '../constants';
import { ExtensionUiRequestSchema } from '../domain/extension-ui';
import { AgentMessageSchema, ToolCallContentSchema, UsageSchema } from '../domain/message';
import { SessionEntrySchema } from '../domain/session-entry';

/**
 * ④ Agent 事件通道（docs/02 §5.1）：SSE wire 类型 ClientAgentEvent
 * = SDK JsonAgentSessionEvent 透传 ∪ 服务层自加，每事件附会话级单调递增 seq。
 *
 * 投影规则（toClientAgentEvent() 归 core，此处固化为 schema 约束）：
 * 1. 剔除 turn_start / turn_end（AgentSessionEvent 增强版 agent_end 已覆盖）
 * 2. toolcall_start / toolcall_delta 补齐 id / toolName（双字段容错后收敛）
 * 3. 剥离 partial（完整消息只经快照/历史下发，流上只有增量）
 * 4. message_update 附带 usage（SDK JSON 协议固定携带累积用量）
 *
 * 边界（docs/02 §5.1 勘误）：不定义 notice 与顶层 error 事件；
 * 不定义 auto_compaction_start/end（SDK 0.85 用 compaction_start/end + reason 区分）。
 * assistantMessageEvent 子事件按 SDK 0.85.1 实测为 12 种（无 adaptive）。
 */

// ---------------------------------------------------------------------------
// assistantMessageEvent 子事件（内嵌于 message_update，剥离 partial 后的增量）
// ---------------------------------------------------------------------------

export const JsonAssistantMessageEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('text_start'), contentIndex: z.number() }),
  z.object({ type: z.literal('text_delta'), contentIndex: z.number(), delta: z.string() }),
  z.object({ type: z.literal('text_end'), contentIndex: z.number(), content: z.string() }),
  z.object({ type: z.literal('thinking_start'), contentIndex: z.number() }),
  z.object({ type: z.literal('thinking_delta'), contentIndex: z.number(), delta: z.string() }),
  z.object({ type: z.literal('thinking_end'), contentIndex: z.number(), content: z.string() }),
  /** 投影补齐 id / toolName（从 partial.content[contentIndex] 提取） */
  z.object({
    type: z.literal('toolcall_start'),
    contentIndex: z.number(),
    id: z.string(),
    toolName: z.string(),
  }),
  z.object({
    type: z.literal('toolcall_delta'),
    contentIndex: z.number(),
    delta: z.string(),
    id: z.string(),
    toolName: z.string(),
  }),
  z.object({
    type: z.literal('toolcall_end'),
    contentIndex: z.number(),
    toolCall: ToolCallContentSchema,
  }),
  z.object({
    type: z.literal('done'),
    reason: z.enum(['stop', 'length', 'toolUse', 'deferred']),
    message: AgentMessageSchema,
  }),
  z.object({
    type: z.literal('error'),
    reason: z.enum(['aborted', 'error']),
    error: AgentMessageSchema,
  }),
]);
export type JsonAssistantMessageEvent = z.infer<typeof JsonAssistantMessageEventSchema>;

// ---------------------------------------------------------------------------
// compaction 结果（compaction_end 载荷，对齐 SDK CompactionResult）
// ---------------------------------------------------------------------------

export const CompactionResultSchema = z.object({
  summary: z.string(),
  firstKeptEntryId: z.string(),
  tokensBefore: z.number(),
  estimatedTokensAfter: z.number().optional(),
  usage: UsageSchema.optional(),
  details: z.unknown().optional(),
});
export type CompactionResult = z.infer<typeof CompactionResultSchema>;

export const COMPACTION_REASONS = ['manual', 'threshold', 'overflow'] as const;
export const CompactionReasonSchema = z.enum(COMPACTION_REASONS);
export type CompactionReason = z.infer<typeof CompactionReasonSchema>;

// ---------------------------------------------------------------------------
// 服务层自加事件的载荷
// ---------------------------------------------------------------------------

export const SESSION_SHUTDOWN_REASONS = ['idle', 'server_shutdown', 'error'] as const;
export const SessionShutdownReasonSchema = z.enum(SESSION_SHUTDOWN_REASONS);
export type SessionShutdownReason = z.infer<typeof SessionShutdownReasonSchema>;

// ---------------------------------------------------------------------------
// ClientAgentEvent 全集
// ---------------------------------------------------------------------------

/**
 * wire 事件联合。`seq` 为会话级单调递增序号：SSE `id:` 帧即 seq，
 * 断线重连经 Last-Event-ID 差量重放；快照携带 lastSeq，客户端丢弃 seq ≤ lastSeq。
 */
export const ClientAgentEventSchema = z.discriminatedUnion('type', [
  // —— SDK：消息流（AgentEvent 透传，剔除 turn_start/turn_end）——
  z.object({ type: z.literal('agent_start'), seq: z.number() }),
  z.object({ type: z.literal('message_start'), seq: z.number(), message: AgentMessageSchema }),
  z.object({
    type: z.literal('message_update'),
    seq: z.number(),
    usage: UsageSchema,
    assistantMessageEvent: JsonAssistantMessageEventSchema,
  }),
  z.object({ type: z.literal('message_end'), seq: z.number(), message: AgentMessageSchema }),
  z.object({
    type: z.literal('tool_execution_start'),
    seq: z.number(),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_execution_update'),
    seq: z.number(),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
    partialResult: z.unknown(),
  }),
  z.object({
    type: z.literal('tool_execution_end'),
    seq: z.number(),
    toolCallId: z.string(),
    toolName: z.string(),
    result: z.unknown(),
    isError: z.boolean(),
  }),
  z.object({
    type: z.literal('agent_end'),
    seq: z.number(),
    messages: z.array(AgentMessageSchema),
    willRetry: z.boolean(),
  }),
  // —— SDK：会话生命周期（agent-session 扩展）——
  z.object({ type: z.literal('agent_settled'), seq: z.number() }),
  z.object({
    type: z.literal('queue_update'),
    seq: z.number(),
    steering: z.array(z.string()),
    followUp: z.array(z.string()),
  }),
  z.object({
    type: z.literal('compaction_start'),
    seq: z.number(),
    reason: CompactionReasonSchema,
  }),
  z.object({
    type: z.literal('compaction_end'),
    seq: z.number(),
    reason: CompactionReasonSchema,
    result: CompactionResultSchema.optional(),
    aborted: z.boolean(),
    willRetry: z.boolean(),
    errorMessage: z.string().optional(),
  }),
  z.object({
    type: z.literal('auto_retry_start'),
    seq: z.number(),
    attempt: z.number(),
    maxAttempts: z.number(),
    delayMs: z.number(),
    errorMessage: z.string(),
  }),
  z.object({
    type: z.literal('auto_retry_end'),
    seq: z.number(),
    success: z.boolean(),
    attempt: z.number(),
    finalError: z.string().optional(),
  }),
  z.object({
    type: z.literal('summarization_retry_scheduled'),
    seq: z.number(),
    attempt: z.number(),
    maxAttempts: z.number(),
    delayMs: z.number(),
    errorMessage: z.string(),
  }),
  z.object({
    type: z.literal('summarization_retry_attempt_start'),
    seq: z.number(),
    source: z.enum(['branchSummary', 'compaction']),
    /** 仅 source=compaction 时携带（语义约束由 core 投影保证） */
    reason: CompactionReasonSchema.optional(),
  }),
  z.object({ type: z.literal('summarization_retry_finished'), seq: z.number() }),
  z.object({ type: z.literal('entry_appended'), seq: z.number(), entry: SessionEntrySchema }),
  /** name 缺省（JSON 字段缺失）= 清除命名 */
  z.object({
    type: z.literal('session_info_changed'),
    seq: z.number(),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('thinking_level_changed'),
    seq: z.number(),
    level: ThinkingLevelSchema,
  }),
  z.object({
    type: z.literal('bash_execution_update'),
    seq: z.number(),
    id: z.string().optional(),
    delta: z.string(),
  }),
  // —— 服务层自加（SDK 没有，server 必须自行定义）——
  /** SSE 建流成功；随后立即下发快照 message_start（进行中的半截消息）再续增量 */
  z.object({
    type: z.literal('connected'),
    seq: z.number(),
    sessionId: z.string(),
    isStreaming: z.boolean(),
  }),
  z.object({ type: z.literal('startup_error'), seq: z.number(), errorMessage: z.string() }),
  z.object({ type: z.literal('prompt_done'), seq: z.number() }),
  z.object({ type: z.literal('prompt_error'), seq: z.number(), errorMessage: z.string() }),
  z.object({
    type: z.literal('session_shutdown'),
    seq: z.number(),
    reason: SessionShutdownReasonSchema.optional(),
  }),
  z.object({
    type: z.literal('extension_ui_request'),
    seq: z.number(),
    request: ExtensionUiRequestSchema,
  }),
  z.object({
    type: z.literal('extension_error'),
    seq: z.number(),
    extensionPath: z.string(),
    errorMessage: z.string(),
  }),
  z.object({ type: z.literal('extension_ui_closed'), seq: z.number(), id: z.string() }),
]);
export type ClientAgentEvent = z.infer<typeof ClientAgentEventSchema>;

/** 事件全集字面量（供客户端 switch 穷尽检查与测试枚举） */
export const CLIENT_AGENT_EVENT_TYPES = [
  'agent_start',
  'message_start',
  'message_update',
  'message_end',
  'tool_execution_start',
  'tool_execution_update',
  'tool_execution_end',
  'agent_end',
  'agent_settled',
  'queue_update',
  'compaction_start',
  'compaction_end',
  'auto_retry_start',
  'auto_retry_end',
  'summarization_retry_scheduled',
  'summarization_retry_attempt_start',
  'summarization_retry_finished',
  'entry_appended',
  'session_info_changed',
  'thinking_level_changed',
  'bash_execution_update',
  'connected',
  'startup_error',
  'prompt_done',
  'prompt_error',
  'session_shutdown',
  'extension_ui_request',
  'extension_error',
  'extension_ui_closed',
] as const;
export type ClientAgentEventType = (typeof CLIENT_AGENT_EVENT_TYPES)[number];

/** message_update 内嵌子事件类型直通（避免外部重复 import） */
export type AssistantStreamEvent = JsonAssistantMessageEvent;
