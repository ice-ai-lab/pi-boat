import { type ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '../lib/cn';

/**
 * 浮层（docs/06 §4.1）：原型 `.pop` / `#wsMenu` / `#modeMenu` 四处同一交互——
 * 锚点定位、点外部 / Esc / `[data-x]` 三路关闭。
 *
 * 无障碍（docs/06 §9.2）：`role="dialog"` + `aria-expanded` 触发器 + Esc 收起。
 * 焦点陷阱留给 M2（M1 面板内无可聚焦交互元素的表单）。
 */
export interface PopoverProps {
  /** 触发器：闭包拿到 open 状态与 toggle */
  trigger: (state: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** 浮层宽度（px） */
  width?: number;
  align?: 'left' | 'right';
  className?: string;
  /** 浮层内容区类名（默认 `p-3.5`）；菜单形态需要更紧的内边距时覆盖 */
  bodyClassName?: string;
  /** 浮层标题（可选，渲染 .pop-head） */
  header?: ReactNode;
  /** mode-menu 形态：贴在触发上方 */
  placement?: 'bottom' | 'top';
}

export function Popover({
  trigger,
  open,
  onOpenChange,
  children,
  width = 360,
  align = 'left',
  className,
  bodyClassName,
  header,
  placement = 'bottom',
}: PopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (rootRef.current?.contains(event.target as Node) === true) return;
      if (target?.closest('[data-x]') !== null) return;
      onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, id: panelId, toggle: () => onOpenChange(!open) })}
      {open ? (
        <div
          id={panelId}
          role="dialog"
          className={cn(
            'pop-surface glass absolute z-50 flex max-h-[min(72dvh,680px)] flex-col overflow-hidden rounded-[14px] shadow-panel',
            placement === 'bottom' ? 'top-[calc(100%+8px)]' : 'bottom-[calc(100%+6px)]',
            align === 'left' ? 'left-0' : 'right-0',
            className,
          )}
          style={{ width }}
        >
          {header === undefined ? null : (
            <>
              <div className="flex flex-none items-center gap-2 px-4 py-3 text-[13px] font-semibold">
                {header}
                <button
                  type="button"
                  data-x
                  aria-label="收起"
                  onClick={() => onOpenChange(false)}
                  className="ml-auto inline-flex size-6 items-center justify-center rounded-[7px] text-fg-faint hover:bg-hover hover:text-fg"
                >
                  ✕
                </button>
              </div>
              <div className="h-[0.5px] flex-none bg-line-2" />
            </>
          )}
          <div className={cn('min-h-0 overflow-y-auto p-3.5 scrollbar-thin', bodyClassName)}>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
