import type { Turn } from '../stream/view-model';

/**
 * 「本轮写出的文件」（A 类移植自 pi-web lib/turn-written-files.ts 的抽取逻辑）。
 * 只认**写类工具**的参数：write / edit（以及 bash 里明显重定向的场景不猜）。
 * 与工具结果里的文本无关——从文本里 grep 路径会把模型随口提到的路径也算进来。
 */
const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'notebook_edit']);

function pathFromArgs(args: unknown): string | null {
  if (args === null || typeof args !== 'object') return null;
  const record = args as Record<string, unknown>;
  for (const key of ['file_path', 'filePath', 'path', 'target_file']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** 从参数文本（流式期间可能是不完整 JSON）里尽力抽路径 */
function pathFromArgsText(argsText: string): string | null {
  try {
    return pathFromArgs(JSON.parse(argsText));
  } catch {
    // 流式期间 JSON 可能被截断（值没有收尾引号）→ 收尾引号可选
    const match = /"(?:file_path|filePath|path|target_file)"\s*:\s*"([^"\\]+)"?/.exec(argsText);
    return match?.[1] ?? null;
  }
}

export interface WrittenFileGroup {
  turnId: string;
  paths: string[];
}

/** 逐轮抽出「写出的文件」（去重、保持首次出现顺序） */
export function extractTurnWrittenFiles(turns: readonly Turn[]): WrittenFileGroup[] {
  const groups: WrittenFileGroup[] = [];
  for (const turn of turns) {
    const paths: string[] = [];
    for (const item of turn.trail) {
      if (item.kind !== 'tool') continue;
      if (!WRITE_TOOLS.has(item.toolName)) continue;
      const path = pathFromArgsText(item.argsText);
      if (path !== null && !paths.includes(path)) paths.push(path);
    }
    if (paths.length > 0) groups.push({ turnId: turn.id, paths });
  }
  return groups;
}

/** 整段对话写过的全部文件（去重；状态面板/统计用） */
export function allWrittenFiles(turns: readonly Turn[]): string[] {
  const seen: string[] = [];
  for (const group of extractTurnWrittenFiles(turns)) {
    for (const path of group.paths) if (!seen.includes(path)) seen.push(path);
  }
  return seen;
}

/** 展示用：相对 cwd 的短路径 */
export function shortPath(path: string, cwd?: string | null): string {
  if (cwd === null || cwd === undefined || cwd.length === 0) return path;
  const normalized = path.replace(/\\/g, '/');
  const base = cwd.replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.startsWith(`${base}/`) ? normalized.slice(base.length + 1) : normalized;
}
