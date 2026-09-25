import type { ErrorCode } from './constants';

/** 命令成功响应体（HTTP 2xx） */
export interface CommandOk<T> {
  success: true;
  data: T;
}

/** 命令失败响应体（HTTP 非 2xx，无 success 字段；prompt 被拒时附 code + accepted:false） */
export interface CommandError {
  error: string;
  code?: ErrorCode;
  accepted?: boolean;
}

/** agent 命令类路由的统一信封（docs/02 §2）；agent/new 的扩展信封随命令通道定义（docs/02 §4.1） */
export type CommandEnvelope<T> = CommandOk<T> | CommandError;
