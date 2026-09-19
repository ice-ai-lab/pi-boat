import { z } from 'zod';

/**
 * 工具与斜杠命令（docs/02 §3.4 尾部两组）。
 * 形状对齐 SDK 0.85.1：`core/extensions/types.ts` 的 ToolInfo、
 * `core/slash-commands.ts` 的 SlashCommandInfo、`core/source-info.ts` 的 SourceInfo。
 */

export const SOURCE_SCOPES = ['user', 'project', 'temporary'] as const;
export const SourceScopeSchema = z.enum(SOURCE_SCOPES);
export type SourceScope = z.infer<typeof SourceScopeSchema>;

export const SOURCE_ORIGINS = ['package', 'top-level'] as const;
export const SourceOriginSchema = z.enum(SOURCE_ORIGINS);
export type SourceOrigin = z.infer<typeof SourceOriginSchema>;

/** 资源源信息（skills/plugins/extensions 通用） */
export const SourceInfoSchema = z.object({
  path: z.string(),
  source: z.string(),
  scope: SourceScopeSchema,
  origin: SourceOriginSchema,
  baseDir: z.string().optional(),
});
export type SourceInfo = z.infer<typeof SourceInfoSchema>;

/**
 * 工具信息。`parameters` 为 TypeBox/JSON Schema 参数描述对象；
 * `active` 仅在 get_tools 场景叠加（服务端用运行时激活集标记）。
 */
export const ToolInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  promptGuidelines: z.array(z.string()).optional(),
  sourceInfo: SourceInfoSchema.optional(),
  active: z.boolean().optional(),
});
export type ToolInfo = z.infer<typeof ToolInfoSchema>;

export const SLASH_COMMAND_SOURCES = ['prompt', 'skill', 'extension'] as const;
export const SlashCommandSourceSchema = z.enum(SLASH_COMMAND_SOURCES);
export type SlashCommandSource = z.infer<typeof SlashCommandSourceSchema>;

/** 斜杠命令面板项 */
export const SlashCommandInfoSchema = z.object({
  /** 命令名（不带前导斜杠） */
  name: z.string(),
  description: z.string().optional(),
  source: SlashCommandSourceSchema,
  sourceInfo: SourceInfoSchema.optional(),
});
export type SlashCommandInfo = z.infer<typeof SlashCommandInfoSchema>;
