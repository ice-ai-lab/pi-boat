import { z } from 'zod';

/** GET /api/health —— 服务健康检查（M0 已落地） */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// ---------------------------------------------------------------------------
// ⑦ 辅助通道（docs/02 §7）：liveness lease 与推送
// ---------------------------------------------------------------------------

/**
 * POST /api/agent/:id/lease —— 观看期间续 liveness lease，推迟 idle 回收。
 *
 * 为什么需要：idle 回收按"没人看也没人跑"判定，但**SSE 长连接本身不是观看证据**
 * ——断网的标签页会留一条 ESTABLISHED 连接很久（中间层可能到 TCP keepalive 超时
 * 才发现）。前端定期续 lease 相当于心跳，比"连接还在"更可信。
 *
 * `renewed:false` 表示会话已不在注册表（被回收或从未存在）——**不是错误**：
 * 前端据它决定是否重新拉起（显式 resume，ADR-0013）。
 */
export const LeaseResponseSchema = z.object({
  success: z.boolean(),
  renewed: z.boolean(),
});
export type LeaseResponse = z.infer<typeof LeaseResponseSchema>;

/** GET /api/push/config —— Web Push 的 VAPID 公钥（私钥永不出服务端） */
export const PushConfigResponseSchema = z.object({
  /** `enabled:false` 时为 null（服务端未启用推送） */
  publicKey: z.string().nullable(),
  enabled: z.boolean(),
  /** 不可用的原因（缺依赖 / 生成失败），仅用于诊断显示 */
  reason: z.string().optional(),
});
export type PushConfigResponse = z.infer<typeof PushConfigResponseSchema>;

const PushSubscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/** POST /api/push/subscribe —— 按 endpoint upsert（同一浏览器重复订阅不重复存） */
export const PushSubscribeRequestSchema = z.object({
  subscription: PushSubscriptionSchema,
  /** 通知文案语言（向前端多语言预留；服务端只回填不解释） */
  locale: z.string().optional(),
});
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequestSchema>;

export const PushSubscribeResponseSchema = z.object({
  success: z.boolean(),
  /** 该 endpoint 是否为新增（false = 更新了既有订阅） */
  created: z.boolean(),
});
export type PushSubscribeResponse = z.infer<typeof PushSubscribeResponseSchema>;
