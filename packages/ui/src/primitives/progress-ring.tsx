import { cn } from '../lib/cn';

/** `.ring` + `#ctxRing`：stroke-dasharray 数学在组件内收口（原型 svg 规格 36×36 / r=15.5） */
export interface ProgressRingProps {
  /** 0–100（超出裁剪） */
  value: number;
  className?: string;
  'aria-label'?: string;
}

export function ProgressRing({ value, className, ...rest }: ProgressRingProps) {
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      viewBox="0 0 36 36"
      className={cn('ring', className)}
      role="img"
      aria-label={rest['aria-label'] ?? `上下文占用 ${Math.round(clamped)}%`}
    >
      <circle className="bg" cx="18" cy="18" r={radius} fill="none" strokeWidth="3.6" />
      <circle
        className="fg"
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeDasharray={circumference.toFixed(1)}
        strokeDashoffset={offset.toFixed(1)}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
