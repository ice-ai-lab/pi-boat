/**
 * 主题（ADR-0020 视觉基准；2026 年起精简为三态）。
 *
 * - 偏好是 `light/dark/auto` 三选一；`auto` 解析为跟随系统的 `dark` / `light`；
 * - 落地写 `data-theme`（theme.css 的变量块挂它）+ `dark` class（`html.dark` 选择器靠它）。
 *
 * 纯逻辑 + DOM 写入都在这里，React 订阅（含 View Transition 圆形揭示）在 app 层。
 */

export const THEME_OPTIONS = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'auto', label: '跟随系统' },
] as const;

export type ThemePreference = (typeof THEME_OPTIONS)[number]['id'];
/** 已解析的调色板（`auto` 被解析掉后的取值） */
export type ResolvedTheme = Exclude<ThemePreference, 'auto'>;

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_OPTIONS.some((option) => option.id === value);
}

export function isDarkTheme(theme: ResolvedTheme): boolean {
  return theme === 'dark';
}

/** `auto` → 跟随系统；其余原样（设计规范 的 `resolveTheme`） */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'auto' ? (systemDark ? 'dark' : 'light') : preference;
}

export function themeLabel(preference: ThemePreference): string {
  return THEME_OPTIONS.find((option) => option.id === preference)?.label ?? preference;
}

/** 落到 DOM：`data-theme` + `dark` class（设计规范 `applyDomTheme`） */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement): void {
  root.dataset.theme = theme;
  root.classList.toggle('dark', isDarkTheme(theme));
}

/**
 * 首帧前应用已保存的调色板（含 localStorage 不可用的情况）。
 * 按设计规范的 `THEME_INIT_SCRIPT`，只把 storage key 换成本仓的键。
 */
export const THEME_INIT_SCRIPT = `(function(){var t="auto";try{var s=localStorage.getItem("piboat:theme");if(${JSON.stringify(
  THEME_OPTIONS.map((option) => option.id),
)}.includes(s))t=s}catch(e){}if(t==="auto")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",t==="dark")})();`;
