/**
 * 输入历史（A 类移植自 pi-web 的输入历史行为）：↑ 上翻、↓ 下翻，草稿在翻到尾部时恢复。
 * 纯函数式游标：状态只有「下标」，避免组件里散落判断。
 */
export const INPUT_HISTORY_LIMIT = 100;

export function pushHistory(history: readonly string[], text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [...history];
  // 与上一条相同则不重复记录（连按 Enter 不堆垃圾）
  if (history[history.length - 1] === trimmed) return [...history];
  const next = [...history, trimmed];
  return next.length > INPUT_HISTORY_LIMIT ? next.slice(next.length - INPUT_HISTORY_LIMIT) : next;
}

export interface HistoryCursor {
  /** 当前浏览到的下标（history.length = 未进入历史，即草稿态） */
  index: number;
  /** 进入历史前的草稿（翻到尾部时恢复） */
  draft: string;
}

export const EMPTY_CURSOR: HistoryCursor = { index: -1, draft: '' };

/** ↑：往上翻（首次进入记住草稿） */
export function historyPrev(
  history: readonly string[],
  cursor: HistoryCursor,
  currentDraft: string,
): { cursor: HistoryCursor; value: string } {
  if (history.length === 0) return { cursor, value: currentDraft };
  if (cursor.index === -1) {
    const index = history.length - 1;
    return { cursor: { index, draft: currentDraft }, value: history[index] ?? currentDraft };
  }
  const index = Math.max(0, cursor.index - 1);
  return { cursor: { ...cursor, index }, value: history[index] ?? currentDraft };
}

/** ↓：往下翻；越过最新一条回到草稿 */
export function historyNext(
  history: readonly string[],
  cursor: HistoryCursor,
  currentDraft: string,
): { cursor: HistoryCursor; value: string } {
  if (cursor.index === -1) return { cursor, value: currentDraft };
  if (cursor.index >= history.length - 1) return { cursor: EMPTY_CURSOR, value: cursor.draft };
  const index = cursor.index + 1;
  return { cursor: { ...cursor, index }, value: history[index] ?? currentDraft };
}
