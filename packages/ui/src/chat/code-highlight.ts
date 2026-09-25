import { getLanguageFromPath } from '@ice-ai/client';

/**
 * 语法高亮（F5，ADR-0009 定 shiki）：按需加载 + 语言懒加载，失败静默退化为纯文本。
 * 不在模块顶层 createHighlighter——那会把 shiki 与全部语法打包进首屏。
 */
type Highlighter = {
  codeToHtml(code: string, options: { lang: string; theme: string }): string;
};

let highlighterPromise: Promise<Highlighter | null> | null = null;
const loadedLanguages = new Set<string>();

const THEME = 'github-light-default';

async function getHighlighter(): Promise<Highlighter | null> {
  highlighterPromise ??= import('shiki')
    .then(
      (shiki) =>
        shiki.createHighlighter({
          themes: [THEME],
          langs: [],
        }) as unknown as Promise<Highlighter>,
    )
    .catch(() => null);
  return highlighterPromise;
}

/** 语言名 → shiki 语言 id（未知返回 null = 不高亮） */
export function shikiLanguageFor(path: string, explicit?: string): string | null {
  const candidate =
    explicit !== undefined && explicit.length > 0 ? explicit : getLanguageFromPath(path);
  if (candidate === 'text' || candidate.length === 0) return null;
  return candidate;
}

/**
 * 高亮为 HTML（附带 `shiki` 主题的内联样式）。
 * 返回 null = 不高亮（调用方回落到纯文本 `<pre>`）。
 */
export async function highlightToHtml(code: string, language: string): Promise<string | null> {
  const highlighter = await getHighlighter();
  if (highlighter === null) return null;
  try {
    if (!loadedLanguages.has(language)) {
      // 动态 import 单个语言（shiki 支持按 id 拉）
      await (highlighter as unknown as { loadLanguage(id: string): Promise<void> }).loadLanguage(
        language,
      );
      loadedLanguages.add(language);
    }
    return highlighter.codeToHtml(code, { lang: language, theme: THEME });
  } catch {
    return null;
  }
}
