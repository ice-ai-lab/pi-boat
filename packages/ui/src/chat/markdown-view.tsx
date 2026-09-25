import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../utils/cn';
import { CodeBlock } from './code-block';

/**
 * MarkdownView（docs/06 §4.2）：流式增量 markdown（react-markdown + gfm，ADR-0009）。
 * 代码块走 CodeBlock（复制 + 语言标）；表格包一层防溢出。F5 再接 shiki 高亮。
 */
export const MarkdownView = memo(function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="md text-[13.5px] leading-relaxed text-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...rest }) => {
            const isBlock = typeof className === 'string' && className.startsWith('language-');
            if (!isBlock) {
              return (
                <code
                  className="sq code-inline bg-code-bg px-1 py-0.5 font-mono text-[12.5px]"
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            const lang = className.slice('language-'.length);
            return <CodeBlock code={String(children).replace(/\n$/, '')} lang={lang} />;
          },
          table: ({ children }) => (
            <div className="my-2 w-full overflow-x-auto">
              <table className="hairline border-line-2 border-collapse text-[12.5px]">
                {children}
              </table>
            </div>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
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

/** markdown 排版容器（md 命名空间样式集中在此，F1 最小集） */
export function MarkdownBody({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <MarkdownView markdown={markdown} />
    </div>
  );
}
