import { z } from 'zod';

/** GET /api/health —— 服务健康检查（M0 已落地） */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// lease（POST /api/agent/:id/lease）与 push 端点随 M3 补齐（docs/02 §7）
