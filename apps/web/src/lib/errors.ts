import { ApiError, NetworkError } from '@ice-ai/client';

/**
 * 错误 → 用户可读文案（REST 信封由 client 归一成 `ApiError`，ADR-0007 删 token 后无凭据错误）。
 * `ApiError.message` 已是服务端给的语义化文案（如「工作目录不存在」），直接透出。
 */
export function describeApiError(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof NetworkError)
    return '无法连接本机 agent server（9527）：请先启动 `pnpm turbo run dev`';
  return cause instanceof Error ? cause.message : String(cause);
}
