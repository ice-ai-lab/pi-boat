/**
 * @pi-boat/protocol —— 前后端唯一契约：REST 请求/响应类型、事件 wire 格式
 * （ClientAgentEvent）与领域类型。纯类型 + Zod schema，零业务逻辑。
 * 详见 docs/01-overview.md §3.1 / §10（M1 展开完整 schema）。
 */
import { z } from 'zod';

/** 协议版本号（SDK 事件格式漂移防护，见概要设计 §8-5） */
export const PROTOCOL_VERSION = 1;

/** GET /api/health —— 服务健康检查（M0 骨架占位） */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
