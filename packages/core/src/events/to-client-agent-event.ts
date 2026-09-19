import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type { ClientAgentEvent, JsonAssistantMessageEvent } from '@ice-ai/protocol';
import { toWireAgentMessage } from './wire-message';

/**
 * SDK AgentSessionEvent → wire ClientAgentEvent 投影（docs/02 §5.1）。
 *
 * 全仓唯一允许触碰 SDK 事件内部结构的边界（AGENTS.md：SDK 事件字段变动
 * 不许泄漏出 core）。投影规则：
 * 1. 剔除 turn_start / turn_end（agent_end 增强版已覆盖其语义）
 * 2. toolcall_start / toolcall_delta 从 partial.content[contentIndex] 补齐 id / toolName
 * 3. 剥离 partial（完整消息只经快照/历史下发，流上只有增量）
 * 4. message_update 附带 usage（SDK 流式消息的累积用量，尺寸恒定）
 *
 * seq 由调用方（SessionRegistryEntry）附上；本函数不维护计数。
 */

/** 分配律 Omit（直接 Omit<Union, K> 会塌缩成公共键，丢失判别信息） */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** 投影剔除的事件（不消耗 seq，不出现在 wire 上） */
export function isDroppedEvent(event: AgentSessionEvent): boolean {
  return event.type === 'turn_start' || event.type === 'turn_end';
}

type ProjectedEvent = DistributiveOmit<ClientAgentEvent, 'seq'>;

/**
 * assistantMessageEvent 子事件投影：剥离 partial + 补齐 toolcall 双字段。
 * partial 是累积快照（尺寸随流增长），wire 上永不携带。
 */
function projectAssistantMessageEvent(
  event: Extract<AgentSessionEvent, { type: 'message_update' }>['assistantMessageEvent'],
): JsonAssistantMessageEvent {
  // toolcall_start / toolcall_delta：从累积 partial 里提取 id / toolName
  if (event.type === 'toolcall_start' || event.type === 'toolcall_delta') {
    const toolCall = event.partial.content[event.contentIndex];
    if (toolCall?.type !== 'toolCall') {
      // 防御：SDK 流异常时不得让整条事件流崩溃（UI 最多丢一个增量）
      throw new Error(`toolcall content at index ${event.contentIndex} is not a tool call`);
    }
    const { partial: _partial, ...deltaEvent } = event;
    return {
      ...deltaEvent,
      id: toolCall.id,
      toolName: toolCall.name,
    } as JsonAssistantMessageEvent;
  }
  // 其余子事件：剥离 partial 后原样透传（start/text_*/thinking_*/toolcall_end/done/error）
  if ('partial' in event) {
    const { partial: _partial, ...rest } = event;
    return rest as JsonAssistantMessageEvent;
  }
  return event as JsonAssistantMessageEvent;
}

/** 单个 SDK 事件投影（不含 seq）。被剔除的事件返回 null。 */
export function projectAgentSessionEvent(event: AgentSessionEvent): ProjectedEvent | null {
  if (isDroppedEvent(event)) return null;

  if (event.type === 'message_update') {
    // SDK 不变量：message_update 只发生于 assistant 流（toJsonEvent 同样断言）；
    // 违反时防御性丢弃而非崩溃
    if (event.message.role !== 'assistant') return null;
    return {
      type: 'message_update',
      usage: event.message.usage,
      assistantMessageEvent: projectAssistantMessageEvent(event.assistantMessageEvent),
    };
  }
  if (event.type === 'message_start' || event.type === 'message_end') {
    return { type: event.type, message: toWireAgentMessage(event.message) };
  }
  if (event.type === 'agent_end') {
    return {
      type: 'agent_end',
      messages: event.messages.map(toWireAgentMessage),
      willRetry: event.willRetry,
    };
  }
  if (event.type === 'queue_update') {
    // readonly 数组 → 可变数组（wire 类型要求）
    return {
      type: 'queue_update',
      steering: [...event.steering],
      followUp: [...event.followUp],
    };
  }
  if (event.type === 'session_info_changed') {
    // name === undefined = 清除命名；wire 上字段缺省而非显式 undefined
    return event.name === undefined
      ? { type: 'session_info_changed' }
      : { type: 'session_info_changed', name: event.name };
  }
  // 其余事件字段结构与 wire 一致，透传（TS 结构化检查兜底 SDK 变动）
  return { ...event } as ProjectedEvent;
}

/**
 * SDK 事件 + seq → wire 事件。seq 由会话级单调计数器分配（SessionRegistryEntry），
 * 客户端以其做 Last-Event-ID 差量重放与快照去重（docs/01 §5.4）。
 */
export function toClientAgentEvent(event: AgentSessionEvent, seq: number): ClientAgentEvent | null {
  const projected = projectAgentSessionEvent(event);
  if (projected === null) return null;
  return { ...projected, seq } as ClientAgentEvent;
}
