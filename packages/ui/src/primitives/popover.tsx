import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon, type IconName } from './icon';

/**
 * 头部浮层（原型 `.pop` / `.pop-head` / `.pop-rule` / `.pop-body`）。
 *
 * 四个锚定浮层（系统 / 工具 / 统计）共用同一交互：绝对定位于 `.tools-bar`（position:relative），
 * 点外 / Esc / `.pop-x` 三路关闭。受控组件：开关状态由宿主持有。
 */
export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: IconName;
  title: string;
  /** `.pop-head` 右侧的灰字（如「8 个工具 · 约 8.1K tokens」） */
  sub?: ReactNode;
  /** 原型：系统/工具 560px，统计 680px */
  width?: number;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Popover({
  open,
  onOpenChange,
  icon,
  title,
  sub,
  width = 560,
  children,
  className,
  bodyClassName,
}: PopoverProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label={title} className={cn('pop', className)} style={{ width }}>
      <div className="pop-head">
        <Icon name={icon} size={14} />
        {title}
        {sub === undefined ? null : <span className="pop-sub">{sub}</span>}
        <button
          type="button"
          data-x
          className="pop-x"
          aria-label="收起"
          onClick={() => onOpenChange(false)}
        >
          <Icon name="chev-d" size={14} />
        </button>
      </div>
      <div className="pop-rule" />
      <div className={cn('pop-body', bodyClassName)}>{children}</div>
    </div>
  );
}
