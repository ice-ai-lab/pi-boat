import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

/**
 * MarkdownView：流式增量 markdown（react-markdown + gfm，ADR-0009）。
 * 排版类名/结构按设计规范 + `.markdown-body`（ADR-0020）；
 * 代码块走 CodeBlock（复制 + 语言标）。
 */
export const MarkdownView = memo(function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...rest }) => {
            const lang = className?.replace('language-', '').toLowerCase() ?? '';
            const raw = String(children);
            const isBlock = className?.includes('language-') === true || raw.includes('\n');
            if (!isBlock) {
              return (
                <code className="markdown-inline-code" {...rest}>
                  {children}
                </code>
              );
            }
            return <CodeBlock code={raw.replace(/\n$/, '')} lang={lang} />;
          },
          table: ({ children }) => (
            <div className="markdown-table-wrap">
              <table>{children}</table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
});

/** markdown 排版容器（设计规范的 `className` 由调用方叠加：markdown-user-message 等） */
export function MarkdownBody({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={className}>
      <MarkdownView markdown={markdown} />
    </div>
  );
}
