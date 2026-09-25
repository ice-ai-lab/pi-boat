import type { ChatState } from '@ice-ai/client';
import { useCallback, useEffect, useRef } from 'react';
import { cn } from '../utils/cn';
import { AssistantTurn, UserBubble } from './assistant-turn';

/**
 * MessageList（docs/06 §4.2 / §8.2）：吸附模型滚动——贴底 8px 吸附、上滚即脱离、
 * 重吸 96px；自己发消息强制回底。顶部历史加载触发点随 F2 分页接入。
 */
const TAIL_TOLERANCE = 8;
const REATTACH_TOLERANCE = 96;

/** 纯函数：是否贴底（供测试） */
export function isAtTail(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollTop + clientHeight >= scrollHeight - TAIL_TOLERANCE;
}

/** 纯函数：吸附状态推进（wasAttached + 上次/本次 scrollTop → 新吸附态） */
export function nextFollowAttached(
  wasAttached: boolean,
  prevTop: number,
  top: number,
  clientHeight: number,
  scrollHeight: number,
): boolean {
  if (top < prevTop) return false; // 向上滚：立即脱离
  if (isAtTail(top, clientHeight, scrollHeight)) return true; // 贴底：吸附
  if (!wasAttached && top + clientHeight >= scrollHeight - REATTACH_TOLERANCE) return true;
  return wasAttached;
}

export function MessageList({ chat }: { chat: ChatState }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachedRef = useRef(true);
  const prevTopRef = useRef(0);
  const turnCountRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    attachedRef.current = true;
  }, []);

  // 内容增长时：吸附则跟随；轮数变化（用户发了消息）强制回底
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
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
    attachedRef.current = nextFollowAttached(
      attachedRef.current,
      prevTopRef.current,
      el.scrollTop,
      el.clientHeight,
      el.scrollHeight,
    );
    prevTopRef.current = el.scrollTop;
  }, []);

  const showJump =
    scrollRef.current !== null &&
    !isAtTail(
      scrollRef.current.scrollTop,
      scrollRef.current.clientHeight,
      scrollRef.current.scrollHeight,
    );

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-thin mask-fade-top absolute inset-0 overflow-y-auto"
        aria-live="polite"
      >
        <div className="mx-auto flex w-(--chat-w) max-w-full flex-col gap-7 px-5 pt-6 pb-4">
          {chat.turns.map((turn) => (
            <div key={turn.id} className="flex flex-col gap-2.5">
              <UserBubble turn={turn} />
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
