import type { ContextUsage, RpcSessionState, SessionStats } from '@earendil-works/pi-coding-agent';
import type { ThinkingLevel } from '../constants';
import type { ExtensionStatusItem, ExtensionWidgetItem } from './extension-ui';
import type { ModelRef } from './session-info';

/**
 * 状态与统计（docs/02 §3.4）。
 *
 * **不重新定义**（ADR-0017）：能从 SDK 拿的都拿——
 * - `ContextUsage` / `SessionStats` / `RpcSessionState` 都是 pi-coding-agent 的公开导出
 * - `AgentState` 在 `RpcSessionState` 基础上按需 `Pick`，再叠加 PiBoat 运行时字段
 *   （快照水位线 `lastSeq`、队列、扩展状态、系统提示词）。**不复制** SDK 已有的字段清单。
 */

export type { ContextUsage } from '@earendil-works/pi-coding-agent';
/** 排队消息快照（steering = 插队，followUp = 收尾后追问） */
export type QueuedMessages = { steering: string[]; followUp: string[] };

/** 快照里取自 SDK 的部分（其余字段属于 PiBoat 运行时语义，SDK 没有） */
type AgentStateFromSdk = Pick<
  RpcSessionState,
  | 'sessionId'
  | 'sessionFile'
  | 'isStreaming'
  | 'isCompacting'
  | 'autoCompactionEnabled'
  | 'messageCount'
  | 'pendingMessageCount'
  | 'thinkingLevel'
>;

export type AgentState = AgentStateFromSdk & {
  /** 只投影 provider/modelId，SDK Model 的完整定义不泄漏出 core */
  model: ModelRef | null;
  isPromptRunning: boolean;
  autoRetryEnabled: boolean;
  queuedMessages: QueuedMessages;
  /**
   * 事件流水位线：本快照反映截至该 seq 的状态（与各字段同块同步读取，
   * 单线程 + 同步 dispatch 保证「在快照里 ⇒ seq ≤ lastSeq」）；
   * 客户端丢弃 SSE 流中 seq ≤ lastSeq 的事件（docs/01 §5.4 双通道对账）。
   */
  lastSeq: number;
  contextUsage: ContextUsage | null;
  systemPrompt: string;
  thinkingLevel: ThinkingLevel;
  extensionStatuses: ExtensionStatusItem[];
  extensionWidgets: ExtensionWidgetItem[];
};

/**
 * 会话性能统计（仅在**本进程跑过**的会话上有值；冷会话为 undefined）。
 * 由 SessionRegistryEntry 在流内累加（docs/02 §11.1 的「性能统计累加」）：
 * LLM 耗时取 turn_start→turn_end，工具耗时取 tool_execution_start→end。
 * 与 `getSessionStats()` 的 token/cost 口径无关——后者从条目聚合（含历史）。
 */
export type SessionPerf = {
  /** 轮数（agent_start → agent_settled） */
  rounds: number;
  /** 步数（turn 数） */
  steps: number;
  /** 模型耗时合计（毫秒） */
  llmMs: number;
  /** 工具耗时合计（毫秒） */
  toolMs: number;
  /** 输出 token / 秒（llmMs 为 0 时为 0） */
  tokensPerSecond: number;
};

/** `get_session_stats` 返回：SDK `SessionStats` + rpc 层附加字段 */
export type SessionStatsInfo = SessionStats & {
  /** rpc 层附加：会话活跃时长（毫秒） */
  totalActiveMs?: number;
  /** rpc 层附加：当前会话名 */
  sessionName?: string;
  /** 本进程累加的性能统计；冷会话（本进程未跑过）为 undefined */
  perf?: SessionPerf;
};
