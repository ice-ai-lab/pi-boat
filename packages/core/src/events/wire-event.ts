import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import type {
  JsonAssistantMessageEvent,
  ToolResultMessage,
  WireAgentEvent,
} from '@ice-ai/protocol';
import { toWireAgentMessage } from './wire-message';

/**
 * SDK AgentSessionEvent → WireAgentEvent 投影（docs/02 §5.1）。
 *
 * 为什么需要：SDK 事件是进程内内存对象——partial 是累积快照（尺寸随流增长）、
 * 数组带 readonly、toolcall 增量缺 id/toolName——既不可序列化上线，也不在
 * protocol 契约内。本文件是全仓唯一允许触碰 SDK 事件内部结构的边界
 * （AGENTS.md：SDK 事件字段变动不许泄漏出 core，升级只改这里）。
 *
 * 相对 SDK 新增：可序列化、契约化的 wire 事件形态。投影规则：
 * 1. toolcall_start / toolcall_delta 从 partial.content[contentIndex] 补齐 id / toolName
 * 2. 剥离 partial（完整消息只经快照/历史下发，流上只有增量）
 * 3. message_update 整条丢弃累积 message（尺寸随流增长），仅提取 usage（尺寸恒定）
 * 4. 转录 system 消息（role === "system"，SDK ≥ 0.86）整条丢弃（含 agent_end.messages 里的）
 * 5. 携带 AgentMessage 的事件（turn_end / agent_end / message_start / message_end）
 *    不丢字段，但消息逐条过 toWireAgentMessage（SDK→protocol 契约边界）
 * turn_* 及其余结构一致的事件原样透传（与 SDK 对齐，2026-09-20 定案）
 *
 * 提供：toWireAgentEventPayload（单事件转载荷，防御性丢弃返回 null）、
 * toWireAgentEvent（载荷 + 附 seq）。
 * seq 由调用方（SessionRegistryEntry）附上；本函数不维护计数。
 */

/** 分配律 Omit（直接 Omit<Union, K> 会塌缩成公共键，丢失判别信息） */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * WireAgentEvent 的载荷部分（不含 seq）。
 * seq 由 SessionRegistryEntry 统一分配——入参不携带该字段，调用侧无法伪造序号；
 * 载荷工厂（toWireAgentEventPayload）与服务层事件入口（emitEvent）共用此形态。
 */
export type WireAgentEventPayload = DistributiveOmit<WireAgentEvent, 'seq'>;

/**
 * assistantMessageEvent 子事件投影：剥离 partial + 补齐 toolcall 双字段。
 * partial 是累积快照（尺寸随流增长），wire 上永不携带。
 */
function toJsonAssistantMessageEvent(
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

/**
 * 单个 SDK 事件投影（不含 seq）。防御性丢弃（非 assistant 的 message_update）返回 null。
 * 各 case 的「丢了什么 / 为什么不能 spread 透传」就近注释；总原则：wire 上只发
 * 增量与恒定尺寸数据，SDK 类型不经 toWireAgentMessage 收敛不得进入 wire 契约。
 */
export function toWireAgentEventPayload(event: AgentSessionEvent): WireAgentEventPayload | null {
  switch (event.type) {
    case 'turn_start':
      return { type: 'turn_start' };
    case 'turn_end':
      // 无字段丢弃；message / toolResults 逐条过投影，理由同 agent_end
      return {
        type: 'turn_end',
        message: toWireAgentMessage(event.message),
        toolResults: event.toolResults.map(toWireAgentMessage) as ToolResultMessage[],
      };
    case 'message_update': {
      // 丢弃项：event.message——累积到当前的整条 assistant 半成品消息。不透传它：
      // (a) 尺寸随流线性增长，每条增量都会重复携带全部已生成内容，增量流变 O(n²) 流量；
      // (b) 协议设计上完整消息只经 message_start/end、turn_end、agent_end 与
      // late-join 快照下发，流上只有子事件增量（去 partial，见上方子事件投影）；
      // 从 message 仅提取 usage——尺寸恒定，客户端可实时计量用量。这套取舍与
      // SDK 自家 JSON 协议 toJsonEvent（modes/json-event）完全一致。
      // 服务端要用这条累积消息时（streamingMessage 快照）由 Entry 在投影前取，不经 wire。
      //
      // SDK 不变量：message_update 只发生于 assistant 流（toJsonEvent 同样断言）；
      // 违反时防御性丢弃而非崩溃
      if (event.message.role !== 'assistant') return null;
      return {
        type: 'message_update',
        usage: event.message.usage,
        assistantMessageEvent: toJsonAssistantMessageEvent(event.assistantMessageEvent),
      };
    }
    case 'message_start':
    case 'message_end':
      // 转录 system 消息（SDK ≥ 0.86）不入 wire：它携带完整 prompt 与全部工具
      // schema，尺寸随扩展/技能数量增长，而它不是对话内容。历史路径同口径
      // （session-read 的聊天投影跳过它），两侧一致才不会实时/刷新形状漂移。
      // 防御性丢弃，不消耗 seq（同其他 null 分支）。
      if (event.message.role === 'system') return null;
      // 无字段丢弃；单条 message 过投影（剥 readonly + SDK→protocol 类型边界）
      return { type: event.type, message: toWireAgentMessage(event.message) };
    case 'agent_end':
      // 无字段丢弃：messages + willRetry 全保留。不能 {...event} 透传的原因在
      // messages——元素是 SDK AgentMessage，须逐条过 toWireAgentMessage 收敛到
      // protocol 契约类型，否则 SDK 消息字段变动会直接泄漏进 wire 契约
      // （AGENTS.md：SDK 事件字段变动不许泄漏出 core）。
      // willRetry 补充：底层 AgentEvent（pi-agent-core）的 agent_end 没有此字段，
      // 由 AgentSession 发射时按 auto-retry 状态补上；wire 保留它供客户端
      // 提示「即将自动重试」而非渲染成对话终止。
      // system 消息同样过滤——它是这份批量数组里唯一会随工具数量膨胀的项。
      return {
        type: 'agent_end',
        messages: event.messages
          .filter((message) => message.role !== 'system')
          .map(toWireAgentMessage),
        willRetry: event.willRetry,
      };
    case 'queue_update':
      // readonly 数组 → 可变数组（wire 类型要求）
      return {
        type: 'queue_update',
        steering: [...event.steering],
        followUp: [...event.followUp],
      };
    case 'session_info_changed':
      // name === undefined = 清除命名；wire 上字段缺省而非显式 undefined
      return event.name === undefined
        ? { type: 'session_info_changed' }
        : { type: 'session_info_changed', name: event.name };
    case 'bash_execution_update':
      // 2026-09-22 决策：Shell 直连（TUI 的 ! 直接执行）不实现，事件不入 wire
      // （docs/02 §4 移除注）；防御性丢弃，不消耗 seq
      return null;
    default:
      // 其余事件（agent_start / tool_execution_* / compaction_* / auto_retry_* /
      // summarization_retry_* / entry_appended / thinking_level_changed 等）字段为
      // 基元、unknown 或已与 protocol 对齐的结构
      // （entry_appended.entry），不含 AgentMessage 与 readonly 数组，故可结构透传
      // （TS 结构化检查兜底 SDK 变动）
      return { ...event } as WireAgentEventPayload;
  }
}

/**
 * SDK 事件 + seq → wire 事件。seq 由会话级单调计数器分配（SessionRegistryEntry），
 * 客户端以其做 Last-Event-ID 差量重放与快照去重（docs/01 §5.4）。
 */
export function toWireAgentEvent(event: AgentSessionEvent, seq: number): WireAgentEvent | null {
  const payload = toWireAgentEventPayload(event);
  if (payload === null) return null;
  return { ...payload, seq } as WireAgentEvent;
}
