/**
 * 历史懒加载与滚动保持（A 类移植自 pi-web lib/chat-lazy-load.ts）。
 * 两个关注点：
 * ① 可见窗口切片（只渲染最近 N 轮，向上翻页扩大）
 * ② 向上追加内容时不跳动（加之前记「距底部距离」，加之后按新高度还原）
 */
export const VISIBLE_PAGE_SIZE = 50;
export const CHAT_SCROLL_TAIL_TOLERANCE = 8;
export const CHAT_SCROLL_REATTACH_TOLERANCE = 96;

/** 可见窗口切片（从尾部往前取） */
export function getVisibleRenderWindow(
  totalCount: number,
  visibleCount: number,
): { startIndex: number; hasMore: boolean } {
  const clamped = Math.min(Math.max(visibleCount, 0), Math.max(totalCount, 0));
  const startIndex = Math.max(0, totalCount - clamped);
  return { startIndex, hasMore: startIndex > 0 };
}

export function getNextVisibleCount(
  currentVisibleCount: number,
  pageSize = VISIBLE_PAGE_SIZE,
): number {
  return currentVisibleCount + pageSize;
}

/** 记录「距底部距离」（向上追加内容前后各取一次） */
export function captureScrollDistance(scrollHeight: number, scrollTop: number): number {
  return scrollHeight - scrollTop;
}

/** 按新的高度还原 scrollTop —— 内容在前方增长时视觉位置不动 */
export function restoreScrollTop(scrollHeight: number, savedDistance: number): number {
  return Math.max(0, scrollHeight - savedDistance);
}

export function isScrollAtTail(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  tolerance = CHAT_SCROLL_TAIL_TOLERANCE,
): boolean {
  return scrollTop + clientHeight >= scrollHeight - tolerance;
}

/** 吸附状态推进（上滚即脱离；未吸附时向下进入重吸容差则重吸） */
export function getLiveFollowAttached(
  wasAttached: boolean,
  previousScrollTop: number,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  reattachTolerance = CHAT_SCROLL_REATTACH_TOLERANCE,
): boolean {
  if (isScrollAtTail(scrollTop, clientHeight, scrollHeight)) return true;
  if (scrollTop < previousScrollTop) return false;
  if (
    !wasAttached &&
    scrollTop > previousScrollTop &&
    isScrollAtTail(scrollTop, clientHeight, scrollHeight, reattachTolerance)
  ) {
    return true;
  }
  return wasAttached;
}

export function shouldShowScrollToLatest(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  tolerance = CHAT_SCROLL_TAIL_TOLERANCE,
): boolean {
  if (scrollHeight <= clientHeight) return false;
  return !isScrollAtTail(scrollTop, clientHeight, scrollHeight, tolerance);
}
