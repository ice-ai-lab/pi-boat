import { z } from 'zod';
import { ThinkingLevelSchema } from '../constants';
import type { ImageContent } from '../domain/message';
import type { ModelRef } from '../domain/session-info';
import type { AgentState, SessionStatsInfo } from '../domain/state';
import { type SlashCommandInfo, type ToolInfo, ToolPresetSchema } from '../domain/tool';
import type { CompactionResult } from '../events/wire-agent-event';

/**
 * 请求体里的图片：形状由 pi-ai 的 `ImageContent` 定义（ADR-0017），
 * 这里不做第二份字段校验，只挡「不是数组」。
 */
const ImagesSchema = z.array(z.custom<ImageContent>());

/**
 * ③ Agent 命令通道（docs/02 §4）：`POST /api/agent/:id` 请求体判别联合。
 * 字段对齐 SDK 0.87.1 的 `modes/rpc/rpc-types.ts` `RpcCommand`（命名与返回形状按本仓
 * 契约收敛，差异逐条注释）。
 */

export const STREAMING_BEHAVIORS = ['steer', 'followUp'] as const;
export const StreamingBehaviorSchema = z.enum(STREAMING_BEHAVIORS);

export const AgentCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('prompt'),
    message: z.string().min(1),
    images: ImagesSchema.optional(),
    streamingBehavior: StreamingBehaviorSchema.optional(),
  }),
  z.object({
    type: z.literal('steer'),
    message: z.string().min(1),
    images: ImagesSchema.optional(),
  }),
  z.object({
    type: z.literal('follow_up'),
    message: z.string().min(1),
    images: ImagesSchema.optional(),
  }),
  z.object({ type: z.literal('abort') }),
  z.object({ type: z.literal('clear_queue') }),
  z.object({ type: z.literal('get_state') }),
  z.object({ type: z.literal('get_session_stats') }),
  z.object({ type: z.literal('get_last_assistant_text') }),
  z.object({ type: z.literal('get_commands') }),
  z.object({ type: z.literal('get_tools') }),
  /**
   * set_tools 双形态（`toolNames` 与 `preset` 恰好给一个，由 core 校验后报 400）：
   * - `toolNames`：显式名单（前端高级模式）
   * - `preset`：预设（G2-9）；`configured` = 撤销钉住，回到 settings.json 的 defaultTools
   * 两个字段都可选、由 core 做互斥校验：判别联合的成员必须是普通 ZodObject，
   * 挂 ZodUnion/ZodEffects 会让 outside-in 的判别提取失败。
   */
  z.object({
    type: z.literal('set_tools'),
    toolNames: z.array(z.string()).optional(),
    preset: ToolPresetSchema.optional(),
  }),
  // —— 模型 / 思考 ——
  z.object({
    type: z.literal('set_model'),
    provider: z.string().min(1),
    modelId: z.string().min(1),
  }),
  z.object({
    type: z.literal('set_thinking_level'),
    level: ThinkingLevelSchema,
  }),
  // —— 压缩 / 重试 ——
  z.object({
    type: z.literal('compact'),
    customInstructions: z.string().optional(),
  }),
  z.object({ type: z.literal('abort_compaction') }),
  z.object({ type: z.literal('set_auto_compaction'), enabled: z.boolean() }),
  z.object({ type: z.literal('set_auto_retry'), enabled: z.boolean() }),
  // —— 分支（fork/clone 为**破坏性原地替换**，docs/01 §8-1）——
  z.object({ type: z.literal('fork'), entryId: z.string().min(1) }),
  z.object({ type: z.literal('fork_branch'), entryId: z.string().min(1) }),
  z.object({ type: z.literal('clone'), leafId: z.string().optional() }),
  z.object({
    type: z.literal('navigate_tree'),
    targetId: z.string().min(1),
    summarize: z.boolean().optional(),
    customInstructions: z.string().optional(),
    replaceInstructions: z.boolean().optional(),
    label: z.string().optional(),
  }),
  // —— 会话管理 ——
  z.object({ type: z.literal('set_session_name'), name: z.string() }),
  z.object({ type: z.literal('reload') }),
  // —— 扩展 UI（ADR-0012）——
  /**
   * 扩展 UI 应答。三种形状互斥（`value` / `confirmed` / `cancelled` 恰给一个），
   * 由 core 校验并在都不满足时报 400。
   */
  z.object({
    type: z.literal('extension_ui_response'),
    id: z.string().min(1),
    value: z.string().optional(),
    confirmed: z.boolean().optional(),
    cancelled: z.literal(true).optional(),
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

export interface LastAssistantTextResult {
  text: string | null;
}

export interface CommandListResult {
  commands: SlashCommandInfo[];
}

/**
 * set_tools 双路径返回（docs/02 §4 工具组）：
 * - 运行中会话：走 switch，data 为 null
 * - 冷会话：route 层重建 runtime，data 为 `{sessionId, recreated}`
 */
export type SetToolsResult = null | { sessionId: string; recreated: boolean };

/**
 * 分支命令返回：`cancelled` 为 true 时 `newSessionId` 缺省
 * （SDK 的 fork/switch 可被 `session_before_fork` 之类的扩展钩子取消）。
 */
export interface BranchResult {
  cancelled: boolean;
  newSessionId?: string;
}

/** navigate_tree 返回：切到 user 消息时回填该消息文本供编辑器续写 */
export interface NavigateTreeResult {
  cancelled: boolean;
  editorText?: string;
}

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
  set_model: ModelRef;
  set_thinking_level: null;
  compact: CompactionResult;
  abort_compaction: null;
  set_auto_compaction: null;
  set_auto_retry: null;
  fork: BranchResult;
  fork_branch: BranchResult;
  clone: BranchResult;
  navigate_tree: NavigateTreeResult;
  set_session_name: null;
  reload: null;
  extension_ui_response: null;
}

/** 按命令字面量取返回值类型：`CommandData<'get_state'>` → AgentState */
export type CommandData<T extends keyof AgentCommandResults> = AgentCommandResults[T];

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
    images: ImagesSchema.optional(),
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
export type NewSessionOk = {
  success: true;
  /** 首条 prompt 即时结果（prompt 返回 null），ensure_session 亦为 null */
  data: null;
  sessionId: string;
  model: ModelRef | null;
  thinkingLevel: import('../constants').ThinkingLevel;
};

// ---------------------------------------------------------------------------
// 恢复冷会话（POST /api/agent/:id/resume，ADR-0013）
// ---------------------------------------------------------------------------
