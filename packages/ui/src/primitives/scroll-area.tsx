import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * 滚动区（docs/06 §4.1）：细滚动条（.scrollbar-thin）+ 顶部渐隐 mask。
 * 高度/滚动位置由宿主控制（MessageList 用 ref 做吸附模型）。
 */
export interface ScrollAreaProps {
  children: ReactNode;
  /** 顶部 16px 渐隐（原型 .scrollbody） */
  mask?: 'top';
  className?: string;
  viewportRef?: React.Ref<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  'aria-live'?: 'polite' | 'off';
}

export function ScrollArea({
  children,
  mask,
  className,
  viewportRef,
  onScroll,
  ...rest
}: ScrollAreaProps) {
  return (
    <div
      ref={viewportRef}
      onScroll={onScroll}
      className={cn(
        'scrollbar-thin relative min-h-0 flex-1 overflow-y-auto',
        mask === 'top' && 'mask-fade-top',
        className,
      )}
      aria-live={rest['aria-live']}
    >
      {children}
    </div>
  );
}
