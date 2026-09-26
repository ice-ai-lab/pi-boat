import { useEffect, useState } from 'react';
import { highlightToHtml, shikiLanguageFor } from './code-highlight';

/** 代码块正文底/内边距 ——按设计规范 `CodeBlock` 的 customStyle */
const PRE_STYLE = {
  margin: 0,
  padding: '11px 13px',
  fontSize: 'calc(12.5px + var(--chat-font-size-offset, 0px))',
  lineHeight: 1.62,
  overflowX: 'auto',
  background: 'color-mix(in srgb, var(--bg) 92%, var(--bg-panel))',
} as const;

/**
 * CodeBlock：banner + 语言标 + 复制 + 高亮（shiki，F5）。
 * 类名/结构按设计规范 的 `CodeBlock`（ADR-0020）；
 * 高亮失败/语言未知 → 纯文本（保证大文件与罕见语言也能读）。
 */
export function CodeBlock({
  code,
  lang,
  isStreaming = false,
}: {
  code: string;
  lang?: string;
  isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  const language = shikiLanguageFor('', lang);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    if (language === null || isStreaming) return;
    void highlightToHtml(code, language).then((result) => {
      if (alive) setHtml(result);
    });
    return () => {
      alive = false;
    };
  }, [code, language, isStreaming]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板权限被拒：静默（按钮态不变）
    }
  };

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span className="markdown-code-lang">
          {lang !== undefined && lang !== '' ? lang : 'text'}
        </span>
        <div className="markdown-code-actions">
          <button type="button" onClick={copy} className="markdown-code-action">
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>
      {html === null ? (
        <pre style={PRE_STYLE}>
          <code style={{ fontFamily: 'var(--font-mono)' }}>{code}</code>
        </pre>
      ) : (
        <div
          style={PRE_STYLE}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki 输出是它自己转义后的 HTML（从不塞用户 HTML）
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
