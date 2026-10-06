import { Fragment, type ReactNode } from 'react';
import { type HighlightSpan, useCodeHighlighter } from './code-highlighting';

/**
 * 行内 token 渲染：一处 token → 一处 `<span>`（颜色由 shiki 的 css-variables 主题
 * 经 `--shiki-*` 变量下发，亮暗由 [data-theme] 取）。空行渲染零宽空格保行高。
 */
export function CodeLineSpans({ line }: { line: readonly HighlightSpan[] }) {
  if (line.length === 0) return <span>{'\u200b'}</span>;
  return (
    <>
      {line.map((span, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 行内 token 是纯静态切片，顺序即身份
        <span key={index} style={span.style}>
          {span.text}
        </span>
      ))}
    </>
  );
}

/**
 * 多行高亮文本（无行号、无表格）：工具面板的 args / output 用，调用方自备 `<pre>` 容器。
 * 未就绪或不可高亮时原样吐回 `code`——从纯文本切到高亮只换颜色，不跳内容。
 */
export function CodeRuns({
  code,
  language,
}: {
  code: string;
  language: string | undefined;
}): ReactNode {
  const highlight = useCodeHighlighter(language);
  const lines = highlight(code);
  if (lines === undefined) return code;
  return (
    <>
      {lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: code 整体替换时整段重算，行序即身份
        <Fragment key={index}>
          {index > 0 ? '\n' : null}
          <CodeLineSpans line={line} />
        </Fragment>
      ))}
    </>
  );
}
