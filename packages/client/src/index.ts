import { PROTOCOL_VERSION } from '@pi-boat/protocol';

/**
 * @pi-boat/client —— 前端用类型安全 SDK。
 * M1 计划：AgentClient（typed fetch）+ SSE 订阅封装（自动重连/事件分发）
 * + client/react 子导出（useAgentSession 等 hooks）。
 */
export const CLIENT_VERSION = `0.0.0 (protocol v${PROTOCOL_VERSION})`;
