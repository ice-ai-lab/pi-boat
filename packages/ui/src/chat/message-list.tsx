import type { ChatState } from '@ice-ai/client';
import {
  captureScrollDistance,
  getLiveFollowAttached,
  restoreScrollTop,
  shouldShowScrollToLatest,
} from '@ice-ai/client';
import { useCallback, useEffect, useRef } from 'react';
import { cn } from '../utils/cn';
import { AssistantTurn, UserBubble } from './assistant-turn';

/**
 * MessageList（docs/06 §4.2 / §8.2）：吸附模型滚动 + 历史懒加载。
 * 滚动判定的纯函数在 `@ice-ai/client`（chat-lazy-load，有单测）；本组件只做 DOM 接线：
 * - 贴底/重吸/上滚脱离 → getLiveFollowAttached
 * - 向上翻页前后按「距底部距离」还原视口 → capture/restoreScrollDistance（防跳动）
 */
export interface MessageListProps {
  chat: ChatState;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?(): void;
}

/** 距顶部多少像素内触发自动翻页 */
const AUTO_LOAD_THRESHOLD_PX = 80;

export function MessageList({
  chat,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachedRef = useRef(true);
  const prevTopRef = useRef(0);
  const turnCountRef = useRef(0);
  /** 向上翻页前记下的「距底部距离」，内容前插后还原 */
  const pendingAnchorRef = useRef<number | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    attachedRef.current = true;
  }, []);

  const requestOlder = useCallback(() => {
    const el = scrollRef.current;
    if (el === null || onLoadOlder === undefined) return;
    pendingAnchorRef.current = captureScrollDistance(el.scrollHeight, el.scrollTop);
    onLoadOlder();
  }, [onLoadOlder]);

  // 内容变化：优先还原翻页锚点；否则吸附跟随；自己发消息（轮数增加）强制回底
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const anchor = pendingAnchorRef.current;
    if (anchor !== null) {
      pendingAnchorRef.current = null;
      const heightBefore = el.scrollHeight;
      el.scrollTop = restoreScrollTop(heightBefore, anchor);
      // markdown/代码块异步排版会继续增高：下一帧按差量再补一次，避免视口漂移
      requestAnimationFrame(() => {
        const delta = el.scrollHeight - heightBefore;
        if (delta !== 0 && pendingAnchorRef.current === null) el.scrollTop += delta;
      });
      prevTopRef.current = el.scrollTop;
      return;
    }
    const turnCount = chat.turns.length;
    const forced = turnCount > turnCountRef.current;
    turnCountRef.current = turnCount;
    if (forced) {
      scrollToBottom('smooth');
      return;
    }
    if (attachedRef.current) scrollToBottom();
  }, [chat, scrollToBottom]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    attachedRef.current = getLiveFollowAttached(
      attachedRef.current,
      prevTopRef.current,
      el.scrollTop,
      el.clientHeight,
      el.scrollHeight,
    );
    prevTopRef.current = el.scrollTop;
    if (
      el.scrollTop < AUTO_LOAD_THRESHOLD_PX &&
      hasOlder &&
      !loadingOlder &&
      onLoadOlder !== undefined &&
      pendingAnchorRef.current === null
    ) {
      requestOlder();
    }
  }, [hasOlder, loadingOlder, onLoadOlder, requestOlder]);

  const showJump =
    scrollRef.current !== null &&
    shouldShowScrollToLatest(
      scrollRef.current.scrollTop,
      scrollRef.current.clientHeight,
      scrollRef.current.scrollHeight,
    );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin mask-fade-top absolute inset-0 overflow-y-auto [overflow-anchor:none]"
        aria-live="polite"
      >
        <div className="mx-auto flex w-(--chat-w) max-w-full flex-col gap-7 px-5 pt-6 pb-4">
          {(hasOlder || loadingOlder) && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={requestOlder}
                disabled={loadingOlder}
                className={cn(
                  'sq bg-surface-side px-3 py-1.5 text-[11.5px] text-fg-subtle hover:bg-hover hover:text-fg',
                  loadingOlder && 'opacity-60',
                )}
              >
                {loadingOlder ? '加载中…' : '加载更早的消息'}
              </button>
            </div>
          )}
          {chat.turns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2.5">
              {turn.orphan !== true && <UserBubble turn={turn} />}
              <AssistantTurn turn={turn} streaming={chat.streaming} />
            </div>
          ))}
        </div>
      </div>
      {showJump && (
        <button
          type="button"
          aria-label="回到底部"
          onClick={() => scrollToBottom('smooth')}
          className={cn(
            'sq elev-soft-sm absolute bottom-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center',
            'bg-menu text-fg-muted backdrop-blur-[40px] hover:text-fg',
          )}
        >
          ↓
        </button>
      )}
    </div>
  );
}
