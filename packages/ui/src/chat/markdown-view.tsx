import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '../code/code-block';
import { useI18n } from '../i18n/i18n-provider';
import styles from './markdown.module.css';

/**
 * MarkdownView：流式增量 markdown（react-markdown + gfm，ADR-0009）。
 * 排版类名/结构按设计规范 + `.body`（markdown.module.css，ADR-0020）；
 * 代码块走 code/CodeBlock（DSH 同款：流式增量高亮 + 语言标/折行/复制卡片头）。
 */
export const MarkdownView = memo(function MarkdownView({
  markdown,
  streaming = false,
}: {
  markdown: string;
  /** 正文仍在增长：fence 走增量高亮 session（已完成行不重算） */
  streaming?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className={styles.body}>
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
                <code className={styles.inlineCode} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <CodeBlock
                code={raw.replace(/\n$/, '')}
                lang={lang}
                streaming={streaming}
                copyLabel={t('code.copy')}
                copiedLabel={t('code.copied')}
                toolbarLabels={{
                  codeLabel: t('code.codeLabel'),
                  wrapLabel: t('code.wrap'),
                  unwrapLabel: t('code.unwrap'),
                }}
              />
            );
          },
          table: ({ children }) => (
            <div className={styles.tableWrap}>
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
