import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * 提示（docs/06 §4.1）：原型用 `title` 属性 + `.mm-tip`。
 * M1 只做原生的 `title`（无 JS 定位）；需要富内容提示时在 M2 按 `.mm-tip` 补齐。
 */
export interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span title={content} className={cn('inline-flex', className)}>
      {children}
    </span>
  );
}
