import { Fragment } from 'react';
import { HighlightedText } from './highlighted-text';
import { useHighlightLines } from './use-highlight';

/**
 * 多行高亮文本（无行号、无表格）：工具面板的 args / output 用，调用方自备 `<pre>` 容器。
 * 未就绪或不可高亮时原样吐回 `code`——所以从纯文本切到高亮只换颜色，不跳内容。
 */
export function HighlightedCode({ code, language }: { code: string; language: string | null }) {
  const lines = useHighlightLines(code, language);
  if (lines === null) return code;
  return (
    <>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: code 整体替换时整段重算，行序即身份
        <Fragment key={index}>
          {index > 0 ? '\n' : null}
          <HighlightedText line={line} />
        </Fragment>
      ))}
    </>
  );
}
