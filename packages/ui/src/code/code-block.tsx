/**
 * CodeBlock——移植自 DSH ui-primitives `markdown/CodeBlock`（MIT）。
 * 三条渲染臂：流式（StreamingHighlightSession 增量 token、行组 DOM 复用）、
 * 静止（shiki HTML，viewport 激活后才算）、纯文本兜底（语言未知 / 语法未加载）。
 * 文案（复制/折行）一律由属主经 props 传入——本包不做内置文案。
 */

import clsx from 'clsx';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { Fragment, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { writeClipboard } from './clipboard';
import css from './code-block.module.css';
import { CodeToolbar, type CodeToolbarLabels } from './code-toolbar';
import type { HighlightSpan, StreamingHighlightFrame } from './highlight';
import {
  grammarLoadCount,
  highlightToHtml,
  StreamingHighlightSession,
  subscribeGrammarLoaded,
} from './highlight';
import { useViewportHighlighting } from './use-viewport-highlighting';

export interface CodeBlockProps {
  /** 源码原文（展示时去掉末尾换行）。 */
  code: string;
  /** 语法提示（markdown fence info 或调用方固定的 id）；未知 = 纯文本。 */
  lang?: string | undefined;
  /**
   * 代码仍在增长（流式 markdown fence）：走逐实例的 {@link StreamingHighlightSession}，
   * 只对增量文本重新分词，已完成行组（DOM）不动。调用方须在增长期间保持组件实例稳定
   * （流式稳定的 React key）；定稿后的 fence 也保留该树。静止调用走 shiki HTML。
   */
  streaming?: boolean | undefined;
  /** 合并到包装层的额外 class（定位归调用方，绘制归本组件）。 */
  className?: string | undefined;
  /** 稳定源码内容包装层的 ref（属主当滚动视口用）。 */
  contentRef?: Ref<HTMLDivElement> | undefined;
  /** 显示行号槽（复制内容不带行号）。默认 false。 */
  lineNumbers?: boolean | undefined;
  /** 显示语言 + 复制头；调用方自带工具栏时传 false。默认 true。 */
  showHeader?: boolean | undefined;
  /** 复制按钮空闲文案。 */
  copyLabel: string;
  /** 复制确认窗口期内的按钮文案。 */
  copiedLabel: string;
  /** 启用共享卡片工具栏；不给则用简易 banner。 */
  toolbarLabels?: CodeToolbarLabels | undefined;
  /** 有 toolbarLabels 时用属主的折行偏好，工具栏不再出本地折行动作。 */
  wrap?: boolean | undefined;
}

/** shiki HTML 臂的 `<pre>` 属性（css-variables 主题），与流式臂镜像可互换。 */
const SHIKI_PRE_PROPS = {
  className: 'shiki css-variables',
  style: { backgroundColor: 'var(--shiki-background)', color: 'var(--shiki-foreground)' },
  tabIndex: 0,
} as const;

/** 完成行组大小；React 按组 reconcile，DOM 逐行不变。 */
const STREAMING_LINE_GROUP_SIZE = 32;

function renderLine(line: readonly HighlightSpan[], index: number): ReactNode {
  return (
    <Fragment key={index}>
      {index > 0 && '\n'}
      <span className="line">
        {line.map((span, spanIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: token 序号即身份（行内整体重算）
          <span key={spanIndex} style={span.style}>
            {span.text}
          </span>
        ))}
      </span>
    </Fragment>
  );
}

export function CodeBlock({
  code,
  lang,
  streaming,
  className,
  contentRef,
  lineNumbers = false,
  showHeader = true,
  copyLabel,
  copiedLabel,
  toolbarLabels,
  wrap,
}: CodeBlockProps) {
  const trimmed = code.endsWith('\n') ? code.slice(0, -1) : code;
  const sourceLines = lineNumbers ? trimmed.split('\n') : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const highlighting = useViewportHighlighting(rootRef, lang);
  // 懒语法加载完重渲染：加载期间显示纯文本的 fence 能补上高亮。
  // 快照值不透明；只有跨渲染的变化驱动 memo。
  const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount);
  // 流式状态放在 memo 内突变的 ref 里（MarkdownText 流式缓存模式）：只有属主在增长期间
  // 保持本实例 key 稳定，session 缓存才能跨 chunk 存续。
  const sessionRef = useRef<StreamingHighlightSession | null>(null);
  const lineCacheRef = useRef<{
    code: string;
    lang: string | undefined;
    generation: number;
    frame: StreamingHighlightFrame;
    groups: ReactNode[];
    pending: ReactNode[];
    nextLine: number;
    body: ReactNode;
  } | null>(null);
  const settledRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `loaded` 只在懒语法就绪时变，驱动 memo 重算补高亮
  const streamedBody = useMemo(() => {
    if (!highlighting) {
      sessionRef.current = null;
      lineCacheRef.current = null;
      settledRef.current = false;
      return undefined;
    }
    if (streaming !== true) {
      const previous = lineCacheRef.current;
      if (previous !== null && previous.code === trimmed && previous.lang === lang) {
        settledRef.current = true;
        return previous.body;
      }
      sessionRef.current = null;
      lineCacheRef.current = null;
      settledRef.current = true;
      return undefined;
    }
    if (settledRef.current) {
      sessionRef.current = null;
      lineCacheRef.current = null;
      settledRef.current = false;
    }
    sessionRef.current ??= new StreamingHighlightSession();
    const frame = sessionRef.current.updateFrame(trimmed, lang);
    if (frame === undefined) {
      lineCacheRef.current = null;
      return undefined;
    }
    const previous = lineCacheRef.current;
    if (previous?.frame === frame && previous.code === trimmed && previous.lang === lang) {
      return previous.body;
    }
    const sameGeneration = previous?.generation === frame.generation;
    const groups = sameGeneration ? [...previous.groups] : [];
    let pending = sameGeneration ? [...previous.pending] : [];
    let nextLine = sameGeneration ? previous.nextLine : 0;
    for (const line of frame.appended) {
      pending.push(renderLine(line, nextLine));
      nextLine += 1;
      if (pending.length !== STREAMING_LINE_GROUP_SIZE) continue;
      const start = nextLine - pending.length;
      groups.push(<Fragment key={start}>{pending}</Fragment>);
      pending = [];
    }
    const tail = frame.tail.map((line, index) => renderLine(line, nextLine + index));
    const tailGroup = <Fragment key={nextLine - pending.length}>{[...pending, ...tail]}</Fragment>;
    const body = (
      <pre {...SHIKI_PRE_PROPS}>
        <code>
          {groups}
          {tailGroup}
        </code>
      </pre>
    );
    lineCacheRef.current = {
      code: trimmed,
      lang,
      generation: frame.generation,
      frame,
      groups,
      pending,
      nextLine,
      body,
    };
    return body;
  }, [streaming, highlighting, trimmed, lang, loaded]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 同上——`loaded` 变化驱动懒语法补高亮
  const html = useMemo(
    () =>
      highlighting && streaming !== true && streamedBody === undefined
        ? highlightToHtml(trimmed, lang)
        : undefined,
    [streaming, highlighting, streamedBody, trimmed, lang, loaded],
  );
  const [copied, setCopied] = useState(false);
  const [localWrapped, setWrapped] = useState(true);
  const wrapped = wrap ?? localWrapped;

  const onCopy = useCallback(() => {
    if (copied) return;
    const text = rootRef.current?.querySelector('pre')?.textContent ?? trimmed;
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1000);
    });
  }, [copied, trimmed]);

  // shiki 的 HTML 输出是它从 code 生成的静态 span 树（不经过用户 HTML），
  // 是 shiki 文档认可的 innerHTML 消费路径。
  const body =
    streamedBody !== undefined ? (
      streamedBody
    ) : html === undefined ? (
      <pre className={css.plain}>
        <code>
          {sourceLines === undefined
            ? trimmed
            : sourceLines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 行号即身份（整文件重算）
                <Fragment key={index}>
                  {index > 0 && '\n'}
                  <span className="line">{line}</span>
                </Fragment>
              ))}
        </code>
      </pre>
    ) : (
      // biome-ignore lint/security/noDangerouslySetInnerHtml: 见上——shiki 自产 HTML
      <div dangerouslySetInnerHTML={{ __html: html }} />
    );

  return (
    <div
      ref={rootRef}
      className={clsx(
        css.block,
        'md-code-block',
        lineNumbers && css.numbered,
        toolbarLabels !== undefined && css.card,
        className,
      )}
      data-line-numbers={lineNumbers || undefined}
      data-code-wrap={toolbarLabels === undefined ? undefined : wrapped}
      style={
        sourceLines === undefined
          ? undefined
          : ({
              '--ice-code-line-number-width': `${Math.max(2, String(sourceLines.length).length)}ch`,
            } as CSSProperties)
      }
    >
      {showHeader && (
        <div className={css.bannerWrap}>
          {toolbarLabels !== undefined ? (
            <CodeToolbar
              lang={lang}
              labels={toolbarLabels}
              copyLabel={copyLabel}
              copiedLabel={copiedLabel}
              copied={copied}
              wrapped={wrapped}
              onCopy={onCopy}
              onWrap={wrap === undefined ? () => setWrapped((value) => !value) : undefined}
            />
          ) : (
            <div className={css.banner} data-code-block-banner>
              <div className={css.infostring}>{lang ?? ''}</div>
              <div className={css.action}>
                <button type="button" className={css.copyButton} onClick={onCopy}>
                  {copied ? copiedLabel : copyLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <div ref={contentRef} className={css.content} data-code-block-content>
        {body}
      </div>
    </div>
  );
}
