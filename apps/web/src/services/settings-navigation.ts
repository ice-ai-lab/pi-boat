/**
 * 设置节的导航记忆（A 类按设计规范 lib/settings-navigation.ts 的简化版）：
 * 关掉浮层再打开时回到上次那一节。localStorage，best-effort。
 */
const STORAGE_KEY = 'piboat:settings-navigation';

export const SETTINGS_SECTIONS = ['general', 'models', 'skills', 'plugins'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

function isSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

export function getLastSettingsSection(): SettingsSection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isSection(raw) ? raw : 'general';
  } catch {
    return 'general';
  }
}

export function setLastSettingsSection(section: SettingsSection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, section);
  } catch {
    // 存储不可用：不阻塞
  }
}
