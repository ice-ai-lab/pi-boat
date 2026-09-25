/**
 * unified diff 解析（git diff / `git diff --staged` 的单文件 patch → 渲染行）。
 * 只按行解析（不做 pi-web 的左右配对），足够统一视图渲染；
 * 解析失败不抛错，返回空数组（调用方退化为「无 diff」）。
 */

export type DiffRow =
  | { kind: 'hunk'; header: string }
  | { kind: 'context'; text: string; oldLine: number; newLine: number }
  | { kind: 'add'; text: string; newLine: number }
  | { kind: 'remove'; text: string; oldLine: number }
  | { kind: 'meta'; text: string };

export interface ParsedDiff {
  rows: DiffRow[];
  additions: number;
  deletions: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** 解析单个文件的 unified patch */
export function parseUnifiedDiff(patch: string): ParsedDiff {
  const rows: DiffRow[] = [];
  let additions = 0;
  let deletions = 0;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of patch.split('\n')) {
    const header = HUNK_HEADER.exec(raw);
    if (header !== null) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      inHunk = true;
      rows.push({ kind: 'hunk', header: raw });
      continue;
    }
    if (!inHunk) {
      // 文件头（diff --git / index / --- / +++ / new file mode …）：保留为 meta
      if (raw.length > 0) rows.push({ kind: 'meta', text: raw });
      continue;
    }
    if (raw.startsWith('+')) {
      rows.push({ kind: 'add', text: raw.slice(1), newLine });
      newLine += 1;
      additions += 1;
      continue;
    }
    if (raw.startsWith('-')) {
      rows.push({ kind: 'remove', text: raw.slice(1), oldLine });
      oldLine += 1;
      deletions += 1;
      continue;
    }
    if (raw.startsWith('\\')) {
      // "\ No newline at end of file"
      rows.push({ kind: 'meta', text: raw });
      continue;
    }
    // 上下文行（前缀空格）与空行
    const text = raw.startsWith(' ') ? raw.slice(1) : raw;
    rows.push({ kind: 'context', text, oldLine, newLine });
    oldLine += 1;
    newLine += 1;
  }

  return { rows, additions, deletions };
}

/** 该 patch 是否含实际改动（用于「无改动」提示） */
export function hasChanges(parsed: ParsedDiff): boolean {
  return parsed.rows.some((row) => row.kind === 'add' || row.kind === 'remove');
}

/**
 * 工具产物 diff（SDK edit 工具的 `details.diff`）解析：
 * 行格式为 `+<行号> 文本` / `-<行号> 文本` / ` <行号> 文本`（附 firstChangedLine）。
 * 解析失败（不是该格式）返回空数组，调用方退化为原文展示（docs/05 §8.1 决策 5）。
 */
export function parseToolDiff(
  diff: string,
): { kind: 'add' | 'remove' | 'context'; lineNo: number; text: string }[] {
  const rows: { kind: 'add' | 'remove' | 'context'; lineNo: number; text: string }[] = [];
  for (const raw of diff.split('\n')) {
    if (raw.length === 0) continue;
    const marker = raw[0];
    if (marker !== '+' && marker !== '-' && marker !== ' ') return [];
    const match = /^([+-]?)\s*(\d+)\s?(.*)$/.exec(raw);
    if (match === null || match[2] === undefined) return [];
    rows.push({
      kind: marker === '+' ? 'add' : marker === '-' ? 'remove' : 'context',
      lineNo: Number(match[2]),
      text: match[3] ?? '',
    });
  }
  return rows;
}
