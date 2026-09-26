/**
 * `@` 文件提及（A 类按设计规范 lib/file-fuzzy.ts）。
 * 规则与 pi TUI 对齐：`@` 必须位于行首或空白之后（`foo@bar` 不触发）；
 * 打分梯度 exact 100 / prefix 80 / substring 50 / 路径 substring 30，目录 +10，
 * 兜底子序列匹配（`chinp` 能找到）。
 * 含 `/` 的查询按**整条相对路径**匹配——这是「插入 `@src/` 后继续下钻」的关键。
 */

export interface AtQueryMatch {
  /** `@` 在文本中的下标 */
  start: number;
  /** `@` 之后已输入的文本（去掉引号），可为空 */
  query: string;
  /** 使用了 `@"..."` 引号形式 */
  quoted: boolean;
}

export interface FileIndexEntry {
  /** 相对 cwd 的路径，`/` 分隔，无尾斜杠 */
  path: string;
  isDir: boolean;
}

export const AT_RESULT_LIMIT = 20;

/** 光标前的 `@` token（返回 null = 当前不在提及态） */
export function extractAtQuery(textBeforeCursor: string): AtQueryMatch | null {
  const quoted = /(?:^|\s)@"([^"\n]*)$/.exec(textBeforeCursor);
  if (quoted !== null) {
    return {
      start: textBeforeCursor.length - ((quoted[1]?.length ?? 0) + 2),
      query: quoted[1] ?? '',
      quoted: true,
    };
  }
  const plain = /(?:^|\s)@([^\s"]*)$/.exec(textBeforeCursor);
  if (plain !== null) {
    return {
      start: textBeforeCursor.length - ((plain[1]?.length ?? 0) + 1),
      query: plain[1] ?? '',
      quoted: false,
    };
  }
  return null;
}

/** 把扁平文件清单（file-index 的 `files`）展开成「目录 + 文件」条目 */
export function buildEntriesFromFiles(files: readonly string[]): FileIndexEntry[] {
  const dirs = new Set<string>();
  for (const file of files) {
    let index = file.indexOf('/');
    while (index !== -1) {
      dirs.add(file.slice(0, index));
      index = file.indexOf('/', index + 1);
    }
  }
  const entries: FileIndexEntry[] = [];
  for (const dir of dirs) entries.push({ path: dir, isDir: true });
  for (const file of files) {
    if (file.length === 0) continue;
    entries.push({ path: file, isDir: false });
  }
  return entries;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return needle.length === 0;
}

function pathDepth(path: string): number {
  let depth = 0;
  for (const char of path) if (char === '/') depth += 1;
  return depth;
}

export function scoreEntry(entry: FileIndexEntry, lowerQuery: string): number {
  const lowerPath = entry.path.toLowerCase();
  let score = 0;
  if (lowerQuery.includes('/')) {
    if (lowerPath === lowerQuery) score = 100;
    else if (lowerPath.startsWith(lowerQuery)) score = 80;
    else if (lowerPath.includes(lowerQuery)) score = 50;
    else if (isSubsequence(lowerQuery, lowerPath)) score = 10;
  } else {
    const slash = lowerPath.lastIndexOf('/');
    const lowerName = slash === -1 ? lowerPath : lowerPath.slice(slash + 1);
    if (lowerName === lowerQuery) score = 100;
    else if (lowerName.startsWith(lowerQuery)) score = 80;
    else if (lowerName.includes(lowerQuery)) score = 50;
    else if (lowerPath.includes(lowerQuery)) score = 30;
    else if (isSubsequence(lowerQuery, lowerPath)) score = 10;
  }
  if (entry.isDir && score > 0) score += 10;
  return score;
}

export function filterFileEntries(
  entries: readonly FileIndexEntry[],
  query: string,
  limit: number = AT_RESULT_LIMIT,
): FileIndexEntry[] {
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.length === 0) return entries.slice(0, limit);

  const scored: { entry: FileIndexEntry; score: number }[] = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, lowerQuery);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      pathDepth(a.entry.path) - pathDepth(b.entry.path) ||
      a.entry.path.localeCompare(b.entry.path),
  );
  return scored.slice(0, limit).map((scoredEntry) => scoredEntry.entry);
}

export interface AtInsertion {
  /** 替换掉 `@token` 的文本 */
  text: string;
  /** 插入后光标相对 `text` 起点的偏移 */
  cursorOffset: number;
}

/** 确认候选后的插入文本：文件闭合 token（`@path `），目录保持菜单可下钻（`@dir/`） */
export function buildAtInsertText(
  entryPath: string,
  isDir: boolean,
  forceQuotes = false,
): AtInsertion {
  const path = isDir ? `${entryPath}/` : entryPath;
  const needsQuotes = forceQuotes || path.includes(' ');
  if (isDir) {
    const text = needsQuotes ? `@"${path}"` : `@${path}`;
    return { text, cursorOffset: needsQuotes ? text.length - 1 : text.length };
  }
  const text = needsQuotes ? `@"${path}" ` : `@${path} `;
  return { text, cursorOffset: text.length };
}

/** 把 `@token` 替换成候选（返回新文本与光标位置） */
export function applyAtInsertion(
  text: string,
  match: AtQueryMatch,
  entry: FileIndexEntry,
): { text: string; caret: number } {
  const insertion = buildAtInsertText(entry.path, entry.isDir, match.quoted);
  const cursor = match.start + (match.quoted ? 2 : 1) + match.query.length;
  const next = `${text.slice(0, match.start)}${insertion.text}${text.slice(cursor)}`;
  return { text: next, caret: match.start + insertion.cursorOffset };
}
