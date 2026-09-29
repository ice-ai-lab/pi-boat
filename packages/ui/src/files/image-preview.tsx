import { useState } from 'react';
import styles from './image-preview.module.css';

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
    <div className={`${styles.root}${className === undefined ? '' : ` ${className}`}`}>
      <div className={styles.bar}>
        <button
          type="button"
          onClick={() => setFit((previous) => !previous)}
          className={styles.button}
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
          className={styles.iconButton}
        >
          −
        </button>
        <span className={styles.zoom}>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="放大"
          onClick={() => {
            setFit(false);
            setZoom((previous) => nextZoom(previous, 'in'));
          }}
          className={styles.iconButton}
        >
          +
        </button>
      </div>
      <div className={styles.stage}>
        <img
          src={src}
          alt={alt}
          className={styles.image}
          style={
            fit
              ? { maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }
              : { maxWidth: 'none', width: `${zoom * 100}%` }
          }
        />
      </div>
    </div>
  );
}
