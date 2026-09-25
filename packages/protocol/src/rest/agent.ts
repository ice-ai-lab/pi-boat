import type { AgentState } from '../domain/state';

/**
 * ⑤ REST 资源——agent 运行时域（docs/02 §4 命令通道 / §6.1 轮询与轻查）。
 * Shell 直连（bash 命令与 /bash-output 端点）已按 2026-09-22 决策移除。
 * 与 sessions 域（rest/sessions，SessionReadService 磁盘只读）相对：本域端点全部面向
 * 运行时注册表（AgentSessionService）——命令进同会话 FIFO 串行，轻查直读注册表不排队。
 * 命令请求体（AgentCommand）与信封（CommandEnvelope）分别在 commands/ 与 envelope.ts。
 * 只定义请求/响应契约，**不导出路径常量**——路由字面量归 server／client 各自持有，
 * 无消费方的常量视同期货（docs/02 §3「不养期货」）。
 */

// ---------------------------------------------------------------------------
// §6.1 轮询与轻查
// ---------------------------------------------------------------------------

/** GET /api/agent/running */
export type RunningSessionsResponse = {
  /** 同 SessionListResponse.registryVersion */
  registryVersion: number;
  runningSessionIds: string[];
  completionNotificationSuppressedSessionIds: string[];
};

/**
 * GET /api/agent/:id —— 单会话状态轻查：
 * 未运行返回 `{running:false}` 不报错；运行中附完整 AgentState
 * （客户端在 agent_end 后靠它同步模型/上下文/队列）。
 * ⚠️ 必须走注册表直读、不进命令 FIFO——get_state 命令与运行中的 prompt 串行，
 * run 期间发它会排队到 run 结束，轮询实时状态只能用本端点（docs/02 §6.1）。
 */
export type AgentRunningState = { running: false } | { running: true; state: AgentState };
