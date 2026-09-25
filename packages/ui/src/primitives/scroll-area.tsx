import type { HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/** ScrollArea（docs/06 §4.1）：细滚动条 + 可选顶部渐隐（原型 .scrollbody 的 mask） */
export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** 顶部渐隐 mask（消息流滚动体用） */
  mask?: 'top';
}

export function ScrollArea({ mask, className, ...rest }: ScrollAreaProps) {
  return (
    <div
      className={cn('scrollbar-thin overflow-y-auto', mask === 'top' && 'mask-fade-top', className)}
      {...rest}
    />
  );
}
