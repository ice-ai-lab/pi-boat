import {
  applyTheme,
  isDarkTheme,
  isThemePreference,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from '@ice-ai/client';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * 主题订阅（**B 类移植自 pi-web `hooks/useTheme.ts`**）。
 *
 * 差异只有两处，都是本仓的既有约定：
 * - storage key 用 `piboat:theme`（不与同源上的 pi-web 实例互相覆盖）；
 * - 纯逻辑（`isDarkTheme`/`resolveTheme`/`applyTheme`/`THEME_OPTIONS`）在 client 里，这里只管订阅。
 */
const STORAGE_KEY = 'piboat:theme';

type ThemeState = { preference: ThemePreference; theme: ResolvedTheme };

/** 圆形揭示的圆心（点击位置），缺省是视口中心 */
export type ToggleOrigin = { x: number; y: number };

const SNAPSHOT_FALLBACK: ThemeState = { preference: 'auto', theme: 'light' };

const listeners = new Set<() => void>();
let state: ThemeState | null = null;
let systemListening = false;

function emit(): void {
  for (const cb of listeners) cb();
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (isThemePreference(value)) return value;
  } catch {
    // 存储不可用（隐私模式/配额）：当没存过
  }
  return 'auto';
}

function ensureState(): ThemeState {
  if (typeof window === 'undefined') return SNAPSHOT_FALLBACK;
  if (state !== null) return state;
  const preference = readStoredPreference();
  const theme = resolveTheme(preference, systemTheme() === 'dark');
  applyTheme(theme, document.documentElement);
  state = { preference, theme };
  return state;
}

function setThemeState(preference: ThemePreference, theme: ResolvedTheme, persist: boolean): void {
  applyTheme(theme, document.documentElement);
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // 存储不可用：仅本次会话生效
    }
  }
  state = { preference, theme };
  emit();
}

function syncAutoThemeFromSystem(): void {
  const current = ensureState();
  if (current.preference !== 'auto') return;
  const theme = systemTheme();
  if (theme === current.theme) return;
  setThemeState('auto', theme, false);
}

function ensureSystemListener(): void {
  if (systemListening || typeof window === 'undefined' || !window.matchMedia) return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', syncAutoThemeFromSystem);
  // 部分浏览器在后台时漏发配色事件
  window.addEventListener('focus', syncAutoThemeFromSystem);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncAutoThemeFromSystem();
  });
  systemListening = true;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  ensureState();
  ensureSystemListener();
  syncAutoThemeFromSystem();
  return () => {
    listeners.delete(cb);
  };
}

export function useTheme(): {
  preference: ThemePreference;
  theme: ResolvedTheme;
  isDark: boolean;
  setPreference(next: ThemePreference, origin?: ToggleOrigin): void;
} {
  const snapshot = useSyncExternalStore(subscribe, ensureState, () => SNAPSHOT_FALLBACK);

  const setPreference = useCallback((next: ThemePreference, origin?: ToggleOrigin) => {
    const current = ensureState();
    if (current.preference === next) return;
    const theme = resolveTheme(next, systemTheme() === 'dark');
    const apply = () => setThemeState(next, theme, true);

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (typeof document.startViewTransition !== 'function' || reduceMotion) {
      apply();
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
          },
          {
            duration: 450,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {
        // 过渡被取消：忽略
      });
  }, []);

  return {
    preference: snapshot.preference,
    theme: snapshot.theme,
    isDark: isDarkTheme(snapshot.theme),
    setPreference,
  };
}
