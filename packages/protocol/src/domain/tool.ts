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
 * 工具预设：用户侧的"工具 loadout"选择，避免前端自己拼工具名列表。四项各对应一份固定名单。
 *
 * `chat-only` 即"纯聊天"边界：一个工具都不开（工具调用能力完全关闭，且换 resource
 * loader——关扩展/技能）。单项名与设计规范一致（docs/06 §284），也是 UI 上直接显示的
 * 标签（docs/09 T2-6：不手写第二份中文别名）。
 */
export const TOOL_PRESETS = ['chat-only', 'read-only', 'default', 'full'] as const;
export const ToolPresetSchema = z.enum(TOOL_PRESETS);
export type ToolPreset = z.infer<typeof ToolPresetSchema>;

/** 各预设对应的工具名单 */
export const TOOL_PRESET_NAMES: Record<ToolPreset, readonly string[]> = {
  'chat-only': [],
  'read-only': ['read', 'grep', 'find', 'ls'],
  default: ['read', 'bash', 'edit', 'write'],
  full: ['bash', 'read', 'edit', 'write', 'grep', 'find', 'ls'],
};

/** 预设 → 工具名单（拷贝一份：调用方可能原地改） */
export function toolNamesForPreset(preset: ToolPreset): string[] {
  return [...TOOL_PRESET_NAMES[preset]];
}

/**
 * 工具名单 → 预设（`TOOL_PRESET_NAMES` 的反查；与任何一份名单都不等则 `null`）。
 *
 * 用途是菜单的勾选口径：按**当前生效的工具集**反查，而不是"上次点了哪一项"。
 * 没钉过的会话跟随 settings.json 的 `defaultTools`，默认设置下正好命中 `default`
 * ——界面与实际生效的工具集一致；settings.json 被改过（或扩展塞进了工具）时四项都不勾。
 */
export function presetForToolNames(names: readonly string[]): ToolPreset | null {
  const wanted = new Set(names);
  for (const preset of TOOL_PRESETS) {
    const list = TOOL_PRESET_NAMES[preset];
    if (list.length === wanted.size && list.every((name) => wanted.has(name))) return preset;
  }
  return null;
}
