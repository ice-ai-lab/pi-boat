import { Toast } from '@ice-ai/ui';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';

/**
 * toast 宿主（原型 `toast()`，docs/06 §4.1：ui 的 `Toast` 只渲染单条，队列化由宿主维护）。
 * M1 的提示源：重命名/删除结果、切换文件夹空间、复制系统提示词——都在浅层级，单条足够。
 */
const ToastContext = createContext<((message: string) => void) | null>(null);

const TOAST_MS = 2600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const push = useCallback((text: string) => {
    setMessage(text);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), TOAST_MS);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <Toast message={message} />
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string) => void {
  const push = useContext(ToastContext);
  if (push === null) throw new Error('useToast 必须在 ToastProvider 内使用');
  return push;
}
