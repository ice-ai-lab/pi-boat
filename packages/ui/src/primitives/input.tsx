import type { InputHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/** Input（primitives）：单行输入，规格取自原型 .ws-line / 搜索框 */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'sq hairline h-8 w-full border-line-2 bg-surface-raised px-2.5 text-[12.5px] text-fg',
        'outline-none placeholder:text-fg-faint focus:border-accent/60',
        className,
      )}
      {...rest}
    />
  );
}
