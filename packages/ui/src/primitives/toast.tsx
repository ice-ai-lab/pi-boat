import { cn } from '../utils/cn';

/** Toast 项（docs/06 §4.1：底部居中、队列化，原型 .toast + toast()） */
export interface ToastItem {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'error';
}

/** 同屏上限（按设计规范 Notice 的 MAX_NOTICES=5；更旧的被挤掉） */
export const TOAST_MAX_VISIBLE = 5;

export type ToastAction = { type: 'add'; toast: ToastItem } | { type: 'dismiss'; id: string };

/** 队列 reducer —— 纯函数，宿主（useReducer）与测试共用 */
export function toastQueueReducer(queue: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case 'add': {
      const next = [...queue, action.toast];
      return next.length > TOAST_MAX_VISIBLE ? next.slice(next.length - TOAST_MAX_VISIBLE) : next;
    }
    case 'dismiss':
      return queue.filter((toast) => toast.id !== action.id);
  }
}

const TONE_CLASS: Record<NonNullable<ToastItem['tone']>, string> = {
  info: 'text-fg',
  success: 'text-success',
  error: 'text-danger',
};

/** 渲染层：宿主持队列状态并负责过期 dismiss，本组件只吃 items */
export function ToastHost({ items }: { items: ToastItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-99 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            'toast-enter sq elev-panel bg-menu px-4 py-2 text-xs backdrop-blur-[40px]',
            TONE_CLASS[toast.tone ?? 'info'],
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
