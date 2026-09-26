/**
 * 工作区记忆（A 类按设计规范 lib/workspace-memory.ts）：按工作区记住上次打开的会话。
 * 工作区键用服务端给的 projectKey（Windows 路径变体与同一仓库的 worktree 共享一个槽位）。
 * localStorage，best-effort（不可用时静默忽略）。
 */
const STORAGE_KEY = 'piboat:last-open-by-workspace';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMap(storage: StorageLike): Record<string, string | undefined> {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string | undefined>)
      : {};
  } catch {
    return {};
  }
}

export function getLastOpenSession(
  workspaceKey: string,
  storage: StorageLike | null = getBrowserStorage(),
): string | null {
  if (storage === null) return null;
  try {
    const id = readMap(storage)[workspaceKey];
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function setLastOpenSession(
  workspaceKey: string,
  sessionId: string,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (storage === null) return;
  try {
    const map = readMap(storage);
    map[workspaceKey] = sessionId;
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 存储不可用：best-effort
  }
}

/** 上次使用的 cwd（新建会话预填，ADR-0019-4 的 startup-preferences） */
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
    // 同上
  }
}
