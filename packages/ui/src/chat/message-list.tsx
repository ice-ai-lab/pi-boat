import type { Turn } from '@ice-ai/client';
import type { ReactNode } from 'react';
import { useAutoScroll } from '../hooks/use-auto-scroll';
import { cn } from '../lib/cn';
import { ScrollArea } from '../primitives/scroll-area';
import { AssistantTurn } from './assistant-turn';
import { ScrollToBottomButton } from './scroll-to-bottom-button';
import { UserBubble } from './user-bubble';

/**
 * 对话列表（原型 `.scrollbody` + `.chat-col`，docs/06 §4.2/§8.2）。
 *
 * - 滚动吸附模型在 `useAutoScroll`（贴底 8px / 重吸 96px / 上滚即脱离）
 * - 「回到底部」按钮由本组件渲染（悬于列表底部，视觉上正好在 composer 上方）
 * - 内容宽度走 CSS 变量 `--chat-w`（不把固定宽度当硬前提，docs/06 §9.1）
 * - 插槽：`header`（顶部 dock）、`footer`（列表末尾的统计/提示）
 */
export interface MessageListProps {
  turns: Turn[];
  /** 末轮仍在流式（方案 2 的 isLiveTail） */
  liveTail?: boolean;
  /** 滚到顶部时触发历史加载（M2 分页） */
  onReachTop?: () => void;
  /** 变化即强制回底（instant）——自己发出消息时用 */
  forceScrollSignal?: unknown;
  header?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
  className?: string;
}

export function MessageList({
  turns,
  liveTail = false,
  onReachTop,
  forceScrollSignal,
  header,
  footer,
  empty,
  className,
}: MessageListProps) {
  const lastTurn = turns[turns.length - 1];
  const revision = `${turns.length}:${lastTurn?.trail.length ?? 0}:${lastTurn?.final?.markdown.length ?? 0}:${liveTail}`;
  const { viewportRef, showScrollToBottom, onScroll, scrollToBottom } = useAutoScroll({
    revision: `${revision}:${String(forceScrollSignal)}`,
  });

  if (turns.length === 0 && empty !== undefined) {
    return <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>{empty}</div>;
  }

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      <ScrollArea
        mask="top"
        viewportRef={viewportRef}
        onScroll={() => {
          onScroll();
          const el = viewportRef.current;
          if (el !== null && onReachTop !== undefined && el.scrollTop <= 24) onReachTop();
        }}
      >
        <div
          className="mx-auto flex w-full flex-col gap-[18px] px-6 pb-2 pt-5"
          style={{ maxWidth: 'var(--chat-w, 760px)' }}
        >
          {header}
          {turns.map((turn, index) => (
            <div key={turn.id} className="flex flex-col gap-[18px]">
              <UserBubble turn={turn} />
              <AssistantTurn turn={turn} liveTail={liveTail && index === turns.length - 1} />
            </div>
          ))}
          {footer}
        </div>
      </ScrollArea>
      <ScrollToBottomButton visible={showScrollToBottom} onClick={() => scrollToBottom('smooth')} />
    </div>
  );
}
