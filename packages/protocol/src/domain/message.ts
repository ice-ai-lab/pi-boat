import type { SessionMessageEntry } from '@earendil-works/pi-coding-agent';

/**
 * 消息与内容块 wire 类型（docs/02 §3.2）。
 *
 * **不重新定义**（ADR-0017）：形状全部来自 pi-ai / pi-coding-agent 的公开导出，
 * 这里只做 re-export 与按 role 提取；SDK 加字段我们自动跟进，不需要维护第二份定义。
 */

// pi-ai：LLM 消息、内容块、用量、停止原因、流式子事件（其 types.ts 被 export * 转出）
export type {
  AssistantMessage,
  AssistantMessageEvent,
  ImageContent,
  Message,
  StopReason,
  SystemMessage,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from '@earendil-works/pi-ai';

// pi-coding-agent：会话条目（其 message 载荷即八角色 AgentMessage）
export type { SessionEntry, SessionMessageEntry } from '@earendil-works/pi-coding-agent';

/**
 * 统一消息联合：pi-ai 的四角色（system / user / assistant / toolResult）
 * 加编码 agent 的四个自定义角色（bashExecution / custom / branchSummary / compactionSummary）。
 *
 * SDK 没有从包根导出这个八角色联合（`AgentMessage` 定义在 pi-agent-core，靠
 * pi-coding-agent 的模块增强补出后四个角色），因此从 `SessionMessageEntry` 的载荷提取
 * ——比依赖模块增强稳，也少一个直接依赖。
 */
export type AgentMessage = SessionMessageEntry['message'];

// 四个自定义角色按 role 提取（SDK 未逐个导出：定义在 core/messages.ts，不在公开面）
export type BashExecutionMessage = Extract<AgentMessage, { role: 'bashExecution' }>;
export type BranchSummaryMessage = Extract<AgentMessage, { role: 'branchSummary' }>;
export type CompactionSummaryMessage = Extract<AgentMessage, { role: 'compactionSummary' }>;
export type CustomMessage = Extract<AgentMessage, { role: 'custom' }>;

/** 消息内容块联合（用户侧 text/image；assistant 侧含 thinking/toolCall） */
