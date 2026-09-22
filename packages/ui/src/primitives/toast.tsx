import { cn } from '../lib/cn';

/** `.toast`（原型底部居中毛玻璃浮层）；队列化由宿主维护 */
export interface ToastProps {
  message: string | null;
  className?: string;
}

export function Toast({ message, className }: ToastProps) {
  if (message === null) return null;
  return (
    <div role="status" aria-live="polite" className={cn('toast', className)}>
      {message}
    </div>
  );
}
