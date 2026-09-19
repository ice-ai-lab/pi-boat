import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { AgentMessage } from '@ice-ai/protocol';

/**
 * SDK AgentMessage → wire AgentMessage 消息投影。
 *
 * SDK 侧联合比 protocol 宽：coding-agent 经模块增强给 CustomAgentMessages
 * 追加了 bashExecution / custom / branchSummary / compactionSummary 四种角色，
 * 其中 branchSummary / compactionSummary 不在 protocol 的 5 角色联合内
 * （docs/02 §3.2 定稿口径），投影为 CustomMessage 承载：
 * - customType 保留原角色名，前端可按 customType 特化渲染
 * - summary 进 content，结构性元数据（fromId / tokensBefore）进 details
 * - display=false：两者均为注入上下文的合成消息，非用户输入
 *
 * user/assistant/toolResult/bashExecution/custom 五种角色结构一致，直接透传
 * （展开拷贝剥 readonly，wire 类型可变）。
 */

/** SDK 侧消息类型（coding-agent 未从根导出 AgentMessage，经 AgentSession 派生） */
export type SdkAgentMessage = AgentSession['messages'][number];

export function toWireAgentMessage(message: SdkAgentMessage): AgentMessage {
  if (message.role === 'branchSummary') {
    return {
      role: 'custom',
      customType: 'branchSummary',
      content: message.summary,
      display: false,
      details: { fromId: message.fromId },
      timestamp: message.timestamp,
    };
  }
  if (message.role === 'compactionSummary') {
    return {
      role: 'custom',
      customType: 'compactionSummary',
      content: message.summary,
      display: false,
      details: { tokensBefore: message.tokensBefore },
      timestamp: message.timestamp,
    };
  }
  return { ...message } as AgentMessage;
}
