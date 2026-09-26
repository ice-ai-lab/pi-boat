import {
  applyChatAppearance,
  CHAT_CONTENT_FONT_SIZE_STORAGE_KEY,
  CHAT_CONTENT_WIDTH_STORAGE_KEY,
  type ChatAppearance,
  clampChatContentFontSize,
  clampChatContentWidth,
  DEFAULT_CHAT_APPEARANCE,
  readStoredChatAppearance,
} from '@ice-ai/client';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * 对话外观订阅（移植自 pi-web `hooks/useChatAppearance.ts` 的 React 部分）。
 * 纯逻辑在 `@ice-ai/client`；这里只管订阅与持久化。
 */
const listeners = new Set<() => void>();
let state: ChatAppearance | null = null;

function emit(): void {
  for (const cb of listeners) cb();
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function ensureState(): ChatAppearance {
  if (typeof window === 'undefined') return DEFAULT_CHAT_APPEARANCE;
  if (state !== null) return state;
  state = readStoredChatAppearance(readStored);
  applyChatAppearance(state, document.documentElement);
  return state;
}

function setPreference(key: keyof ChatAppearance, value: number): void {
  const current = ensureState();
  const nextValue =
    key === 'width' ? clampChatContentWidth(value) : clampChatContentFontSize(value);
  state = { ...current, [key]: nextValue };
  applyChatAppearance(state, document.documentElement);
  try {
    window.localStorage.setItem(
      key === 'width' ? CHAT_CONTENT_WIDTH_STORAGE_KEY : CHAT_CONTENT_FONT_SIZE_STORAGE_KEY,
      String(nextValue),
    );
  } catch {
    // 存储不可用：仅本次会话生效
  }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useChatAppearance(): ChatAppearance & {
  setWidth(value: number): void;
  setFontSize(value: number): void;
} {
  const snapshot = useSyncExternalStore(subscribe, ensureState, () => DEFAULT_CHAT_APPEARANCE);
  const setWidth = useCallback((value: number) => setPreference('width', value), []);
  const setFontSize = useCallback((value: number) => setPreference('fontSize', value), []);
  return { ...snapshot, setWidth, setFontSize };
}
