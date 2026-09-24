import { z } from 'zod';

/**
 * 消息与内容块 wire 类型（docs/02 §3.2）。
 * 基础形状对齐 SDK 0.85.1：pi-ai `types.ts` 的 Message/内容块/Usage，
 * 以及 pi-coding-agent `core/messages.ts` 的 BashExecutionMessage/CustomMessage。
 * SDK 字段变动不泄漏出 core：投影时以本文件为唯一 wire 契约（AGENTS.md）。
 */

// ---------------------------------------------------------------------------
// 内容块
// ---------------------------------------------------------------------------

export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  /** pi-ai 文本签名（多轮缓存续传用），部分 provider 下发 */
  textSignature: z.string().optional(),
});
export type TextContent = z.infer<typeof TextContentSchema>;

export const ThinkingContentSchema = z.object({
  type: z.literal('thinking'),
  /** thinking 全文 */
  thinking: z.string(),
  thinkingSignature: z.string().optional(),
  redacted: z.boolean().optional(),
});
export type ThinkingContent = z.infer<typeof ThinkingContentSchema>;

export const ImageContentSchema = z.object({
  type: z.literal('image'),
  /** base64（无 data: 前缀），对齐 pi-ai ImageContent */
  data: z.string(),
  mimeType: z.string(),
});
export type ImageContent = z.infer<typeof ImageContentSchema>;

/**
 * 工具调用内容块（文件存储形状 `{id, name, arguments}`，对齐 pi-ai ToolCall）。
 */
export const ToolCallContentSchema = z.object({
  type: z.literal('toolCall'),
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  thoughtSignature: z.string().optional(),
  namespace: z.string().optional(),
});
export type ToolCallContent = z.infer<typeof ToolCallContentSchema>;

// ---------------------------------------------------------------------------
// 用量
// ---------------------------------------------------------------------------

/** token 用量与成本（对齐 pi-ai Usage；core 投影时补齐缺省的 cost 分解） */
export const UsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  cacheWrite1h: z.number().optional(),
  reasoning: z.number().optional(),
  totalTokens: z.number(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    total: z.number(),
  }),
});
export type Usage = z.infer<typeof UsageSchema>;

// ---------------------------------------------------------------------------
// 消息（AgentMessage = LLM 消息 + 编码 agent 自定义消息）
// ---------------------------------------------------------------------------

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(z.union([TextContentSchema, ImageContentSchema]))]),
  timestamp: z.number(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export const STOP_REASONS = [
  'pending',
  'stop',
  'length',
  'toolUse',
  'error',
  'aborted',
  'deferred',
] as const;
export const StopReasonSchema = z.enum(STOP_REASONS);
export type StopReason = z.infer<typeof StopReasonSchema>;

export const AssistantMessageSchema = z.object({
  role: z.literal('assistant'),
  content: z.array(z.union([TextContentSchema, ThinkingContentSchema, ToolCallContentSchema])),
  api: z.string(),
  provider: z.string(),
  model: z.string(),
  responseModel: z.string().optional(),
  responseId: z.string().optional(),
  providerThinkingLevel: z.string().optional(),
  usage: UsageSchema,
  stopReason: StopReasonSchema,
  errorMessage: z.string().optional(),
  endTurn: z.boolean().optional(),
  timestamp: z.number(),
});
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

export const ToolResultMessageSchema = z.object({
  role: z.literal('toolResult'),
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.array(z.union([TextContentSchema, ImageContentSchema])),
  /** 工具自定义结构化细节（渲染用），形状由具体工具约定 */
  details: z.unknown().optional(),
  usage: UsageSchema.optional(),
  addedToolNames: z.array(z.string()).optional(),
  isError: z.boolean(),
  timestamp: z.number(),
});
export type ToolResultMessage = z.infer<typeof ToolResultMessageSchema>;

/** `!` 命令的 bash 执行记录（对齐 core/messages.ts BashExecutionMessage） */
export const BashExecutionMessageSchema = z.object({
  role: z.literal('bashExecution'),
  command: z.string(),
  output: z.string(),
  /** 进程被杀/取消时缺省 */
  exitCode: z.number().optional(),
  cancelled: z.boolean(),
  truncated: z.boolean(),
  fullOutputPath: z.string().optional(),
  timestamp: z.number(),
  /** true = `!!` 前缀，不进 LLM 上下文 */
  excludeFromContext: z.boolean().optional(),
});
export type BashExecutionMessage = z.infer<typeof BashExecutionMessageSchema>;

/** 扩展经 sendMessage() 注入的消息（对齐 core/messages.ts CustomMessage） */
export const CustomMessageSchema = z.object({
  role: z.literal('custom'),
  customType: z.string(),
  content: z.union([z.string(), z.array(z.union([TextContentSchema, ImageContentSchema]))]),
  display: z.boolean(),
  details: z.unknown().optional(),
  timestamp: z.number(),
});
export type CustomMessage = z.infer<typeof CustomMessageSchema>;

/** 分支回归摘要（对齐 core/messages.ts BranchSummaryMessage；注入 LLM 上下文的合成消息，无 display 字段） */
export const BranchSummaryMessageSchema = z.object({
  role: z.literal('branchSummary'),
  summary: z.string(),
  fromId: z.string().nullable(),
  timestamp: z.number(),
});
export type BranchSummaryMessage = z.infer<typeof BranchSummaryMessageSchema>;

/** 压缩摘要（对齐 core/messages.ts CompactionSummaryMessage；注入 LLM 上下文的合成消息，无 display 字段） */
export const CompactionSummaryMessageSchema = z.object({
  role: z.literal('compactionSummary'),
  summary: z.string(),
  tokensBefore: z.number(),
  timestamp: z.number(),
});
export type CompactionSummaryMessage = z.infer<typeof CompactionSummaryMessageSchema>;

/**
 * 转录 system 消息（SDK ≥ 0.86）：每次请求把 prompt 段落 + 工具声明落盘，
 * 并以 `message_start` / `message_end` 广播。**载体可达但不进 UI**：它携带完整
 * prompt 与全部工具 schema，体积大且不是对话内容。
 *
 * 两条路径的处置（两者必须一致，否则实时与历史形状漂移）：
 * - 实时：core 投影层直接丢弃（`events/wire-event.ts`，不消耗 seq）
 * - 历史：保留在原始条目与树里（`SessionTreeNode.entry`），但 `context.messages`
 *   投影跳过它
 */
export const SystemMessageSchema = z.object({
  role: z.literal('system'),
  content: z.union([z.string(), z.array(TextContentSchema)]),
  /** 具名、有序的 prompt 段落：后到的消息按名替换，`null` 表示移除该段 */
  sections: z.record(z.string(), z.string().nullable()).optional(),
  /** 此点起可用的工具完整定义 / 不再可用的工具引用（形状由扩展约定，不进 UI） */
  toolsAdded: z.array(z.unknown()).optional(),
  toolsRemoved: z.array(z.unknown()).optional(),
  timestamp: z.number(),
});
export type SystemMessage = z.infer<typeof SystemMessageSchema>;

/** wire 层统一消息联合（与 SDK AgentMessage 对齐：八角色） */
export const AgentMessageSchema = z.discriminatedUnion('role', [
  UserMessageSchema,
  AssistantMessageSchema,
  ToolResultMessageSchema,
  BashExecutionMessageSchema,
  CustomMessageSchema,
  BranchSummaryMessageSchema,
  CompactionSummaryMessageSchema,
  SystemMessageSchema,
]);
export type AgentMessage = z.infer<typeof AgentMessageSchema>;

/** 消息内容块联合（用户侧仅 text/image；assistant 侧含 thinking/toolCall） */
export type MessageContent = TextContent | ThinkingContent | ImageContent | ToolCallContent;
