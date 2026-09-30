/**
 * 工作区记忆（A 类按设计规范 lib/workspace-memory.ts）：记住上次使用的 cwd，
 * 新建会话时预填（ADR-0019-4 的 startup-preferences）。localStorage，best-effort。
 */
const LAST_CWD_KEY = 'piboat:last-cwd';

export function getLastCwd(): string {
  try {
    return window.localStorage.getItem(LAST_CWD_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setLastCwd(cwd: string): void {
  try {
    window.localStorage.setItem(LAST_CWD_KEY, cwd);
  } catch {
    // 存储不可用：best-effort
  }
}
