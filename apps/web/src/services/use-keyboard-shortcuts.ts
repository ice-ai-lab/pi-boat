import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// 模块级注册表 —— ChatPane 在这里登记 abort 处理器，让全局 Esc 监听器无需逐层透传。
// 逐字移植 pi-web `hooks/useKeyboardShortcuts.ts`（T1-9 / S10）。
// ---------------------------------------------------------------------------
let globalAbortHandler: (() => void) | null = null;

/**
 * 登记（或清除）全局 Esc 快捷键的 abort 处理器。
 * ChatPane 在 agentRunning / abort 变化时调用。
 */
export function registerAbortHandler(handler: (() => void) | null): void {
  globalAbortHandler = handler;
}

// ---------------------------------------------------------------------------
// Hook：全局快捷键
// ---------------------------------------------------------------------------

interface UseGlobalKeyboardShortcutsOptions {
  /** Ctrl+Alt+N 时回调，参数为当前 cwd */
  onNewSession?: (cwd: string) => void;
  /** 当前选中的项目目录（侧栏 cwd） */
  activeCwd?: string | null;
}

/**
 * 注册全局快捷键（pi-web 同款）：
 *   Esc          —— 停止运行中的 agent（经模块级 abort 处理器）
 *   Ctrl+Alt+N   —— 在当前项目目录新建会话
 *
 * 注意：`<textarea>` / `<input>` 内的 Esc 刻意不在这里处理——
 * Composer 自己管理 Esc 逻辑（关斜杠 / @ 菜单、无菜单时停止），因为它需要菜单状态。
 */
export function useGlobalKeyboardShortcuts(options: UseGlobalKeyboardShortcutsOptions): void {
  const { onNewSession, activeCwd } = options;

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // ---- Esc: 停止 agent ----
      if (e.key === 'Escape') {
        if (!globalAbortHandler) return;

        const tag = (e.target as HTMLElement)?.tagName;
        // textarea/input 内的 Esc 交给组件内部处理（Composer 菜单 / 停止）
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;

        e.preventDefault();
        globalAbortHandler();
        return;
      }

      // ---- Ctrl+Alt+N: 新建会话 ----
      if (e.key === 'n' && e.ctrlKey && e.altKey) {
        if (!activeCwd || !onNewSession) return;
        e.preventDefault();
        onNewSession(activeCwd);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCwd, onNewSession]);
}
