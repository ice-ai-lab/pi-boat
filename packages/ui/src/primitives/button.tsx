import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/**
 * Button（docs/06 §4.1）：收敛原型 11 个按钮类（.new-session/.send-btn/.cbtn/.hchip/
 * .model-btn/.mode-chip/.dtab/.spill/.wi/.mi/.vtab）为 5 个语义档。
 * 变体名是稳定 API；像素级视觉随 F1 消费方对齐原型。
 */
export const buttonStyles = cva(
  'sq inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white hover:bg-accent/90',
        ghost: 'text-fg-muted hover:bg-hover hover:text-fg',
        chip: 'hairline border-line-2 bg-surface-side text-fg-muted hover:bg-hover hover:text-fg',
        pill: 'rounded-full bg-accent-weak text-accent hover:bg-accent/15',
        'menu-item': 'w-full justify-start text-fg-muted hover:bg-hover hover:text-fg',
      },
      size: {
        sm: 'h-7 px-2 text-xs',
        md: 'h-8 px-3 text-[13px]',
        lg: 'h-9 px-4 text-sm',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export function Button({ className, variant, size, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...rest} />
  );
}
