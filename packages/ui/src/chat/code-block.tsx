import { useEffect, useState } from 'react';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 代码块（原型 `.codeblk`，docs/06 §4.2/§11.1）：shiki 高亮 + 语言标签 + 复制。
 *
 * 两点决策：
 * 1. 用 `codeToTokens`（拿 token 颜色渲染 React 元素），**不用** `codeToHtml` +
 *    `dangerouslySetInnerHTML`（ADR-0009 禁裸 dangerouslySetInnerHTML）
 * 2. 只注册常用语言（ts/tsx/js/jsx/json/bash/diff/md/python/css/html），
 *    JS 正则引擎免 wasm 资产（A-0009「Shiki 体积：按需加载语言」）
 */
const LANGS: Record<string, string> = {
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  javascript: 'javascript',
  json: 'json',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  diff: 'diff',
  patch: 'diff',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  python: 'python',
  css: 'css',
  html: 'html',
  yaml: 'yaml',
  yml: 'yaml',
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs')],
    langs: [
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/tsx.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/jsx.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/diff.mjs'),
      import('shiki/langs/markdown.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/html.mjs'),
      import('shiki/langs/yaml.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighterPromise;
}

type Token = { content: string; color?: string };

export interface CodeBlockProps {
  code: string;
  lang?: string;
  className?: string;
  /** 复制按钮（原型：复制成功转 toast；M1 只改按钮文案） */
  onCopied?: () => void;
}

export function CodeBlock({ code, lang, className, onCopied }: CodeBlockProps) {
  const language = lang === undefined ? undefined : LANGS[lang.toLowerCase()];
  const [lines, setLines] = useState<Token[][] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (language === undefined) {
      setLines(null);
      return;
    }
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        const result = highlighter.codeToTokens(code, { lang: language, theme: 'github-light' });
        setLines(result.tokens as Token[][]);
      })
      .catch(() => {
        // 高亮失败不致命：退化为纯文本（不 crash 整条消息）
        if (!cancelled) setLines(null);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className={cn('codeblk', className)}>
      <div className="banner">
        <span>{language ?? 'text'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(
              () => {
                setCopied(true);
                onCopied?.();
                window.setTimeout(() => setCopied(false), 1500);
              },
              () => undefined,
            );
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={11} />
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>
        {lines === null ? (
          <code>{code}</code>
        ) : (
          lines.map((line, lineIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 代码行无稳定 id，行序即身份
            <span key={lineIndex} className="block">
              {line.map((token, tokenIndex) =>
                token.color === undefined ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                  <span key={tokenIndex}>{token.content}</span>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                  <span key={tokenIndex} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ),
              )}
              {'\n'}
            </span>
          ))
        )}
      </pre>
    </div>
  );
}
