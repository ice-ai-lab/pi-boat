import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/cn';
import { CodeBlock } from './code-block';

/**
 * Markdown（原型 `.md` 全量排版 + `.tbl` 表格 wrap，docs/06 §4.2/§11.1）。
 *
 * 管线（ADR-0009）：`react-markdown` + `remark-gfm` + `rehype-sanitize` + 自绘 CodeBlock（shiki）。
 * **禁止** `dangerouslySetInnerHTML`——全部经 React 元素渲染，所以 sanitize 是纵深防御。
 */

const components: Components = {
  // 代码块：v10 的 code 组件不再给 `inline`，用「有 language- 类名或有换行」判定块级
  code({ className, children, ...rest }) {
    const text = String(children).replace(/\n$/, '');
    const match = /language-([\w-]+)/.exec(className ?? '');
    if (match !== null || text.includes('\n')) {
      return <CodeBlock code={text} lang={match?.[1]} />;
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
  // 块级代码的外层 <pre> 由 CodeBlock 自绘，去掉默认 pre 外壳
  pre({ children }) {
    return <>{children}</>;
  },
  // 表格：原型要求外层 wrap（横向滚动 + 描边），`.tbl` 落在 table 上
  table({ children }) {
    return (
      <div className="tbl-wrap">
        <table className="tbl">{children}</table>
      </div>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

export interface MarkdownViewProps {
  markdown: string;
  className?: string;
}

export function MarkdownView({ markdown, className }: MarkdownViewProps) {
  return (
    <div className={cn('md', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
