import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/**
 * Button：收敛为 5 个语义档，视觉对齐 pi-web 的按钮族（ADR-0020）：
 * 主按钮 = accent 底 + `--accent-contrast` 字 + 8px 圆角；次按钮 = `--bg-hover` 底 + 1px 描边 + 7px 圆角；
 * ghost 无底无描边、hover 才浮底。变体名是稳定 API。
 */
export const buttonStyles = cva(
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'rounded-[8px] bg-accent text-accent-contrast hover:bg-accent-hover',
        ghost: 'rounded-[7px] text-text-muted hover:bg-bg-hover hover:text-text',
        chip: 'rounded-[7px] border border-border bg-bg-hover text-text-muted hover:bg-bg-selected hover:text-accent',
        pill: 'rounded-full bg-bg-selected px-2.5 py-0.5 text-[11px] text-text-muted hover:text-text',
        'menu-item':
          'w-full justify-start rounded-[5px] text-text-muted hover:bg-bg-hover hover:text-text',
      },
      size: {
        sm: 'h-7 px-2 text-[12px]',
        md: 'h-8 px-3 text-[12px]',
        lg: 'h-9 px-4 text-[13px]',
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
