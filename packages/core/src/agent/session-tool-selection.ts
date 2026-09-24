import type { SessionEntry, SessionManager } from '@earendil-works/pi-coding-agent';

/**
 * 工具选择（预设 / 显式名单）的会话内持久化（G2-9）。
 *
 * 为什么需要：`setActiveToolsByName()` 只改当前 runtime 的内存状态，会话文件里没有
 * 任何痕迹。冷会话恢复（ADR-0013）或整 runtime 重建（纯聊天边界）之后就丢，
 * 用户会看到「上次钉的工具又回去了」。
 *
 * 为什么用 `custom` 条目而不是改 settings.json：这是**会话级**选择，不是全局偏好；
 * 写全局设置会让一个会话的选择影响所有其他会话。
 *
 * 磁盘形状（`.jsonl` 里的 `custom` 条目，`customType` 是本仓自有字面量——
 * 别的宿主各有各的标记，互不识别，这不是兼容性缺口而是有意为之：会话级钉住
 * 本来就只对写下它的宿主有意义）：
 * - `{version: 1, tools: string[]}`：钉住这些工具
 * - `{version: 1, cleared: true}`：撤销钉住，回到 settings.json 的 defaultTools
 *
 * 会话日志只追加，所以「撤销」只能靠**更新的**一条条目表达——没有它，最早的钉住
 * 会永远生效。
 */

/** 本仓自有磁盘标记；只在 session-tool-selection 出现一次（改名即破坏既有文件） */
export const TOOL_SELECTION_CUSTOM_TYPE = 'piboat:tool-selection';

export interface SessionToolSelectionData {
  version: 1;
  tools: string[];
}

export interface ClearedSessionToolSelectionData {
  version: 1;
  cleared: true;
}

const CLEARED = Symbol('cleared-tool-selection');

function parse(value: unknown): string[] | typeof CLEARED | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const candidate = value as { version?: unknown; tools?: unknown; cleared?: unknown };
  if (candidate.version !== 1) return undefined;
  if (candidate.cleared === true) return CLEARED;
  if (!Array.isArray(candidate.tools)) return undefined;
  if (candidate.tools.some((tool) => typeof tool !== 'string')) return undefined;
  return [...new Set(candidate.tools as string[])];
}

/**
 * 取最新一条有效选择。`undefined` = 会话自己没钉住（既有会话、创建时未指定、
 * 或已显式撤销）——此时应按 settings.json 的 defaultTools 解析。
 */
export function readSessionToolSelection(entries: readonly SessionEntry[]): string[] | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== 'custom' || entry.customType !== TOOL_SELECTION_CUSTOM_TYPE) continue;
    const parsed = parse((entry as { data?: unknown }).data);
    if (parsed === CLEARED) return undefined;
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/** 钉住一组工具名（追加一条 custom 条目） */
export function writeToolSelection(manager: SessionManager, toolNames: readonly string[]): void {
  const data: SessionToolSelectionData = { version: 1, tools: [...toolNames] };
  manager.appendCustomEntry(TOOL_SELECTION_CUSTOM_TYPE, data);
}

/** 撤销钉住（追加一条 cleared 条目；日志只追加，故必须显式作废） */
export function clearedToolSelection(manager: SessionManager): void {
  const data: ClearedSessionToolSelectionData = { version: 1, cleared: true };
  manager.appendCustomEntry(TOOL_SELECTION_CUSTOM_TYPE, data);
}
