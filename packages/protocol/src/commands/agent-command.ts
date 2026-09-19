import { z } from 'zod';
import { ThinkingLevelSchema } from '../constants';
import { ImageContentSchema } from '../domain/message';
import {
  type AgentState,
  AgentStateSchema,
  type SessionStatsInfo,
  SessionStatsInfoSchema,
} from '../domain/state';
import {
  type SlashCommandInfo,
  SlashCommandInfoSchema,
  type ToolInfo,
  ToolInfoSchema,
} from '../domain/tool';
import { CommandErrorSchema } from '../envelope';

/**
 * ③ Agent 命令通道（docs/02 §4）：`POST /api/agent/:id` 请求体判别联合。
 * 本文件先落地 M1 子集（对话 + 状态 + 工具 + 命令面板）；
 * M2 补分支/压缩/模型组，M3 随资源域扩展（docs/02 §11）。
 * 字段对齐 SDK 0.85.1 `modes/rpc/rpc-types.ts` 的 RpcCommand。
 */

export const STREAMING_BEHAVIORS = ['steer', 'followUp'] as const;
export const StreamingBehaviorSchema = z.enum(STREAMING_BEHAVIORS);
export type StreamingBehavior = z.infer<typeof StreamingBehaviorSchema>;

export const AgentCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prompt'),
    message: z.string().min(1),
    images: z.array(ImageContentSchema).optional(),
    streamingBehavior: StreamingBehaviorSchema.optional(),
  }),
  z.object({
    type: z.literal('steer'),
    message: z.string().min(1),
    images: z.array(ImageContentSchema).optional(),
  }),
  z.object({
    type: z.literal('follow_up'),
    message: z.string().min(1),
    images: z.array(ImageContentSchema).optional(),
  }),
  z.object({ type: z.literal('abort') }),
  z.object({ type: z.literal('clear_queue') }),
  z.object({ type: z.literal('get_state') }),
  z.object({ type: z.literal('get_session_stats') }),
  z.object({ type: z.literal('get_last_assistant_text') }),
  z.object({ type: z.literal('get_commands') }),
  z.object({ type: z.literal('get_tools') }),
  z.object({
    type: z.literal('set_tools'),
    toolNames: z.array(z.string()),
  }),
]);
export type AgentCommand = z.infer<typeof AgentCommandSchema>;

// ---------------------------------------------------------------------------
// 各命令返回类型（信封 data 字段形状）
// ---------------------------------------------------------------------------

/** clear_queue 返回：被清空的排队消息 */
export interface ClearQueueResult {
  steering: string[];
  followUp: string[];
}
export const ClearQueueResultSchema = z.object({
  steering: z.array(z.string()),
  followUp: z.array(z.string()),
});

export interface LastAssistantTextResult {
  text: string | null;
}
export const LastAssistantTextResultSchema = z.object({ text: z.string().nullable() });

export interface CommandListResult {
  commands: SlashCommandInfo[];
}
export const CommandListResultSchema = z.object({ commands: z.array(SlashCommandInfoSchema) });

/**
 * set_tools 双路径返回（docs/02 §4 工具组）：
 * - 运行中会话：走 switch，data 为 null
 * - 冷会话：route 层重建 runtime，data 为 `{sessionId, recreated}`
 */
export type SetToolsResult = null | { sessionId: string; recreated: boolean };
export const SetToolsRecreatedSchema = z.object({
  sessionId: z.string(),
  recreated: z.boolean(),
});

/** 命令 → 返回值映射（信封 CommandOk<T> 的 T 取此处） */
export interface AgentCommandResults {
  prompt: null;
  steer: null;
  follow_up: null;
  abort: null;
  clear_queue: ClearQueueResult;
  get_state: AgentState;
  get_session_stats: SessionStatsInfo;
  get_last_assistant_text: LastAssistantTextResult;
  get_commands: CommandListResult;
  get_tools: ToolInfo[];
  set_tools: SetToolsResult;
}

/** 按命令字面量取返回值类型：`CommandData<'get_state'>` → AgentState */
export type CommandData<T extends keyof AgentCommandResults> = AgentCommandResults[T];

/** 各命令返回值的运行时校验（null 型命令无 body，用 null schema 占位） */
export const CommandResultSchemas = {
  prompt: z.null(),
  steer: z.null(),
  follow_up: z.null(),
  abort: z.null(),
  clear_queue: ClearQueueResultSchema,
  get_state: AgentStateSchema,
  get_session_stats: SessionStatsInfoSchema,
  get_last_assistant_text: LastAssistantTextResultSchema,
  get_commands: CommandListResultSchema,
  get_tools: z.array(ToolInfoSchema),
  set_tools: z.union([z.null(), SetToolsRecreatedSchema]),
} as const;

// ---------------------------------------------------------------------------
// 新建会话（POST /api/agent/new，docs/02 §4.1）
// ---------------------------------------------------------------------------

/**
 * 请求体。`type: "ensure_session"`：只建 runtime 不发首条消息，
 * 供客户端预查命令/工具后补发 prompt；缺省 = 立即发送 message。
 * provider 与 modelId 必须成对出现。
 */
export const NewSessionRequestSchema = z
  .object({
    cwd: z.string().min(1),
    type: z.literal('ensure_session').optional(),
    message: z.string().min(1).optional(),
    images: z.array(ImageContentSchema).optional(),
    provider: z.string().optional(),
    modelId: z.string().optional(),
    toolNames: z.array(z.string()).optional(),
    thinkingLevel: ThinkingLevelSchema.optional(),
  })
  .refine((body) => (body.provider === undefined) === (body.modelId === undefined), {
    message: 'provider 与 modelId 必须成对提供',
  });
export type NewSessionRequest = z.infer<typeof NewSessionRequestSchema>;

/** agent/new 成功响应：CommandOk 的扩展信封（docs/02 §2、§4.1） */
export const NewSessionOkSchema = z.object({
  success: z.literal(true),
  /** 首条 prompt 即时结果（prompt 返回 null），ensure_session 亦为 null */
  data: z.null(),
  sessionId: z.string(),
  model: z
    .object({
      provider: z.string(),
      modelId: z.string(),
    })
    .nullable(),
  thinkingLevel: ThinkingLevelSchema,
});
export type NewSessionOk = z.infer<typeof NewSessionOkSchema>;

export const NewSessionEnvelopeSchema = z.union([NewSessionOkSchema, CommandErrorSchema]);
export type NewSessionEnvelope = NewSessionOk | z.infer<typeof CommandErrorSchema>;
