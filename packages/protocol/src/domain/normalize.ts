import { z } from 'zod';

/**
 * 归一化函数（docs/02 §3.6）——protocol 包内唯一允许的"逻辑"。
 *
 * 背景（概要设计 §8-3）：工具调用存在双字段体系——
 * - 文件存储/SDK pi-ai ToolCall：`{ id, name, arguments }`
 * - SDK 流式事件（tool_execution_start 等）：`{ toolCallId, toolName, input }`
 * 文件加载与流式两条路径共用本函数收敛，避免两处各写一套容错。
 */

export const NormalizedToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});
export type NormalizedToolCall = z.infer<typeof NormalizedToolCallSchema>;

/** 双字段体系的任一原始形状（宽松接收，逐字段容错） */
export type RawToolCall = {
  id?: unknown;
  toolCallId?: unknown;
  name?: unknown;
  toolName?: unknown;
  arguments?: unknown;
  input?: unknown;
};

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * 把双字段体系的工具调用数组归一化为 `{id, name, arguments}`。
 * 逐项容错：id ← id ?? toolCallId；name ← name ?? toolName；
 * arguments ← arguments ?? input（缺省 {}）。缺 id 或 name 的项原样丢弃。
 */
export function normalizeToolCalls(calls: readonly RawToolCall[]): NormalizedToolCall[] {
  const result: NormalizedToolCall[] = [];
  for (const call of calls) {
    const id = str(call.id) ?? str(call.toolCallId);
    const name = str(call.name) ?? str(call.toolName);
    if (id === undefined || name === undefined) continue;
    const rawArgs = (call.arguments ?? call.input) as unknown;
    const args =
      typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : {};
    result.push({ id, name, arguments: args });
  }
  return result;
}
