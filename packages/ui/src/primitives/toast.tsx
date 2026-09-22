import { cn } from '../lib/cn';

/** `.toast`（docs/06 §4.1）：底部居中浮层；队列化由宿主维护（M1 单条足够） */
export interface ToastProps {
  message: string | null;
  className?: string;
}

export function Toast({ message, className }: ToastProps) {
  if (message === null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'glass fixed bottom-[110px] left-1/2 z-[99] -translate-x-1/2 rounded-xl px-4 py-2 text-[12px] text-fg shadow-panel pointer-events-none',
        className,
      )}
    >
      {message}
    </div>
  );
}
