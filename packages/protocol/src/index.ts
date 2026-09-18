/**
 * @pi-boat/protocol —— 前后端唯一契约：REST 请求/响应类型、事件 wire 格式
 * （ClientAgentEvent）与领域类型。纯类型 + Zod schema，零业务逻辑。
 * 详见 docs/01-overview.md §3.1 / §10（M1 展开完整 schema）。
 */
import { z } from 'zod';

/** 协议版本号（SDK 事件格式漂移防护，见概要设计 §8-5） */
export const PROTOCOL_VERSION = 1;

/** 服务端口约定（单一来源：代码/文档一律引用此处；部署可用 PORT 环境变量覆盖 server，docs/01-overview.md §5.2） */
export const PORTS = {
  /** agent server：API/SSE，生产同端口托管 web 静态产物 */
  server: 9527,
  /** web dev server：仅开发期（vite dev），浏览器经 CORS 直连 server */
  web: 9528,
} as const;

/** GET /api/health —— 服务健康检查（M0 骨架占位） */
export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  name: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
