import { getLanguageFromPath } from '@ice-ai/client';
import type { ThemedToken } from 'shiki';

/**
 * 语法高亮（F5，ADR-0009 定 shiki）：按需加载 + 语言懒加载，失败静默退化为纯文本。
 * 不在模块顶层 createHighlighter——那会把 shiki 与全部语法打包进首屏。
 *
 * 双主题：走 shiki 的 `themes` 模式 + `defaultColor: false`，颜色**只**以
 * `--shiki-light`/`--shiki-dark` 变量落在行内，由 highlight.module.css 的 `[data-theme]`
 * 规则取用。所以高亮结果与主题无关：切主题不重算，ui 包也不必订阅宿主主题。
 *
 * 调用方三处共用：聊天代码块（HTML）、源码查看器/补丁视图（逐行 token）。
 */
const THEMES = { light: 'github-light-default', dark: 'github-dark-default' } as const;

/** 超过此行的文本不做高亮（F5 降级口径）：大文件保住滚动与内存 */
export const MAX_HIGHLIGHT_LINES = 1000;

/** 高亮后的一个 token：一段文本 + 行内 CSS 变量（`--shiki-light`/`--shiki-dark`）；空对象 = 沿用继承色 */
export interface HighlightToken {
  content: string;
  style: Record<string, string>;
}
export type HighlightLine = HighlightToken[];

/** 这里只声明用到的 shiki 能力：语言 id 在本包是运行时字符串（路径推断/代码块标注），shiki 的类型把它收窄成 bundled key */
type CodeOptions = {
  lang: string;
  themes: typeof THEMES;
  defaultColor: false;
};
type Highlighter = {
  codeToHtml(code: string, options: CodeOptions): string;
  codeToTokens(code: string, options: CodeOptions): { tokens: ThemedToken[][] };
  loadLanguage(id: string): Promise<void>;
};

let highlighterPromise: Promise<Highlighter | null> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<Highlighter | null> {
  highlighterPromise ??= import('shiki')
    .then(
      (shiki) =>
        shiki.createHighlighter({
          themes: [THEMES.light, THEMES.dark],
          langs: [],
        }) as unknown as Promise<Highlighter>,
    )
    .catch(() => null);
  return highlighterPromise;
}

async function ensureLanguage(highlighter: Highlighter, language: string): Promise<void> {
  if (loadedLanguages.has(language)) return;
  await highlighter.loadLanguage(language);
  loadedLanguages.add(language);
}

/** 语言名 → shiki 语言 id（未知返回 null = 不高亮） */
export function shikiLanguageFor(path: string, explicit?: string): string | null {
  const candidate =
    explicit !== undefined && explicit.length > 0 ? explicit : getLanguageFromPath(path);
  if (candidate === 'text' || candidate.length === 0) return null;
  return candidate;
}

/**
 * 高亮为 HTML（只带 `--shiki-*` 变量，无行内 `color`）。
 * 返回 null = 不高亮（调用方回落到纯文本 `<pre>`）。
 */
export async function highlightToHtml(code: string, language: string): Promise<string | null> {
  const highlighter = await getHighlighter();
  if (highlighter === null) return null;
  try {
    await ensureLanguage(highlighter, language);
    return highlighter.codeToHtml(code, { lang: language, themes: THEMES, defaultColor: false });
  } catch {
    return null;
  }
}

/**
 * 高亮为逐行 token（行号表格 / 补丁视图用）。
 * 返回 null = 不高亮（语言未知、超出 MAX_HIGHLIGHT_LINES、或 shiki 失败）。
 */
export async function highlightLines(
  code: string,
  language: string,
): Promise<HighlightLine[] | null> {
  if (code.length === 0 || code.split('\n').length > MAX_HIGHLIGHT_LINES) return null;
  const highlighter = await getHighlighter();
  if (highlighter === null) return null;
  try {
    await ensureLanguage(highlighter, language);
    const { tokens } = highlighter.codeToTokens(code, {
      lang: language,
      themes: THEMES,
      defaultColor: false,
    });
    // `themes` 模式下 shiki 把两套色写成 `htmlStyle`（`--shiki-light`/`--shiki-dark`），正是这里要的形状
    return tokens.map((line) =>
      line.map((token) => ({ content: token.content, style: token.htmlStyle ?? {} })),
    );
  } catch {
    return null;
  }
}
