import { cn } from '../lib/cn';

/** `.chip` / `.spill` / `.hchip`（docs/06 §4.1） */
export interface ChipProps {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'success' | 'teal';
  /** 可点击（.chip.act） */
  onClick?: () => void;
  title?: string;
  className?: string;
}

const TONES: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'bg-hover text-fg-muted',
  accent: 'bg-accent-weak text-accent',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  teal: 'bg-teal-soft text-teal',
};

export function Chip({ children, tone = 'neutral', onClick, title, className }: ChipProps) {
  const base = cn(
    'inline-flex h-[22px] items-center gap-1 rounded-[7px] px-2 text-[11px] tabular-nums',
    TONES[tone],
    className,
  );
  if (onClick === undefined) {
    return (
      <span className={base} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(base, 'transition-colors hover:text-fg')}
    >
      {children}
    </button>
  );
}
