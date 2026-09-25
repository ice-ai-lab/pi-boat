import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../utils/cn';
import { highlightToHtml, shikiLanguageFor } from './code-highlight';

/**
 * CodeBlock（docs/06 §4.2）：banner + 语言标 + 复制 + 高亮（shiki，F5）。
 * 高亮失败/语言未知 → 纯文本（保证大文件与罕见语言也能读）。
 */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  const language = shikiLanguageFor('', lang);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    if (language === null) return;
    void highlightToHtml(code, language).then((result) => {
      if (alive) setHtml(result);
    });
    return () => {
      alive = false;
    };
  }, [code, language]);

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
    <div className="sq my-2 overflow-hidden border border-line-2 bg-code-bg">
      <div className="hairline-b flex items-center justify-between border-line-1 bg-code-banner px-3 py-1.5">
        <span className="font-mono text-[11px] text-fg-faint">{language ?? 'text'}</span>
        <button
          type="button"
          onClick={copy}
          title="复制代码"
          aria-label="复制代码"
          className="sq flex h-6 w-6 items-center justify-center text-fg-faint transition-colors hover:bg-hover hover:text-fg"
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
      </div>
      {html === null ? (
        <pre className="scrollbar-thin overflow-x-auto px-3 py-2.5">
          <code className="font-mono text-[12.5px] leading-[1.6] text-fg">{code}</code>
        </pre>
      ) : (
        <div
          className={cn('scrollbar-thin overflow-x-auto px-3 py-2.5 text-[12.5px] leading-[1.6]')}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki 输出是它自己转义后的 HTML（从不塞用户 HTML）
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
