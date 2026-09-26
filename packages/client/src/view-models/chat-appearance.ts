/**
 * 对话外观（**移植自 pi-web `hooks/useChatAppearance.ts`**）：内容最大宽度与字号。
 * 纯逻辑与 DOM 写入在这里，React 订阅在 app 层（与 `view-models/theme.ts` 同构）。
 * storage key 用本仓的 `piboat:` 前缀，避免与同源 pi-web 互相覆盖。
 */
export const CHAT_CONTENT_WIDTH_DEFAULT = 820;
export const CHAT_CONTENT_WIDTH_MIN = 820;
export const CHAT_CONTENT_WIDTH_MAX = 2000;
export const CHAT_CONTENT_WIDTH_STORAGE_KEY = 'piboat:chat-content-width';
export const CHAT_CONTENT_FONT_SIZE_DEFAULT = 14;
export const CHAT_CONTENT_FONT_SIZE_MIN = 12;
export const CHAT_CONTENT_FONT_SIZE_MAX = 24;
export const CHAT_CONTENT_FONT_SIZE_STORAGE_KEY = 'piboat:chat-content-font-size';

export interface ChatAppearance {
  width: number;
  fontSize: number;
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  width: CHAT_CONTENT_WIDTH_DEFAULT,
  fontSize: CHAT_CONTENT_FONT_SIZE_DEFAULT,
};

export function clampChatContentWidth(value: unknown): number {
  const width = Number(value);
  if (!Number.isFinite(width)) return CHAT_CONTENT_WIDTH_DEFAULT;
  return Math.max(CHAT_CONTENT_WIDTH_MIN, Math.min(CHAT_CONTENT_WIDTH_MAX, Math.round(width)));
}

export function clampChatContentFontSize(value: unknown): number {
  const size = Number(value ?? CHAT_CONTENT_FONT_SIZE_DEFAULT);
  if (!Number.isFinite(size)) return CHAT_CONTENT_FONT_SIZE_DEFAULT;
  return Math.max(
    CHAT_CONTENT_FONT_SIZE_MIN,
    Math.min(CHAT_CONTENT_FONT_SIZE_MAX, Math.round(size)),
  );
}

/** 落到 DOM：写 `--chat-content-max-width` / `--chat-content-font-size`（pi-web `applyAppearance`） */
export function applyChatAppearance({ width, fontSize }: ChatAppearance, root: HTMLElement): void {
  root.style.setProperty('--chat-content-max-width', `${width}px`);
  root.style.setProperty('--chat-content-font-size', `${fontSize}px`);
}

/** 首帧前应用已保存的对话外观（避免加载后再跳一次） */
export function readStoredChatAppearance(read: (key: string) => string | null): ChatAppearance {
  return {
    width: clampChatContentWidth(read(CHAT_CONTENT_WIDTH_STORAGE_KEY)),
    fontSize: clampChatContentFontSize(read(CHAT_CONTENT_FONT_SIZE_STORAGE_KEY)),
  };
}

/** pi-web `lib/thinking-expansion-preference.ts`：思考块默认是否展开 */
export const THINKING_EXPANDED_STORAGE_KEY = 'piboat:thinking-expanded';
export const THINKING_EXPANDED_EVENT = 'piboat:thinking-expanded-changed';

export function isThinkingExpandedByDefault(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(THINKING_EXPANDED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setThinkingExpandedByDefault(expanded: boolean): void {
  try {
    window.localStorage.setItem(THINKING_EXPANDED_STORAGE_KEY, String(expanded));
  } catch {
    // 存储不可用：仅本次会话生效
  }
  window.dispatchEvent(new Event(THINKING_EXPANDED_EVENT));
}
