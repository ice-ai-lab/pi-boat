import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { AgentMessage } from '@ice-ai/protocol';

/**
 * SDK AgentMessage → wire AgentMessage 消息投影。
 *
 * 为什么需要：protocol 与 SDK 的 AgentMessage 联合已完全对齐（七角色一致，
 * 2026-09-18 定案：不做额外收敛设计），本函数只剩两件小事：
 * - 剥离 readonly（SDK 侧深度 readonly，wire 类型可变）
 * - 类型边界：SDK 类型 → protocol 契约类型（SDK 字段变动不许泄漏出 core）
 *
 * 提供：toWireAgentMessage（单条投影）；SdkAgentMessage 类型
 * （coding-agent 未从根导出 AgentMessage，经 AgentSession 派生）。
 */

/** SDK 侧消息类型（coding-agent 未从根导出 AgentMessage，经 AgentSession 派生） */
export type SdkAgentMessage = AgentSession['messages'][number];

/** 七角色结构一致，展开沿用剥 readonly 即可 */
export function toWireAgentMessage(message: SdkAgentMessage): AgentMessage {
  return { ...message } as AgentMessage;
}
