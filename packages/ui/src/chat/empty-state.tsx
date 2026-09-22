import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 空状态 / hero（原型 `.hero`：浮动帆船 + 标题 + 插槽 + 当前空间 + 版本脚注）。
 * M1 用它承载新会话：路径输入（当没有可用的文件夹空间时）与首条消息。
 */
export interface EmptyStateProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  cwd?: string | null;
  version?: ReactNode;
  className?: string;
  inertBoat?: boolean;
}

export function EmptyState({
  title,
  subtitle,
  children,
  cwd,
  version,
  className,
  inertBoat = false,
}: EmptyStateProps) {
  return (
    <div className={cn('hero', className)}>
      <svg
        className={cn('boat', inertBoat && 'motion-reduce:animate-none')}
        aria-hidden="true"
        style={inertBoat ? { animation: 'none' } : undefined}
      >
        <use href="#i-boat" />
      </svg>
      <h2>{title}</h2>
      {subtitle === undefined ? null : <div className="sub">{subtitle}</div>}
      {children === undefined ? null : (
        <div className="hero-input" id="heroSlot">
          {children}
        </div>
      )}
      {cwd === null || cwd === undefined ? null : (
        <div className="ws-line">
          <Icon name="folder" size={14} />
          当前空间
          <span className="mono num">{cwd}</span>
        </div>
      )}
      {version === undefined ? null : <div className="ver num">{version}</div>}
    </div>
  );
}
