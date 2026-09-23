import type { RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';

/**
 * 中间内容区宽度把手（原型 `.chat-handle` 双侧 + `--mh-y` 指针跟随光条）。
 *
 * 规格照原型脚本：单侧位移 ×2（内容居中）、宽度 clamp 到 `[640, 列宽 - 116]`、
 * 持久化 key `piboat.conversation.contentWidth`、滚轮落在把手上转发给会话滚动区。
 * 默认宽度 = `min(max(760, min(列宽 * 0.88, 1160)), max)`。
 */
export const CHAT_MIN = 640;
/** 两侧各留 58px（24px 偏移 + 把手 + 余量），保证把手可用 */
export const CHAT_EDGE = 116;
export const CHAT_WIDTH_STORAGE_KEY = 'piboat.conversation.contentWidth';

function readPref(): number | null {
  try {
    const value = Number(window.localStorage.getItem(CHAT_WIDTH_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/** 列宽 + 偏好 → 最终内容宽度（导出便于单测） */
export function resolveChatW(col: number, pref: number | null): number {
  const max = Math.max(CHAT_MIN, col - CHAT_EDGE);
  if (pref !== null) return Math.min(Math.max(pref, CHAT_MIN), max);
  return Math.min(Math.max(760, Math.min(col * 0.88, 1160)), max);
}

export interface ContentWidthControlsProps {
  /** 会话滚动区（把手上的滚轮事件转发给它） */
  scrollRef: RefObject<HTMLDivElement | null>;
  className?: string;
}

export function ContentWidthControls({ scrollRef, className }: ContentWidthControlsProps) {
  const publish = useCallback(() => {
    const center = document.querySelector('.conv-scroll');
    if (center === null) return;
    const width = Math.round(resolveChatW(center.clientWidth, readPref()));
    document.documentElement.style.setProperty('--chat-w', `${width}px`);
  }, []);

  useEffect(() => {
    publish();
    window.addEventListener('resize', publish);
    return () => window.removeEventListener('resize', publish);
  }, [publish]);

  return (
    <>
      <ChatHandle side="left" scrollRef={scrollRef} publish={publish} className={className} />
      <ChatHandle side="right" scrollRef={scrollRef} publish={publish} className={className} />
    </>
  );
}

function ChatHandle({
  side,
  scrollRef,
  publish,
  className,
}: {
  side: 'left' | 'right';
  scrollRef: RefObject<HTMLDivElement | null>;
  publish: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    origin: number;
    latest: number;
    base: number;
    frame: number | null;
  } | null>(null);

  const outward = (): number => {
    const state = drag.current;
    if (state === null) return 0;
    const dx = state.latest - state.origin;
    return state.base + (side === 'right' ? dx : -dx) * 2;
  };

  const writeWidth = useCallback((value: number) => {
    const center = document.querySelector('.center');
    if (center === null) return;
    document.documentElement.style.setProperty(
      '--chat-w',
      `${Math.round(resolveChatW(center.clientWidth, value))}px`,
    );
  }, []);

  return (
    <div
      ref={ref}
      className={className === undefined ? 'chat-handle' : `chat-handle ${className}`}
      data-side={side}
      title="拖拽调整内容宽度"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setAttribute('data-dragging', '');
        const base =
          Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--chat-w'),
          ) || 760;
        drag.current = { origin: event.clientX, latest: event.clientX, base, frame: null };
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (state === null) return;
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--mh-y', `${event.clientY - box.top}px`);
        state.latest = event.clientX;
        state.frame ??= requestAnimationFrame(() => {
          const current = drag.current;
          if (current !== null) current.frame = null;
          writeWidth(outward());
        });
      }}
      onPointerUp={(event) => {
        const state = drag.current;
        if (state === null) return;
        event.currentTarget.removeAttribute('data-dragging');
        if (state.frame !== null) cancelAnimationFrame(state.frame);
        state.latest = event.clientX;
        if (state.latest !== state.origin) {
          const center = document.querySelector('.conv-scroll');
          if (center !== null) {
            const resolved = Math.round(resolveChatW(center.clientWidth, outward()));
            try {
              window.localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(resolved));
            } catch {
              // best-effort
            }
          }
        }
        drag.current = null;
        publish();
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onWheel={(event) => {
        if (event.ctrlKey || event.deltaY === 0) return;
        const el = scrollRef.current;
        if (el === null) return;
        const px =
          event.deltaMode === 1
            ? event.deltaY * 16
            : event.deltaMode === 2
              ? event.deltaY * el.clientHeight
              : event.deltaY;
        el.scrollBy({ top: px });
      }}
    />
  );
}
