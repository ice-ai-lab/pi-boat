import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';

/** IconButton（primitives）：32px 方形图标按钮（pi-web 工具条/页头同款：hover 浮底、激活 `--bg-selected`） */
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
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] text-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
        on ? 'bg-bg-selected text-accent' : 'hover:bg-bg-hover hover:text-text',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
