import { PromptRejectedError, SessionNotFoundError, UserInputError } from '@ice-ai/core';
import type { CommandError } from '@ice-ai/protocol';

/**
 * core 类型化异常 → HTTP 状态码 + CommandError 信封（docs/04 §4.1）。
 * 未识别异常一律 500 且不回传内部信息——堆栈/路径只进服务端日志
 * （新增路由检查清单 ③：错误响应不泄漏内部路径/堆栈）。
 */
export function mapCoreError(error: unknown): { status: 400 | 404 | 500; body: CommandError } {
  if (error instanceof SessionNotFoundError) {
    return { status: 404, body: { error: error.message } };
  }
  if (error instanceof PromptRejectedError) {
    return {
      status: 400,
      body: { error: error.message, code: 'prompt_rejected', accepted: false },
    };
  }
  if (error instanceof UserInputError) {
    return { status: 400, body: { error: error.message } };
  }
  console.error('[server] unhandled error:', error);
  return { status: 500, body: { error: 'Internal server error' } };
}

/**
 * Zod safeParse 失败 → 400 的第一条可读信息（docs/04 §4.2）。
 * 带字段路径（`force: Invalid input: expected "1"`）——裸 message 看不出是哪个参数错。
 */
export function firstIssueMessage(
  issues: readonly { path?: readonly PropertyKey[]; message: string }[],
): string {
  const issue = issues[0];
  if (issue === undefined) return 'Invalid request';
  const path = (issue.path ?? [])
    .filter(
      (segment): segment is string | number =>
        typeof segment === 'string' || typeof segment === 'number',
    )
    .join('.');
  return path === '' ? issue.message : `${path}: ${issue.message}`;
}
