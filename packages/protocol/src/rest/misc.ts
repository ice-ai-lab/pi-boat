import { z } from 'zod';

/** GET /api/health —— 服务健康检查（M0 已落地） */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// ⑦ 辅助通道（docs/02 §7）：liveness lease
// ---------------------------------------------------------------------------

/**
 * POST /api/agent/:id/lease —— 观看期间续 liveness lease，推迟 idle 回收。
 *
 * 为什么需要：idle 回收按「没人看也没人跑」判定，「有人看」由两个信号**并联**得出——
 * 该会话的 SSE 订阅数，以及本条 lease。SSE 连接只是不**够**可靠：断网的标签页会留一条
 * ESTABLISHED 连接很久（中间层可能到 TCP keepalive 超时才发现），而刚断线正在重连时
 * 订阅数又为 0（此时不想被误杀）。前端定期续 lease 相当于心跳，独立于 TCP 连接状态。
 *
 * `renewed:false` 表示会话已不在注册表（被回收或从未存在）——**不是错误**：
 * 前端据它决定是否重新拉起（显式 resume，ADR-0013）。
 */
export const LeaseResponseSchema = z.object({
  success: z.boolean(),
  renewed: z.boolean(),
});
export type LeaseResponse = z.infer<typeof LeaseResponseSchema>;
