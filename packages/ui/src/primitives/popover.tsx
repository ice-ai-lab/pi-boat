import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon } from './icon';

/**
 * 头部浮层（原型 `.pop` / `.pop-head`(.pt/.px) / `.pop-body`）。
 *
 * 定位与宽度由原型 CSS 的 id 选择器提供：`.main` 为定位祖先（position:relative），
 * `#popSys` / `#popTools` 走 `position:absolute; top:52px; right:14px`，`#popStats` 左右居中。
 * 点外 / Esc / `.px`（`[data-x]`）三路关闭由宿主接线；受控组件，开关状态由宿主持有。
 */
export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 原型 id（#popSys / #popTools / #popStats）——宽度与定位靠它命中 CSS */
  id?: string;
  title: string;
  children: ReactNode;
  className?: string;
  /**
   * 包围 children 的容器类名。传 `null` 表示不加包裹层：`#popStats` 的
   * `.stat-grid` 与 `.ctx-row` 是 `.pop` 的平级子元素。
   */
  bodyClassName?: string | null;
}

export function Popover({
  open,
  onOpenChange,
  id,
  title,
  children,
  className,
  bodyClassName = 'pop-body',
}: PopoverProps) {
  return (
    <div
      id={id}
      role="dialog"
      aria-label={title}
      aria-hidden={!open}
      className={cn('pop', open && 'open', className)}
    >
      <div className="pop-head">
        <span className="pt">{title}</span>
        <button
          type="button"
          className="px"
          data-x
          aria-label="收起"
          onClick={() => onOpenChange(false)}
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      {bodyClassName === null ? children : <div className={bodyClassName}>{children}</div>}
    </div>
  );
}
