import { cn } from '../lib/cn';

/** `.chip` / `.chip.act`（原型系统提示词浮层里的统计胶囊） */
export interface ChipProps {
  children: React.ReactNode;
  /** 可点击（`.chip.act`） */
  onClick?: () => void;
  title?: string;
  className?: string;
}

export function Chip({ children, onClick, title, className }: ChipProps) {
  if (onClick === undefined) {
    return (
      <span className={cn('chip', className)} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} title={title} className={cn('chip act', className)}>
      {children}
    </button>
  );
}
