import {
  AGENT_NEW_PATH,
  AGENT_RUNNING_PATH,
  type AgentCommand,
  type AgentRunningState,
  AgentRunningStateSchema,
  agentCommandPath,
  agentEventsPath,
  agentStatePath,
  type CommandData,
  CommandResultSchemas,
  commandOkSchema,
  type NewSessionOk,
  NewSessionOkSchema,
  type NewSessionRequest,
  type RunningSessionsResponse,
  RunningSessionsResponseSchema,
} from '@ice-ai/protocol';
import type { z } from 'zod';
import type { ApiClient } from '../http';

/**
 * agent 运行时域的端点封装（docs/05 §2）：命令通道、轻查、轮询、SSE 地址。
 * 形状全部来自 protocol，本文件只负责「路径常量 + schema」拼接（ADR-0009 手写封装）。
 */

/** POST /api/agent/new —— 新建会话（NewSessionOk 扩展信封，错误经信封抛 ApiError） */
export function newSession(client: ApiClient, body: NewSessionRequest): Promise<NewSessionOk> {
  return client.request({ method: 'POST', url: AGENT_NEW_PATH, data: body }, NewSessionOkSchema);
}

/**
 * POST /api/agent/:id —— 命令通道。返回值按命令类型取对应 schema
 * （`CommandResultSchemas` 与 `CommandData` 同表）。
 *
 * ⚠️ 信封：server 回的是 `{success:true, data}`（docs/02 §2），所以先套 `commandOkSchema`
 * 再取 `.data`——直接把命令结果 schema 套到整个响应体上会得到
 * “expected null, received object”（2026-09-23 端到端验收抓到）。
 */
export function sendCommand<T extends AgentCommand['type']>(
  client: ApiClient,
  sessionId: string,
  command: Extract<AgentCommand, { type: T }>,
): Promise<CommandData<T>> {
  const dataSchema = CommandResultSchemas[command.type] as unknown as z.ZodType<CommandData<T>>;
  return client
    .request(
      { method: 'POST', url: agentCommandPath(sessionId), data: command },
      commandOkSchema(dataSchema),
    )
    .then((ok) => ok.data);
}

/** GET /api/agent/:id —— 轻查（未运行返回 {running:false}，不进命令 FIFO） */
export function getRunningState(client: ApiClient, sessionId: string): Promise<AgentRunningState> {
  return client.request({ method: 'GET', url: agentStatePath(sessionId) }, AgentRunningStateSchema);
}

/** GET /api/agent/running —— 可见 Tab 池的轻量轮询 */
export function getRunningSessions(client: ApiClient): Promise<RunningSessionsResponse> {
  return client.request({ method: 'GET', url: AGENT_RUNNING_PATH }, RunningSessionsResponseSchema);
}

/** SSE 事件流地址（EventSource 无法带 header，凭据模型见 ADR-0007） */
export function agentEventsUrl(client: ApiClient, sessionId: string): string {
  return client.url(agentEventsPath(sessionId));
}
