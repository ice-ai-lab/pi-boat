import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import styles from './trail.module.css';

/** 轨迹行折叠箭头（原型 `svg.chev`）：折叠指右，展开转 90° 指下 */
export function TrailChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.discChev}
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <polyline points="4.5 2.5 8 6 4.5 9.5" />
    </svg>
  );
}

/**
 * 药丸色签（原型 `.tag`）：默认灰底（思考行），`tone` 传色板类（工具名→色，docs/06 §7）。
 * `mono` 供工具名用等宽字。
 */
export function TrailTag({
  tone,
  mono = false,
  pulse = false,
  icon,
  children,
}: {
  tone?: string;
  mono?: boolean;
  pulse?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={cn(styles.tag, mono && styles.tagMono, tone, pulse && 'animate-pulse')}>
      {icon}
      {children}
    </span>
  );
}
