import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

/** IconButton（docs/06 §4.1）：原型 .icon-btn——方形、悬停浮底、`on` 为激活态 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** 激活态（同步下发 aria-pressed） */
  on?: boolean;
}

export function IconButton({
  icon,
  on,
  className,
  title,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={title}
      aria-label={title}
      aria-pressed={on}
      className={cn(
        'sq inline-flex h-8 w-8 items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
        on ? 'bg-accent-weak text-accent' : 'text-fg-subtle hover:bg-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
