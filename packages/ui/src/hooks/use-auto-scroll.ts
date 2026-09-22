import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * 滚动吸附模型（docs/06-ui-design.md §8.2，照 pi-web `lib/chat-lazy-load.ts`）。
 *
 * 为什么不用「上滚超过一屏才脱离」：那个启发式对短消息不灵敏；本模型
 * ①贴底即吸附 ②**向上滚立即脱离** ③未吸附但向下滚进入 96px 重吸 ④其余保持原状态
 * （内容增长不会误吸附）。两个容差常量与判定函数是纯函数 → 必须有单测。
 */

/** 贴底容差：top + clientHeight >= scrollHeight - 8 */
export const TAIL_TOLERANCE = 8;
/** 重吸容差：未吸附时向下滚进 96px 内重新吸附 */
export const REATTACH_TOLERANCE = 96;

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** 是否贴底 */
export function isAtBottom(el: ScrollMetrics, tolerance = TAIL_TOLERANCE): boolean {
  return el.scrollTop + el.clientHeight >= el.scrollHeight - tolerance;
}

/**
 * 吸附状态迁移。`wasAttached` 为上一次状态，`prevTop`/`top` 为相邻两次 scrollTop。
 */
export function getLiveFollowAttached(
  wasAttached: boolean,
  prevTop: number,
  top: number,
  el: { clientHeight: number; scrollHeight: number },
): boolean {
  if (isAtBottom({ ...el, scrollTop: top })) return true;
  if (top < prevTop) return false; // 向上滚 → 立即脱离
  if (!wasAttached && el.scrollHeight - top - el.clientHeight <= REATTACH_TOLERANCE) return true;
  return wasAttached;
}

/** 「回到底部」按钮的显示条件（pi-web `shouldShowScrollToLatest`） */
export function shouldShowScrollToLatest(el: ScrollMetrics, tolerance = TAIL_TOLERANCE): boolean {
  return el.scrollHeight > el.clientHeight && !isAtBottom(el, tolerance);
}

export interface UseAutoScrollOptions {
  /** 内容变化信号：变化时若处于吸附态则自动回底 */
  revision: unknown;
}

export interface UseAutoScrollResult {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  attached: boolean;
  showScrollToBottom: boolean;
  onScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useAutoScroll({ revision }: UseAutoScrollOptions): UseAutoScrollResult {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const attachedRef = useRef(true);
  const prevTopRef = useRef(0);
  const [attached, setAttached] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const sync = useCallback((next: boolean) => {
    if (attachedRef.current !== next) {
      attachedRef.current = next;
      setAttached(next);
    }
    const el = viewportRef.current;
    setShowScrollToBottom(el === null ? false : shouldShowScrollToLatest(el));
  }, []);

  const onScroll = useCallback(() => {
    const el = viewportRef.current;
    if (el === null) return;
    const next = getLiveFollowAttached(attachedRef.current, prevTopRef.current, el.scrollTop, el);
    prevTopRef.current = el.scrollTop;
    sync(next);
  }, [sync]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = viewportRef.current;
      if (el === null) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      prevTopRef.current = el.scrollTop;
      sync(true);
    },
    [sync],
  );

  // 内容增长：仅吸附态自动回底（instant，避免流式期间动画堆积）
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision 是"内容变化信号"，值本身不参与计算
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (el === null) return;
    if (attachedRef.current) el.scrollTop = el.scrollHeight;
    prevTopRef.current = el.scrollTop;
    sync(attachedRef.current);
  }, [revision, sync]);

  return { viewportRef, attached, showScrollToBottom, onScroll, scrollToBottom };
}
