import { useState } from 'react';
import { cn } from '../utils/cn';

/**
 * ImagePreview（docs/06 §4.3）：自适应/原始尺寸切换 + 缩放。
 * 图片字节走 `/api/files/...?type=preview`（同源，<img> 直接消费）。
 */
export interface ImagePreviewProps {
  src: string;
  alt: string;
  className?: string;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3];

export function nextZoom(current: number, direction: 'in' | 'out'): number {
  const index = ZOOM_STEPS.findIndex((step) => step >= current - 1e-6);
  const clampedIndex = index === -1 ? ZOOM_STEPS.length - 1 : index;
  const nextIndex =
    direction === 'in'
      ? Math.min(clampedIndex + 1, ZOOM_STEPS.length - 1)
      : Math.max(clampedIndex - 1, 0);
  return ZOOM_STEPS[nextIndex] ?? 1;
}

export function ImagePreview({ src, alt, className }: ImagePreviewProps) {
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="hairline-b flex shrink-0 items-center gap-2 border-line-1 px-3 py-1.5 text-[11.5px]">
        <button
          type="button"
          onClick={() => setFit((previous) => !previous)}
          className="sq px-2 py-0.5 text-fg-subtle hover:bg-hover hover:text-fg"
        >
          {fit ? '原始尺寸' : '适应窗口'}
        </button>
        <button
          type="button"
          aria-label="缩小"
          onClick={() => {
            setFit(false);
            setZoom((previous) => nextZoom(previous, 'out'));
          }}
          className="sq h-6 w-6 text-fg-subtle hover:bg-hover hover:text-fg"
        >
          −
        </button>
        <span className="font-mono text-fg-faint">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="放大"
          onClick={() => {
            setFit(false);
            setZoom((previous) => nextZoom(previous, 'in'));
          }}
          className="sq h-6 w-6 text-fg-subtle hover:bg-hover hover:text-fg"
        >
          +
        </button>
      </div>
      <div className="scrollbar-thin flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        <img
          src={src}
          alt={alt}
          className={cn('sq', fit ? 'max-h-full max-w-full object-contain' : 'max-w-none')}
          style={fit ? undefined : { width: `${zoom * 100}%` }}
        />
      </div>
    </div>
  );
}
