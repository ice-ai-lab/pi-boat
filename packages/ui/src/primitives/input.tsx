import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/** Input（primitives）：视觉按设计规范的输入框（1px 描边 / 5px 圆角 / `--bg` 底） */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-[5px] border border-border bg-bg px-2 py-[5px] text-[11px] text-text',
        'outline-none placeholder:text-text-dim focus:border-accent',
        className,
      )}
      {...rest}
    />
  );
}
