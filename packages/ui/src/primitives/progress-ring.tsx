import { cn } from '../lib/cn';

/** `.ring`（`.bgc` 轨道 / `.fgc` 进度）：stroke-dasharray 数学在组件内收口
 *（原型 svg 规格 16×16 / r=6 / 周长 37.7，见原型 `.metrics` 与 `.stats` 两处）。
 * 旋转 -90° 由宿主上下文的 CSS 提供（`.metrics .ring` / `.stats .ring`，原型同款）。 */
export interface ProgressRingProps {
  /** 0–100（超出裁剪） */
  value: number;
  className?: string;
  'aria-label'?: string;
}

export function ProgressRing({ value, className, ...rest }: ProgressRingProps) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('ring', className)}
      role="img"
      aria-label={rest['aria-label'] ?? `上下文占用 ${Math.round(clamped)}%`}
    >
      <circle className="bgc" cx="8" cy="8" r={radius} fill="none" />
      <circle
        className="fgc"
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        strokeDasharray={circumference.toFixed(1)}
        strokeDashoffset={offset.toFixed(1)}
      />
    </svg>
  );
}
