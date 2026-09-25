import { useEffect } from 'react';

/**
 * 全局快捷键（F5，最小集）：只做「不与输入框冲突」的组合。
 * - ⌘/Ctrl+Enter 之外的 Enter 归 Composer；这里只处理带修饰键的
 * - ⌘/Ctrl+B 折叠侧栏、⌘/Ctrl+J 统计面板、⌘/Ctrl+K 焦点输入框、Esc 关浮层（组件自管）
 */
export interface ShortcutHandlers {
  onToggleSidebar(): void;
  onToggleStats(): void;
  onFocusComposer(): void;
  onOpenSettings(): void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          handlers.onToggleSidebar();
          return;
        case 'j':
          event.preventDefault();
          handlers.onToggleStats();
          return;
        case 'k':
          event.preventDefault();
          handlers.onFocusComposer();
          return;
        case ',':
          event.preventDefault();
          handlers.onOpenSettings();
          return;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
