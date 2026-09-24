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

// ---------------------------------------------------------------------------
// 工具预设（G2-9）
// ---------------------------------------------------------------------------

/**
 * 工具预设：用户侧的"工具loadout"选择，避免前端自己拼工具名列表。
 *
 * `configured` 不是一份工具列表，而是"不下发覆盖"——让 pi 按 settings.json 的
 * `defaultTools` 自行解析（与 `pi` CLI 完全同源）。停在 `configured` 上的会话
 * **不被钉住**，会跟着设置变化。其余四项各对应一份固定名单。
 *
 * `none` 即"纯聊天"边界：一个工具都不开（工具调用能力完全关闭）。
 */
export const TOOL_PRESETS = ['configured', 'none', 'read-only', 'default', 'full'] as const;
export const ToolPresetSchema = z.enum(TOOL_PRESETS);
export type ToolPreset = z.infer<typeof ToolPresetSchema>;

/** 有显式工具名单的预设（`configured` 不在内——它不下发名单） */
export const CONCRETE_TOOL_PRESETS = ['none', 'read-only', 'default', 'full'] as const;
export type ConcreteToolPreset = (typeof CONCRETE_TOOL_PRESETS)[number];

/** 各预设对应的工具名单（`configured` 无名单，故不在此表中） */
export const TOOL_PRESET_NAMES: Record<ConcreteToolPreset, readonly string[]> = {
  none: [],
  'read-only': ['read', 'grep', 'find', 'ls'],
  default: ['read', 'bash', 'edit', 'write'],
  full: ['bash', 'read', 'edit', 'write', 'grep', 'find', 'ls'],
};

/** 参与预设识别的内置工具名（`powershell` 等价于 `bash`，见 core 归一） */
const BUILTIN_TOOL_NAMES: ReadonlySet<string> = new Set([...TOOL_PRESET_NAMES.full, 'powershell']);

/** 从激活工具名反推具体预设（无法归一到四项之一时回落 `default`） */
export function toolPresetFromToolNames(toolNames: readonly string[]): ConcreteToolPreset {
  if (toolNames.length === 0) return 'none';
  const normalized = toolNames
    .map((name) => (name === 'powershell' ? 'bash' : name))
    .filter((name) => BUILTIN_TOOL_NAMES.has(name))
    .sort()
    .join(',');
  for (const preset of CONCRETE_TOOL_PRESETS) {
    if (preset === 'none') continue;
    if ([...TOOL_PRESET_NAMES[preset]].sort().join(',') === normalized) return preset;
  }
  return 'default';
}

/** 预设 → 工具名单；`configured` 返回 undefined（= 不下发覆盖） */
export function toolNamesForPreset(preset: ToolPreset): string[] | undefined {
  if (preset === 'configured') return undefined;
  return [...TOOL_PRESET_NAMES[preset]];
}
