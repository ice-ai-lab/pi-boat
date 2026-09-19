import { z } from 'zod';
import { type ErrorCode, ErrorCodeSchema } from './constants';

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

export const CommandErrorSchema = z.object({
  error: z.string(),
  code: ErrorCodeSchema.optional(),
  accepted: z.boolean().optional(),
});

/** 泛型工厂：按各命令返回值的 schema 组装成功态校验 */
export function commandOkSchema<T>(data: z.ZodType<T>) {
  return z.object({ success: z.literal(true), data });
}
