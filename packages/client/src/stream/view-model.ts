import type { ModelRef, Usage } from '@ice-ai/protocol';

/**
 * 视图模型（docs/05 §6）：`fold`（实时事件）与 `rebuild`（历史消息）共同产出的
 * 可直接渲染结构。client 私有契约，不进 protocol（协议不承诺 UI 形状）。
 */

/** 一个 turn = 一条用户消息 + 它触发的全部轨迹 + 最终回答 */
export interface Turn {
  id: string;
  user: { text: string; images?: string[]; at: number };
  /**
   * 孤儿轮：历史窗口从轮中间开始时（分页/尾部窗口），前导 assistant/toolResult
   * 没有 user 锚点。仍建轮以**不丢数据**，渲染时跳过用户气泡。
   */
  orphan?: boolean;
  /** 平铺轨迹（thinking/tool/system 行）；成组是渲染前的派生步骤（groupTrail） */
  trail: TrailItem[];
  /** 最终回答（流式期间为 draft，随 text_delta 增长） */
  final: { markdown: string } | null;
  usage: Usage | null;
  model: ModelRef | null;
  status: 'streaming' | 'done' | 'stopped' | 'error';
}

export type TrailItem = ThinkingRow | ToolRow | SystemRow;

export interface ThinkingRow {
  kind: 'thinking';
  text: string;
  streaming: boolean;
}

export interface ToolRow {
  kind: 'tool';
  toolCallId: string;
  toolName: string;
  /** 摘要标题（命令 / 文件路径 / 查询词），来自参数 */
  title: string;
  /** 参数原文（折叠体展示用；流式期间为增量片段拼接，可能不是合法 JSON） */
  argsText: string;
  status: 'preparing' | 'running' | 'ok' | 'error' | 'stopped';
  output: string | null;
  isError: boolean;
  durationMs?: number;
}

export interface SystemRow {
  kind: 'system';
  text: string;
  tone: 'info' | 'warn' | 'error';
}

/** 过程组：连续 thinking/tool 行在「最终回答出现」后收拢（派生层产物，docs/05 §6.5） */
export interface ProcessGroupData {
  kind: 'group';
  items: TrailItem[];
  messageCount: number;
  toolCallCount: number;
}

export type GroupedTrailItem = TrailItem | ProcessGroupData;

/** fold 的整体状态（AgentStream 持有并通知订阅者） */
export interface ChatState {
  turns: Turn[];
  /** agent run 进行中（agent_start…agent_settled 之外为 false） */
  streaming: boolean;
  /** 排队消息（steering 插队 / followUp 收尾追问） */
  queued: { steering: string[]; followUp: string[] };
  sessionName?: string;
  /** 会话已终止（session_shutdown）：停止重连、composer 置灰 */
  terminated: boolean;
}

export function emptyChatState(): ChatState {
  return { turns: [], streaming: false, queued: { steering: [], followUp: [] }, terminated: false };
}

/** 末轮是否仍在进行（流式期间不分组、平铺渲染，docs/05 §6.5 方案 2） */
export function isLiveTail(turns: Turn[], streaming: boolean): boolean {
  if (!streaming) return false;
  return turns.length > 0 && turns[turns.length - 1]?.status === 'streaming';
}
