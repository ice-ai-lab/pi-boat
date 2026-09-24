import { z } from 'zod';
import { ThinkingLevelSchema } from '../constants';
import {
  AgentMessageSchema,
  ImageContentSchema,
  SystemMessageSchema,
  TextContentSchema,
  ThinkingContentSchema,
  ToolCallContentSchema,
  UsageSchema,
} from './message';

/**
 * 会话文件条目（`.jsonl` 每行，docs/02 §3.1）。
 * 形状对齐 SDK 0.87.x `core/session-manager.ts` 的 SessionHeader/SessionEntry，
 * 时间戳为 ISO 字符串（JSON 行格式，区别于消息内的 epoch 毫秒）。
 */

export const SessionHeaderSchema = z.object({
  type: z.literal('session'),
  version: z.number().optional(),
  id: z.string(),
  timestamp: z.string(),
  cwd: z.string(),
  parentSession: z.string().optional(),
});
export type SessionHeader = z.infer<typeof SessionHeaderSchema>;

/** 条目公共底座：id/parentId 构成树，leaf 指针沿树游走 */
const SessionEntryBaseSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  timestamp: z.string(),
});

export const SessionMessageEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('message'),
  message: AgentMessageSchema,
});
export type SessionMessageEntry = z.infer<typeof SessionMessageEntrySchema>;

export const ThinkingLevelChangeEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('thinking_level_change'),
  thinkingLevel: ThinkingLevelSchema,
});
export type ThinkingLevelChangeEntry = z.infer<typeof ThinkingLevelChangeEntrySchema>;

export const ModelChangeEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('model_change'),
  provider: z.string(),
  modelId: z.string(),
});
export type ModelChangeEntry = z.infer<typeof ModelChangeEntrySchema>;

export const CompactionEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('compaction'),
  summary: z.string(),
  firstKeptEntryId: z.string(),
  tokensBefore: z.number(),
  /** 扩展自定义数据（如 ArtifactIndex），形状由扩展约定 */
  details: z.unknown().optional(),
  usage: UsageSchema.optional(),
  /** true = 扩展生成；缺省/false = pi 自身生成 */
  fromHook: z.boolean().optional(),
  /** 该压缩边界处的完整 prompt 与工具状态（SDK ≥ 0.86）；UI 不渲染 */
  systemMessage: SystemMessageSchema.optional(),
});
export type CompactionEntry = z.infer<typeof CompactionEntrySchema>;

/**
 * 用量条目（SDK ≥ 0.86）：记录不进模型上下文但计费的用量（如 `kind: "cache_warm"`
 * 的 prompt 缓存预热）。**统计必须计入**，否则 token / cost 与 SDK `/session` 不一致。
 */
export const UsageEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('usage'),
  /** 用量类别，如 `cache_warm` */
  kind: z.string(),
  provider: z.string(),
  model: z.string(),
  usage: UsageSchema,
  /** 给人看的用量说明（可选） */
  note: z.string().optional(),
});
export type UsageEntry = z.infer<typeof UsageEntrySchema>;

/**
 * 上下文编辑条目（SDK ≥ 0.86）：省略或替换某个既有条目的模型上下文，不改原始历史。
 * UI 忽略它（历史浏览要「发生过什么」而非「模型看到什么」）；`replacement: null`
 * = 该条目不再进上下文。
 */
export const ContextEditEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('context_edit'),
  targetId: z.string(),
  replacement: z
    .object({
      content: z.union([
        z.string(),
        z.array(
          z.union([
            TextContentSchema,
            ThinkingContentSchema,
            ImageContentSchema,
            ToolCallContentSchema,
          ]),
        ),
      ]),
    })
    .nullable(),
});
export type ContextEditEntry = z.infer<typeof ContextEditEntrySchema>;

export const BranchSummaryEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('branch_summary'),
  fromId: z.string(),
  summary: z.string(),
  details: z.unknown().optional(),
  usage: UsageSchema.optional(),
  fromHook: z.boolean().optional(),
});
export type BranchSummaryEntry = z.infer<typeof BranchSummaryEntrySchema>;

/** 扩展持久化条目：不进 LLM 上下文，reload 时按 customType 重建状态 */
export const CustomEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('custom'),
  customType: z.string(),
  data: z.unknown().optional(),
});
export type CustomEntry = z.infer<typeof CustomEntrySchema>;

/** 分支命名书签（label=undefined 表示清除命名，JSON 序列化后字段缺省） */
export const LabelEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('label'),
  targetId: z.string(),
  label: z.string().optional(),
});
export type LabelEntry = z.infer<typeof LabelEntrySchema>;

/** 会话元数据条目（如用户改名历史行） */
export const SessionInfoEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('session_info'),
  name: z.string().optional(),
});
export type SessionInfoEntry = z.infer<typeof SessionInfoEntrySchema>;

/** 扩展注入上下文的消息条目：进 LLM 上下文（区别于 CustomEntry） */
export const CustomMessageEntrySchema = SessionEntryBaseSchema.extend({
  type: z.literal('custom_message'),
  customType: z.string(),
  content: z.union([z.string(), z.array(z.union([TextContentSchema, ImageContentSchema]))]),
  details: z.unknown().optional(),
  display: z.boolean(),
});
export type CustomMessageEntry = z.infer<typeof CustomMessageEntrySchema>;

export const SessionEntrySchema = z.discriminatedUnion('type', [
  SessionMessageEntrySchema,
  ThinkingLevelChangeEntrySchema,
  ModelChangeEntrySchema,
  UsageEntrySchema,
  CompactionEntrySchema,
  BranchSummaryEntrySchema,
  CustomEntrySchema,
  CustomMessageEntrySchema,
  ContextEditEntrySchema,
  LabelEntrySchema,
  SessionInfoEntrySchema,
]);
export type SessionEntry = z.infer<typeof SessionEntrySchema>;

/** 原始文件行联合（首行 header + 其后条目） */
export const FileEntrySchema = z.union([SessionHeaderSchema, SessionEntrySchema]);
export type FileEntry = z.infer<typeof FileEntrySchema>;
