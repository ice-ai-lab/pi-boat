import type { CommandEnvelope } from '@ice-ai/protocol';
import axios, { type AxiosRequestConfig } from 'axios';

/**
 * 统一请求层（docs/05 §4）：单一 Axios 实例 + 错误信封归一。
 * baseURL 用相对路径 `/api`——dev 期 vite proxy、生产同源（ADR-0009）。
 * 不做重试、不做缓存（Query 的职责）；响应形状由 protocol 类型约束（ADR-0017：出参无 Zod）。
 */
export const http = axios.create({ baseURL: '/api' });

/** 服务端错误信封（docs/04 §4.1）——组件一律 catch 本类型，不判断 HTTP 状态码 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly accepted?: boolean;

  constructor(status: number, message: string, code?: string, accepted?: boolean) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.accepted = accepted;
  }
}

/** GET 直取 data */
export async function getJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<T>(url, config);
  return res.data;
}

/** agent 命令通道：POST → 解信封，失败抛 ApiError（信封形状见 protocol envelope.ts） */
export async function postCommand<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.post<CommandEnvelope<T>>(url, body, config);
  const payload = res.data;
  if ('success' in payload) return payload.data;
  throw new ApiError(res.status, payload.error, payload.code, payload.accepted);
}

http.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const body = error.response?.data as { error?: string; code?: string } | undefined;
    throw new ApiError(status, body?.error ?? error.message, body?.code);
  }
  throw error;
});
