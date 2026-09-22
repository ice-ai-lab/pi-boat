import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 空状态 / hero（原型 `.hero`：浮动帆船 + 标题 + 插槽 + 版本脚注）。
 * M1 用它承载 cwd 输入（docs/06 §11.3 行 1）：路径输入 → `POST /api/agent/new`
 * → 成功后 cwd 转只读展示（`.ws-line`）。窄屏门禁也复用它（§9.1）。
 */
export interface EmptyStateProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  cwd?: string | null;
  version?: string;
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
    <div
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center pb-[6dvh]',
        className,
      )}
    >
      <Icon
        name="boat"
        size={52}
        className={cn(
          'text-accent',
          inertBoat ? undefined : 'motion-safe:animate-[pi-float_3s_ease-in-out_infinite]',
        )}
      />
      <h2 className="mt-[18px] text-[26px] font-medium leading-8 tracking-[0.02em]">{title}</h2>
      {subtitle === undefined ? null : (
        <p className="mt-2 text-[13px] text-fg-subtle">{subtitle}</p>
      )}
      {children === undefined ? null : (
        <div className="mt-[26px] w-[min(680px,92vw)]">{children}</div>
      )}
      {cwd === null || cwd === undefined ? null : (
        <div className="mt-4 flex items-center gap-1.5 text-[12px] text-fg-faint">
          <Icon name="folder" size={14} />
          当前空间
          <span className="font-mono text-fg-muted">{cwd}</span>
        </div>
      )}
      {version === undefined ? null : (
        <div className="absolute bottom-3.5 right-6 text-right text-[11px] leading-4 text-fg-faint">
          {version}
        </div>
      )}
      <style>
        {
          '@keyframes pi-float{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-7px) rotate(2deg)}}'
        }
      </style>
    </div>
  );
}
