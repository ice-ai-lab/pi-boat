/**
 * 对话外观（**按设计规范**）：内容最大宽度与字号。
 * 纯逻辑与 DOM 写入在这里，React 订阅在 app 层（与 `view-models/theme.ts` 同构）。
 * storage key 用本仓的 `piboat:` 前缀，避免与同源设计规范互相覆盖。
 */
export const CHAT_CONTENT_WIDTH_DEFAULT = 1150;
export const CHAT_CONTENT_WIDTH_MIN = 640;
export const CHAT_CONTENT_WIDTH_MAX = 2000;
export const CHAT_CONTENT_WIDTH_STORAGE_KEY = 'piboat:chat-content-width';
/**
 * 内容列两侧留给宽度把手的安全预算（px）：24px 间距 + 12px 热区 + 4px 外缘。
 * 内容宽会被压到 `列宽 - 预算`，保证把手始终有可 hover 的位置。
 */
export const CHAT_CONTENT_EDGE_BUDGET = 80;
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
  // 无值（未设置过）回落到默认值；注意不能直接 Number(null)=0，否则会落到下限
  if (value === null || value === undefined || value === '') return CHAT_CONTENT_WIDTH_DEFAULT;
  const width = Number(value);
  if (!Number.isFinite(width)) return CHAT_CONTENT_WIDTH_DEFAULT;
  return Math.max(CHAT_CONTENT_WIDTH_MIN, Math.min(CHAT_CONTENT_WIDTH_MAX, Math.round(width)));
}

/**
 * 把「用户偏好的内容宽」落成**当前列宽下实际能用的宽**（设计规范 §8.4）：
 * 先按 `[MIN, MAX]` 夹取，再压到 `列宽 - CHAT_CONTENT_EDGE_BUDGET`，为两侧把手留位。
 * `columnWidth <= 0`（尚未测量）时直接返回偏好值。
 */
export function resolveChatContentWidth(preference: number, columnWidth: number): number {
  const preferred = clampChatContentWidth(preference);
  if (!Number.isFinite(columnWidth) || columnWidth <= 0) return preferred;
  const max = Math.max(CHAT_CONTENT_WIDTH_MIN, Math.round(columnWidth - CHAT_CONTENT_EDGE_BUDGET));
  return Math.min(preferred, max);
}

export function clampChatContentFontSize(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return CHAT_CONTENT_FONT_SIZE_DEFAULT;
  }
  const size = Number(value);
  if (!Number.isFinite(size)) return CHAT_CONTENT_FONT_SIZE_DEFAULT;
  return Math.max(
    CHAT_CONTENT_FONT_SIZE_MIN,
    Math.min(CHAT_CONTENT_FONT_SIZE_MAX, Math.round(size)),
  );
}

/** 落到 DOM：写 `--chat-content-max-width` / `--chat-content-font-size`（设计规范 `applyAppearance`） */
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

/** 设计规范：思考块默认是否展开 */
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
