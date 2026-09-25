import { z } from 'zod';

/**
 * 工具与斜杠命令（docs/02 §3.4 尾部两组）。
 *
 * **不重新定义**（ADR-0017）：`SourceInfo` / `SourceScope` / `SourceOrigin` /
 * `ToolInfo` / `SlashCommandInfo` 全部来自 pi-coding-agent 的公开导出。
 * `active` 是 PiBoat 叠加的运行时标记（服务端按当前激活工具集标注），故用 `&` 派生。
 */
export type {
  SlashCommandInfo,
  SlashCommandSource,
  SourceInfo,
} from '@earendil-works/pi-coding-agent';

import type { ToolInfo as SdkToolInfo, SourceInfo } from '@earendil-works/pi-coding-agent';

// SDK 未从包根导出这两个别名（定义在 core/source-info.ts），从 SourceInfo 提取
export type SourceScope = SourceInfo['scope'];
export type SourceOrigin = SourceInfo['origin'];

/** 工具信息 + 运行时激活标记（`active` 仅 get_tools 场景叠加） */
export type ToolInfo = SdkToolInfo & { active?: boolean };

// ---------------------------------------------------------------------------
// 工具预设（G2-9）——PiBoat 自有概念，SDK 没有对应物
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
export type ConcreteToolPreset = 'none' | 'read-only' | 'default' | 'full';

/** 各预设对应的工具名单（`configured` 无名单，故不在此表中） */
export const TOOL_PRESET_NAMES: Record<ConcreteToolPreset, readonly string[]> = {
  none: [],
  'read-only': ['read', 'grep', 'find', 'ls'],
  default: ['read', 'bash', 'edit', 'write'],
  full: ['bash', 'read', 'edit', 'write', 'grep', 'find', 'ls'],
};

/** 预设 → 工具名单；`configured` 返回 undefined（= 不下发覆盖） */
export function toolNamesForPreset(preset: ToolPreset): string[] | undefined {
  if (preset === 'configured') return undefined;
  return [...TOOL_PRESET_NAMES[preset]];
}
