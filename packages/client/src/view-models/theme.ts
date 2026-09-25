/**
 * 主题解析与落地（A 类移植自 pi-web lib/theme.ts 的判定部分；ADR-0019-2 深色随 F5）。
 * 纯逻辑（resolveTheme/nextTheme）与 DOM 写入（applyTheme）分开：前者可测，后者只在浏览器跑。
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/** 循环切换：system → light → dark → system（与原型的三态一致） */
export function nextTheme(preference: ThemePreference): ThemePreference {
  const index = THEME_ORDER.indexOf(preference);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? 'system';
}

export function themeLabel(preference: ThemePreference): string {
  return preference === 'system' ? '跟随系统' : preference === 'dark' ? '深色' : '浅色';
}

/** 落到 DOM：`data-theme` 属性（theme.css 的暗色变量块挂在这个选择器上） */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement): void {
  root.dataset['theme'] = theme;
  root.style.colorScheme = theme;
}
