import { applyTheme, type ResolvedTheme, resolveTheme, type ThemePreference } from '@ice-ai/client';
import { useEffect, useState } from 'react';

/**
 * 主题（ADR-0019-2：随 F5 交付 light/dark/system 三态）。
 * 偏好在 localStorage；`system` 跟随 `prefers-color-scheme`（监听变化）。
 */
const THEME_KEY = 'piboat:theme';

function readPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === 'dark' || raw === 'light' || raw === 'system' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(next: ThemePreference): void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference());
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyTheme(resolved, document.documentElement);
  }, [resolved]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // 存储不可用：仅本次会话生效
    }
  };

  return { preference, resolved, setPreference };
}
