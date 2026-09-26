import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '../utils/cn';

/**
 * Popover（docs/06 §4.1）：锚点浮层（原型 .pop / #wsMenu / #modeMenu）。
 * 受控组件：open / onOpenChange 归调用方；三路关闭 = 点外 / Esc / `[data-x]`（docs/06 §8.6）。
 */
export interface PopoverProps {
  trigger: ReactNode;
  /** 触发器无障碍名（icon/复合触发器必传；纯文本触发器可省） */
  triggerLabel?: string;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'start' | 'end' | 'center';
  /** 浮层定宽（px）；不传随内容 */
  width?: number;
}

/** 点击目标是否命中关闭条件（容器外，或容器内带 `[data-x]` 的元素）——纯函数，供测试 */
export function isDismissTarget(target: Element | null, container: HTMLElement | null): boolean {
  if (!target) return false;
  if (container?.contains(target)) return target.closest('[data-x]') !== null;
  return true;
}

export function Popover({
  trigger,
  triggerLabel,
  children,
  open,
  onOpenChange,
  align = 'start',
  width,
}: PopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (isDismissTarget(e.target as Element | null, containerRef.current)) onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-label={triggerLabel}
        className="inline-flex cursor-pointer items-center"
        onClick={() => onOpenChange(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="dialog"
          className={cn(
            'absolute top-[calc(100%+4px)] z-99 overflow-hidden rounded-[8px] border border-border bg-bg p-1',
            align === 'start' && 'left-0',
            align === 'end' && 'right-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
          )}
          style={{
            boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
            ...(width === undefined ? {} : { width: `${width}px` }),
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
