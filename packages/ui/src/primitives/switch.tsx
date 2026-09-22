import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** `.switch[data-tool]`（docs/06 §4.1） */
export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'role'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
}

export function Switch({ checked, onCheckedChange, label, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative h-[17px] w-[30px] flex-none cursor-pointer rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-line-3',
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          'absolute top-[2.5px] size-3 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] duration-150',
          checked ? 'left-[15.5px]' : 'left-[2.5px]',
        )}
      />
    </button>
  );
}
