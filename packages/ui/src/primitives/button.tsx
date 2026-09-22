import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon, type IconName } from './icon';

/**
 * 按钮（docs/06 §4.1）：收敛原型 11 个变体——`.new-session` `.send-btn` `.cbtn`
 * `.hchip` `.model-btn` `.mode-chip` `.dtab` `.spill` `.wi` `.mi` `.vtab`。
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 select-none transition-colors disabled:opacity-40 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        /** .new-session：白底 + 0.5px 环 + panel 阴影 */
        primary:
          'h-[38px] rounded-xl bg-surface-raised elev-panel hairline border-line-3 text-[13px] font-medium hover:bg-hover',
        /** .send-btn：业务蓝实心圆 */
        send: 'size-[34px] rounded-full bg-accent text-white hover:scale-105',
        /** .cbtn：输入卡内的裸图标按钮 */
        ghost: 'size-7 rounded-full text-fg-subtle hover:bg-hover hover:text-fg',
        /** .hchip / .dtab / .model-btn / .mode-chip：头部胶囊 */
        chip: 'h-7 px-2.5 rounded-lg text-[12px] font-medium text-fg-muted hover:bg-hover hover:text-fg',
        /** .spill / .chip：footer 统计胶囊 */
        pill: 'h-[26px] px-1.5 rounded-full text-[11.5px] tabular-nums text-fg-subtle hover:bg-hover hover:text-fg',
        /** .mi / .wi：浮层里的整宽菜单项 */
        menuItem:
          'w-full justify-between px-2.5 py-1.5 rounded-lg text-[13px] text-fg hover:bg-hover',
        /** .vtab：顶部视图页签 */
        tab: 'h-full px-0.5 text-[13px] font-medium text-fg-subtle hover:text-fg',
      },
      size: {
        sm: 'h-6 text-[11px]',
        md: '',
        lg: 'h-9',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<VariantProps<typeof buttonVariants>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconSize?: number;
  children?: ReactNode;
}

export function Button({
  variant,
  size,
  icon,
  iconSize,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...rest}>
      {icon === undefined ? null : <Icon name={icon} size={iconSize ?? 14} />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** 无障碍要求：图标按钮一律有可读名（docs/06 §9.2） */
  title: string;
  on?: boolean;
  iconSize?: number;
}

/** `.icon-btn`（原型约 20 处）：28px 方形、hover 底、`on` 态转 accent */
export function IconButton({
  icon,
  title,
  on = false,
  iconSize = 16,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      className={cn(
        'inline-flex size-7 flex-none items-center justify-center rounded-lg transition-colors',
        on ? 'bg-accent-weak text-accent' : 'text-fg-subtle hover:bg-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
