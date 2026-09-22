/** 本地偏好：文件夹空间（workspace.ts 管）之外的界面偏好 */

export const CWD_STORAGE_KEY = 'piboat.cwd';
export const SIDEBAR_STORAGE_KEY = 'piboat.sidebar';

/** 侧栏宽度上下限（原型 `makeDrag("dragL","--sb-w",200,440)`） */
export const SIDEBAR_MIN_PX = 200;
export const SIDEBAR_MAX_PX = 440;
export const SIDEBAR_DEFAULT_PX = 284;

export function readStoredCwd(): string {
  try {
    return window.localStorage.getItem(CWD_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeCwd(cwd: string): void {
  try {
    window.localStorage.setItem(CWD_STORAGE_KEY, cwd);
  } catch {
    // 隐私模式等场景下 localStorage 不可用：忽略（不阻塞建会话）
  }
}

/** 字符串级校验（存在性由 core 校验，docs/06 §11.3 行 1）：非空 + 绝对路径 */
export function isAbsolutePath(value: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/)/.test(value.trim());
}

export interface SidebarPref {
  collapsed: boolean;
  width: number;
}

export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_DEFAULT_PX;
  return Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, Math.round(px)));
}

/** 侧栏折叠态与宽度（原型未持久化宽度，docs/06 §8.5 要求统一持久化） */
export function readStoredSidebar(): SidebarPref {
  const fallback: SidebarPref = { collapsed: false, width: SIDEBAR_DEFAULT_PX };
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    const value = parsed as Partial<SidebarPref>;
    return {
      collapsed: value.collapsed === true,
      width: clampSidebarWidth(value.width ?? SIDEBAR_DEFAULT_PX),
    };
  } catch {
    return fallback;
  }
}

export function storeSidebar(pref: SidebarPref): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // best-effort
  }
}
