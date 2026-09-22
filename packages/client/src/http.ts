import { type CommandError, CommandErrorSchema } from '@ice-ai/protocol';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { z } from 'zod';

/**
 * 统一 HTTP 层（ADR-0009）：单一 Axios 实例 + protocol Zod 解析 + 错误信封归一。
 *
 * 职责边界（ADR-0007 删 token 后收敛为三条）：
 * 1. baseURL —— 默认空串 = **同源**。protocol 的路径常量自带 `/api` 前缀，
 *    所以 dev 期由 Vite proxy 把 `/api` 转发到 9527、生产由 server 同源托管，
 *    两种拓扑下前端代码一致（ADR-0009 的“相对路径”意图）。
 *    直连场景（Electron / LAN / curl）用 `createApiClient('http://127.0.0.1:9527')`。
 * 2. 错误信封归一：非 2xx → 解出 CommandError 并以类型化异常抛出（组件不判状态码）
 * 3. 可选超时
 *
 * **不做**：重试、缓存（Query 的职责）、凭据注入（ADR-0007 已无凭据）、
 * 二次解析（响应解析权唯一归 protocol 的 Zod，调用点不得再 parse）。
 */

/** 服务端错误信封（docs/04 §4.1）——`code` 如 `prompt_rejected` */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: CommandError,
  ) {
    super(body.error);
    this.name = 'ApiError';
  }

  get code(): CommandError['code'] {
    return this.body.code;
  }
}

/** 网络层失败（未拿到 HTTP 响应：连接被拒 / 超时 / 进程已退出） */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** 响应形状不符合 protocol 契约（SDK / server 漂移探针） */
export class ResponseSchemaError extends Error {
  constructor(
    readonly url: string,
    readonly issues: string,
  ) {
    super(`Response from ${url} does not match the protocol contract: ${issues}`);
    this.name = 'ResponseSchemaError';
  }
}

export interface ApiClientOptions {
  /** 服务 origin（默认空串 = 同源，路径自带 /api 前缀） */
  baseURL?: string;
  timeoutMs?: number;
}

export class ApiClient {
  readonly http: AxiosInstance;
  readonly baseURL: string;

  constructor(options: ApiClientOptions = {}) {
    this.baseURL = options.baseURL ?? '';
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: options.timeoutMs ?? 0,
      headers: { Accept: 'application/json' },
    });
  }

  /** 请求 → Zod 解析 → 类型化数据（唯一解析点） */
  async request<T>(config: AxiosRequestConfig, schema: z.ZodType<T>): Promise<T> {
    let data: unknown;
    try {
      const response = await this.http.request<unknown>(config);
      data = response.data;
    } catch (error) {
      throw toThrown(error);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      throw new ResponseSchemaError(config.url ?? '', issues);
    }
    return parsed.data;
  }

  /** 拼接绝对 URL（EventSource 需要绝对/相对 URL 字符串，不走 axios） */
  url(path: string): string {
    return `${this.baseURL}${path}`;
  }
}

/** 便捷构造（直连场景） */
export function createApiClient(baseURL = '', timeoutMs = 0): ApiClient {
  return new ApiClient({ baseURL, timeoutMs });
}

function toThrown(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === undefined) return new NetworkError(error);
    const parsed = CommandErrorSchema.safeParse(error.response?.data);
    const body: CommandError = parsed.success ? parsed.data : { error: error.message };
    return new ApiError(status, body);
  }
  return error instanceof Error ? error : new Error(String(error));
}
