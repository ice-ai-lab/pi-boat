import { z } from 'zod';
import { AgentStateSchema } from '../domain/state';

/**
 * ⑤ REST 资源——agent 运行时域（docs/02 §4 命令通道 / §6.1 轮询与轻查）。
 * Shell 直连（bash 命令与 /bash-output 端点）已按 2026-09-22 决策移除。
 * 与 sessions 域（rest/sessions，SessionReadService 磁盘只读）相对：本域端点全部面向
 * 运行时注册表（AgentSessionService）——命令进同会话 FIFO 串行，轻查直读注册表不排队。
 * 命令请求体（AgentCommand）与信封（CommandEnvelope）分别在 commands/ 与 envelope.ts。
 * 路径常量 + 请求/响应类型 + Zod schema 三件套（docs/02 §10）。
 */

// ---------------------------------------------------------------------------
// 路径常量（server 路由与 client SDK 共用的单一来源）
// ---------------------------------------------------------------------------

/** POST /api/agent/new —— 新建会话（body/response 见 commands/agent-command 的 NewSession*） */
export const AGENT_NEW_PATH = '/api/agent/new' as const;

/** GET /api/agent/running —— 可见 Tab 池的轻量轮询 */
export const AGENT_RUNNING_PATH = '/api/agent/running' as const;

/** POST /api/agent/:id —— 命令通道（AgentCommand 判别联合 → CommandEnvelope 信封） */
export const agentCommandPath = (id: string) => `/api/agent/${id}` as const;

/** GET /api/agent/:id —— 单会话轻查（与 agentCommandPath 同 URL 仅方法不同，二者不得漂移） */
export const agentStatePath = (id: string) => `/api/agent/${id}` as const;

/** GET /api/agent/:id/events —— SSE 事件流（WireAgentEvent；Last-Event-ID 差量重放） */
export const agentEventsPath = (id: string) => `/api/agent/${id}/events` as const;

// ---------------------------------------------------------------------------
// §6.1 轮询与轻查
// ---------------------------------------------------------------------------

/** GET /api/agent/running */
export const RunningSessionsResponseSchema = z.object({
  /** 同 SessionListResponse.registryVersion */
  registryVersion: z.number(),
  runningSessionIds: z.array(z.string()),
  completionNotificationSuppressedSessionIds: z.array(z.string()),
});
export type RunningSessionsResponse = z.infer<typeof RunningSessionsResponseSchema>;

/**
 * GET /api/agent/:id —— 单会话状态轻查：
 * 未运行返回 `{running:false}` 不报错；运行中附完整 AgentState
 * （客户端在 agent_end 后靠它同步模型/上下文/队列）。
 * ⚠️ 必须走注册表直读、不进命令 FIFO——get_state 命令与运行中的 prompt 串行，
 * run 期间发它会排队到 run 结束，轮询实时状态只能用本端点（docs/02 §6.1）。
 */
export const AgentRunningStateSchema = z.union([
  z.object({ running: z.literal(false) }),
  z.object({ running: z.literal(true), state: AgentStateSchema }),
]);
export type AgentRunningState = z.infer<typeof AgentRunningStateSchema>;
