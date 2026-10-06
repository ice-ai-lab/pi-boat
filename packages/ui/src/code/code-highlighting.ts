/** 文件名→语法选择 + 懒加载高亮器的 React 绑定（DSH code-highlighting.ts 同形）。 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  grammarLoadCount,
  type HighlightSpan,
  highlightLines,
  subscribeGrammarLoaded,
} from './highlight';

export type { HighlightSpan };

/** 把一段源码高亮成「一行一个 token 数组」。 */
export type CodeHighlighter = (code: string) => HighlightSpan[][] | undefined;

/**
 * 把共享懒加载高亮器绑到某个语言上，语法加载完成后刷新。
 * @param language - 语法提示（shiki 语言 id；来自 client 的 `getLanguageFromPath` 或 fence 标注）。
 * @returns 稳定的片段高亮器；未知与加载中的语法返回 `undefined`（调用方退纯文本）。
 */
export function useCodeHighlighter(language: string | undefined): CodeHighlighter {
  const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loaded` 只用来在懒语法就绪时换新回调身份，驱动订阅方重渲染
  return useCallback((code) => highlightLines(code, language), [language, loaded]);
}
