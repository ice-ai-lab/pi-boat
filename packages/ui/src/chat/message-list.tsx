import type { Turn } from '@ice-ai/client';
import type { ReactNode, RefObject } from 'react';
import { useAutoScroll } from '../hooks/use-auto-scroll';
import { cn } from '../lib/cn';
import { AssistantTurn } from './assistant-turn';
import { ScrollToBottomButton } from './scroll-to-bottom-button';
import type { SessionStatsDisplay } from './usage-line';
import { UserBubble } from './user-bubble';

/**
 * 对话列表（原型 `.conv-scroll` 滚动容器 + `.conv` 内容列 + `.turn` 轮容器）。
 *
 * - 滚动吸附模型在 `useAutoScroll`（贴底 8px / 重吸 96px / 上滚即脱离）
 * - 内容宽度走 CSS 变量 `--chat-w`（原型 `publishChatW()` 维护）
 * - 插槽：`header`（顶部 dock）、`footer`（列表末尾的统计/提示）
 * - `viewportRef` / `contentRef` 可外部传入，供 minimap 与宽度把手共享同一节点
 */
export interface MessageListProps {
  turns: Turn[];
  /** 末轮仍在流式（方案 2 的 isLiveTail） */
  liveTail?: boolean;
  /** 思考档位展示（透传 AssistantTurn → `.mline`） */
  thinkingLabel?: string;
  /** 流式徽标数据（缓存 / 速度；透传 AssistantTurn） */
  liveStats?: SessionStatsDisplay;
  /** 滚到顶部时触发历史加载（M2 分页） */
  onReachTop?: () => void;
  /** 变化即强制回底（instant）——自己发出消息时用 */
  forceScrollSignal?: unknown;
  header?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
  className?: string;
  viewportRef?: RefObject<HTMLDivElement | null>;
  contentRef?: RefObject<HTMLDivElement | null>;
}

export function MessageList({
  turns,
  liveTail = false,
  thinkingLabel,
  liveStats,
  onReachTop,
  forceScrollSignal,
  header,
  footer,
  empty,
  className,
  viewportRef,
  contentRef,
}: MessageListProps) {
  const lastTurn = turns[turns.length - 1];
  const revision = `${turns.length}:${lastTurn?.trail.length ?? 0}:${lastTurn?.final?.markdown.length ?? 0}:${liveTail}`;
  const auto = useAutoScroll({
    revision: `${revision}:${String(forceScrollSignal)}`,
    ...(viewportRef === undefined ? {} : { viewportRef }),
  });

  if (turns.length === 0 && empty !== undefined) {
    return (
      <div
        className={cn('conv-scroll', className)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {empty}
      </div>
    );
  }

  return (
    <>
      <div
        ref={auto.viewportRef}
        className={cn('conv-scroll', className)}
        onScroll={() => {
          auto.onScroll();
          const el = auto.viewportRef.current;
          if (el !== null && onReachTop !== undefined && el.scrollTop <= 24) onReachTop();
        }}
      >
        <div className="conv" ref={contentRef}>
          {header}
          {turns.map((turn, index) => (
            <section className="turn" key={turn.id} data-turn-id={turn.id}>
              <UserBubble turn={turn} />
              <AssistantTurn
                turn={turn}
                liveTail={liveTail && index === turns.length - 1}
                thinkingLabel={thinkingLabel}
                liveStats={liveStats}
              />
            </section>
          ))}
          {footer}
        </div>
      </div>
      <ScrollToBottomButton
        visible={auto.showScrollToBottom}
        onClick={() => auto.scrollToBottom('smooth')}
      />
    </>
  );
}
