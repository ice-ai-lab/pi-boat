import { cn } from '../lib/cn';

/** `.ring` + `#ctxRing`（docs/06 §4.1）：stroke-dasharray 数学在组件内收口 */
export interface ProgressRingProps {
  /** 0–100（超出裁剪） */
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
}

export function ProgressRing({
  value,
  size = 14,
  strokeWidth = 3.6,
  className,
  ...rest
}: ProgressRingProps) {
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      className={cn('flex-none', className)}
      role="img"
      aria-label={rest['aria-label'] ?? `上下文占用 ${Math.round(clamped)}%`}
    >
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-line-3"
      />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 18 18)"
        className="stroke-seg-msg transition-[stroke-dashoffset] duration-[400ms]"
      />
    </svg>
  );
}
