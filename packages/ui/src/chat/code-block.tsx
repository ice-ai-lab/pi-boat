import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../utils/cn';

/** CodeBlock（docs/06 §4.2）：banner + 语言标 + 复制 + pre。高亮随 F5 接 shiki（ADR-0009）。 */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

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
        <span className="font-mono text-[11px] text-fg-faint">{lang ?? 'text'}</span>
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
      <pre className="scrollbar-thin overflow-x-auto px-3 py-2.5">
        <code className="font-mono text-[12.5px] leading-[1.6] text-fg">{code}</code>
      </pre>
    </div>
  );
}
