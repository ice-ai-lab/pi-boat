/**
 * 会话列表窗口化（A 类移植自 pi-web components/SessionSidebar.tsx 的
 * getSessionListIndices）：行高固定，只挂载可视切片 + overscan。
 * 与 chat-lazy-load 的滚动距离保持是两套不同用途（这里是「少挂 DOM」，那里是「加内容不跳」）。
 */

/** 行高固定（渲染必须与此一致，否则窗口算错） */
export const SESSION_LIST_ITEM_HEIGHT = 54;
/** 可视区上下各多挂载的行数 */
export const SESSION_LIST_OVERSCAN = 8;

/** 返回应挂载的索引切片（含 overscan；focusedIndex 强制保留，防行内重命名被卸载） */
export function getSessionListIndices(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  focusedIndex = -1,
): number[] {
  if (count <= 0) return [];
  const visibleCount =
    Math.ceil((viewportHeight || 600) / SESSION_LIST_ITEM_HEIGHT) + SESSION_LIST_OVERSCAN * 2;
  const start = Math.max(
    0,
    Math.min(
      Math.floor(scrollTop / SESSION_LIST_ITEM_HEIGHT) - SESSION_LIST_OVERSCAN,
      Math.max(count - visibleCount, 0),
    ),
  );
  const end = Math.min(count, start + visibleCount);
  const indices = Array.from({ length: end - start }, (_, offset) => start + offset);
  if (focusedIndex >= 0 && focusedIndex < count) {
    if (!indices.includes(focusedIndex)) {
      if (focusedIndex < start) indices.unshift(focusedIndex);
      else indices.push(focusedIndex);
    }
  }
  return indices;
}

/** 列表总高度（窗口化的占位容器用） */
export function getSessionListHeight(count: number): number {
  return count * SESSION_LIST_ITEM_HEIGHT;
}

/** 索引在哪一行（首项定位 / 滚动到选中项） */
export function getScrollTopForIndex(index: number): number {
  return Math.max(0, index) * SESSION_LIST_ITEM_HEIGHT;
}
