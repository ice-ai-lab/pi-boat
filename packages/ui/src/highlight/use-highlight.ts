import { useEffect, useState } from 'react';
import { type HighlightLine, highlightLines } from './code-highlight';

/**
 * 高亮行（行号表格 / 补丁视图渲染用）。
 * null = 还没就绪 / 不可高亮（语言未知、超 MAX_HIGHLIGHT_LINES、shiki 失败）→ 调用方画纯文本。
 */
export function useHighlightLines(code: string, language: string | null): HighlightLine[] | null {
  const [lines, setLines] = useState<HighlightLine[] | null>(null);

  useEffect(() => {
    let alive = true;
    setLines(null);
    if (language === null) return;
    void highlightLines(code, language).then((result) => {
      if (alive) setLines(result);
    });
    return () => {
      alive = false;
    };
  }, [code, language]);

  return lines;
}
