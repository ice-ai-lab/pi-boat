import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ExtensionUiRequest } from '../domain/extension-ui';

/**
 * Agent 事件通道（docs/02 §5.1）。
 *
 * **不重新定义**（ADR-0017）：SDK 事件透传段的形状直接取自 pi-coding-agent 的
 * `JsonAgentSessionEvent`——那是 SDK 自家 JSON / RPC stdout 协议的事件联合，
 * 与我们的投影规则逐条一致（剥离累积 partial、toolcall 增量补 id/toolName）。
 * 本文件只声明两件 SDK 没有的东西：
 * 1. 每个事件附会话级单调递增 `seq`
 * 2. 5 个服务层自加事件（connected / session_shutdown / session_replaced /
 *    extension_ui_request / extension_ui_closed）
 *
 * 投影（含 system 消息过滤、partial 剥离）仍在 core 的 `events/wire-event.ts`——
 * SDK 只导出了 `JsonAgentSessionEvent` **类型**，没有导出 `toJsonEvent()` 函数。
 */

export type { CompactionResult } from '@earendil-works/pi-coding-agent';

/** 附 seq：分配律（保住判别联合，直接 `& {seq}` 会塌缩成公共键） */
type WithSeq<T> = T extends unknown ? T & { seq: number } : never;

/** 会话终止原因（服务层自加事件） */
export type SessionShutdownReason = 'idle' | 'server_shutdown' | 'error';

/**
 * 会话运行时被替换的原因（`session_replaced` 事件）。
 * 这四种都会让**会话 id 改变**，因此必须在下发 `session_shutdown` 之前告知客户端新 id，
 * 否则观看中的标签页只能重连到一个已不存在的旧 id（fork 的原地替换语义，docs/01 §8-1）。
 *
 * ⚠️ `navigate_tree` **不在**此列：它只是在同一文件里换叶节点，会话 id 不变。
 */
export type SessionReplacedReason = 'new' | 'fork' | 'clone' | 'resume';

/**
 * 宿主主动关闭扩展对话框的原因（`extension_ui_closed` 事件）。
 * 客户端据此撑下留在屏幕上的对话框；服务端不会再处理该 id 的应答。
 */
export type ExtensionUiCloseReason = 'timeout' | 'shutdown';

/** 服务层自加事件（SDK 事件集里没有，server 必须自行定义） */
type PiBoatEvent =
  /**
   * SSE 建流成功；随后立即下发快照 message_start（进行中的半截消息）再续增量。
   * lastSeq 为快照水位线：本连接的快照反映截至该 seq 的状态，客户端丢弃
   * seq ≤ lastSeq 的事件（与 get_state 双通道对账，docs/01 §5.4）。
   */
  | { type: 'connected'; sessionId: string; isStreaming: boolean; lastSeq: number }
  | { type: 'session_shutdown'; reason?: SessionShutdownReason }
  /**
   * 会话运行时被替换：会话 id 已改变，本流随即 shutdown。收到本事件应改用
   * `newSessionId` 重新建流（而非重连旧 id）。发起方也可直接从命令信封的
   * `newSessionId` 得知，本事件面向**其他观看者**（多标签页）。
   */
  | { type: 'session_replaced'; newSessionId: string; reason: SessionReplacedReason }
  /**
   * 扩展 UI 请求（ADR-0012）：客户端须以 `extension_ui_response` 命令应答
   * 阻塞型 method，否则请求会一直挂到宿主默认超时（`{cancelled:true}`）。
   */
  | { type: 'extension_ui_request'; request: ExtensionUiRequest }
  /** 宿主主动关闭该对话框（默认超时 / 会话终止）；客户端应撑下它 */
  | { type: 'extension_ui_closed'; id: string; reason: ExtensionUiCloseReason };

/**
 * wire 事件联合。`seq` 为会话级单调递增序号：SSE `id:` 帧即 seq，
 * 断线重连经 Last-Event-ID 差量重放；快照携带 lastSeq，客户端丢弃 seq ≤ lastSeq。
 *
 * `bash_execution_update` 被排除：Shell 直连（TUI 的 `!`）不实现，core 投影丢弃它
 * （docs/02 §4 移除注，2026-09-22 决策）。
 */
export type WireAgentEvent = WithSeq<
  Exclude<JsonAgentSessionEvent, { type: 'bash_execution_update' }> | PiBoatEvent
>;

/** 事件名全集（客户端 switch 穷尽检查、docs/02 核对与测试枚举） */
export const WIRE_AGENT_EVENT_TYPES = [
  'agent_start',
  'turn_start',
  'turn_end',
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
  'connected',
  'session_shutdown',
  'session_replaced',
  'extension_ui_request',
  'extension_ui_closed',
] as const;
export type WireAgentEventType = (typeof WIRE_AGENT_EVENT_TYPES)[number];

/** `message_update` 内嵌子事件（剥离 partial、toolcall 增量补 id/toolName 后的形态） */
export type AssistantStreamEvent = Extract<
  WireAgentEvent,
  { type: 'message_update' }
>['assistantMessageEvent'];
