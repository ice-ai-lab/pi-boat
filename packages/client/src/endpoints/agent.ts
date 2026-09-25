import type {
  AgentCommand,
  AgentRunningState,
  CommandData,
  ModelRef,
  NewSessionRequest,
} from '@ice-ai/protocol';
import { getJson, http, postCommand } from '../http';

/**
 * agent 运行时域端点（docs/02 §4 / §6.1）。
 * 路由字面量归 client 持有（protocol 不导出路径常量，docs/02 §3「不养期货」）。
 */

/** POST /api/agent/new —— 新建会话；成功信封带 sessionId/model 扩展字段（docs/02 §4.1） */
export async function newAgentSession(
  body: NewSessionRequest,
): Promise<{ sessionId: string; model: ModelRef | null }> {
  const res = await http.post<{
    success: true;
    data: null;
    sessionId: string;
    model: ModelRef | null;
  }>('/agent/new', body);
  return { sessionId: res.data.sessionId, model: res.data.model };
}

/** SSE 事件流地址（EventSource 用；浏览器同源，无需凭据） */
export function agentEventsUrl(sessionId: string): string {
  return `/api/agent/${encodeURIComponent(sessionId)}/events`;
}

/** POST /api/agent/:id —— 发送任意命令（24 条，AgentCommand 判别联合） */
export function sendAgentCommand<K extends AgentCommand['type']>(
  sessionId: string,
  command: Extract<AgentCommand, { type: K }>,
): Promise<CommandData<K>> {
  return postCommand<CommandData<K>>(`/agent/${encodeURIComponent(sessionId)}`, command);
}

/** POST /api/agent/:id/resume —— 冷会话恢复（ADR-0013：显式拉起，SSE 才不会 404） */
export async function resumeAgentSession(sessionId: string): Promise<void> {
  await postCommand<null>(`/agent/${encodeURIComponent(sessionId)}/resume`);
}

/** GET /api/agent/:id —— 状态轻查（不进命令 FIFO；run 期间轮询用它，docs/02 §6.1） */
export function getAgentRunningState(sessionId: string): Promise<AgentRunningState> {
  return getJson<AgentRunningState>(`/agent/${encodeURIComponent(sessionId)}`);
}
