/**
 * DiffBlock：unified patch 的内联 diff 卡片（移植自 DSH ui-primitives `DiffBlock`，MIT；
 * 输入从「oldText/newText 现算」改为 pi-boat 的 git patch 字符串——patch 由服务端给，
 * 行解析复用 client 的 `parseUnifiedDiff`，本组件只负责 DSH 观感：路径行 + 增删行
 * 语义色（`::before` 出 `- `/`+ ` 前缀、行首 3px 色条）、hunk 间 `⋯` 缝、中段折叠、
 * 折行切换与复制（复制带 `- `/`+ ` 前缀）。
 */

import { parseUnifiedDiff } from '@ice-ai/client';
import { useCallback, useMemo, useState } from 'react';
import { writeClipboard } from './clipboard';
import cardCss from './code-card.module.css';
import { CodeToolbar, type CodeToolbarLabels } from './code-toolbar';
import css from './diff-block.module.css';
import type { HighlightSpan } from './highlight';
import { highlightLines } from './highlight';

/** 中段折叠前展示的行数（DSH 同款默认）。 */
export const DEFAULT_DIFF_MAX_LINES = 16;

/** DiffBlock 的本地化文案（toolbar 三件 + 折叠两件 + 复制两件）。 */
export interface DiffBlockLabels extends CodeToolbarLabels {
  copy: string;
  copied: string;
  collapseAria: string;
  expandAria: (hidden: number) => string;
  collapse: string;
  expand: (hidden: number) => string;
}

/** 一条渲染行：kind 决定配色与前缀。 */
type DiffRow =
  | { kind: 'path' | 'del' | 'add' | 'context'; text: string }
  | { kind: 'gap'; text: string };

/** `+++ b/<path>` / `--- a/<path>` 里的路径（旧文件名走 /dev/null）。 */
function metaPath(text: string): string | undefined {
  const match = /^(?:\+\+\+|---) (.+?)(?:\t.*)?$/.exec(text);
  if (match === null) return undefined;
  const raw = match[1] ?? '';
  if (raw === '/dev/null') return undefined;
  return raw.replace(/^[ab]\//, '');
}

/**
 * patch → 渲染行：首个 meta 提取路径作 path 行；hunk 头作 gap 行；
 * 其余 meta（index/mode/`\ No newline`）丢弃。空 patch → 空行表。
 */
export function buildRows(patch: string): DiffRow[] {
  const parsed = parseUnifiedDiff(patch);
  const rows: DiffRow[] = [];
  let pathWritten = false;
  for (const row of parsed.rows) {
    if (row.kind === 'meta') {
      if (pathWritten) continue;
      const path = metaPath(row.text);
      if (path === undefined) continue;
      rows.push({ kind: 'path', text: path });
      pathWritten = true;
      continue;
    }
    if (row.kind === 'hunk') {
      rows.push({ kind: 'gap', text: '⋯' });
      continue;
    }
    if (row.kind === 'add') rows.push({ kind: 'add', text: row.text });
    else if (row.kind === 'remove') rows.push({ kind: 'del', text: row.text });
    else rows.push({ kind: 'context', text: row.text });
  }
  return rows;
}

/** 复制用全文：增删行带 `- `/`+ ` 前缀，上下文两空格，路径与缝原样。 */
function copyText(rows: readonly DiffRow[]): string {
  return rows
    .map((row) => {
      switch (row.kind) {
        case 'del':
          return `- ${row.text}`;
        case 'add':
          return `+ ${row.text}`;
        case 'context':
          return `  ${row.text}`;
        default:
          return row.text;
      }
    })
    .join('\n');
}

const ROW_CLASS: Record<DiffRow['kind'], string | undefined> = {
  path: css.path,
  del: css.del,
  add: css.add,
  context: css.context,
  gap: css.gap,
};

export interface DiffBlockProps {
  /** 单文件 unified patch（服务端 git diff 产物）；空行表渲染 `emptyHint`。 */
  patch: string;
  /** shiki 语言 id；给了就给正文行上高亮（懒加载语法未就绪时退纯文本）。 */
  language?: string | undefined;
  /** 空 patch 时的提示文案。 */
  emptyHint: string;
  /** 本地化文案。 */
  labels: DiffBlockLabels;
  /** 折叠前展示的正文行数（默认 {@link DEFAULT_DIFF_MAX_LINES}）。 */
  maxLines?: number | undefined;
  className?: string | undefined;
}

/** 渲染一段 unified patch 的 DSH 观感 diff 卡片。 */
export function DiffBlock({
  patch,
  language = undefined,
  emptyHint,
  labels,
  maxLines = DEFAULT_DIFF_MAX_LINES,
  className = undefined,
}: DiffBlockProps) {
  const rows = useMemo(() => buildRows(patch), [patch]);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);

  // 正文整体 tokenize 一次（跨行构造才认得全），再按行回填；懒语法未就绪 → 全 null（纯文本）。
  const codeText = useMemo(
    () =>
      rows
        .filter((row) => row.kind !== 'path' && row.kind !== 'gap')
        .map((row) => row.text)
        .join('\n'),
    [rows],
  );
  const highlight = useMemo(() => highlightLines(codeText, language), [codeText, language]);
  const tokensByRow = useMemo(() => {
    let cursor = 0;
    return rows.map((row): readonly HighlightSpan[] | null => {
      if (row.kind === 'path' || row.kind === 'gap') return null;
      const line = highlight?.[cursor];
      cursor += 1;
      return line ?? null;
    });
  }, [rows, highlight]);

  const onCopy = useCallback(() => {
    if (copied) return;
    void writeClipboard(copyText(rows)).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1000);
    });
  }, [copied, rows]);

  const onToggle = useCallback(() => {
    setExpanded((value) => !value);
  }, []);

  if (rows.length === 0) {
    return <p className={css.empty}>{emptyHint}</p>;
  }

  const hidden = rows.length - maxLines;
  const capped = hidden > 0 && !expanded;
  // 与 DSH 同一条头尾切分算术：前半多一行，保证中缝不吞首尾。
  const headLines = Math.ceil(maxLines / 2);
  const tailLines = maxLines - headLines;
  const head = capped ? rows.slice(0, headLines) : rows;
  const tail = capped ? rows.slice(rows.length - tailLines) : [];
  // tokensByRow 与 rows 等长同序：尾段从 rows.length - tailLines 起。

  return (
    <div
      className={`${cardCss.card} ${css.block}${className === undefined ? '' : ` ${className}`}`}
      data-diff=""
      data-code-wrap={wrapped}
    >
      <CodeToolbar
        lang={language}
        status={`+${countKind(rows, 'add')} -${countKind(rows, 'del')}`}
        labels={labels}
        copyLabel={labels.copy}
        copiedLabel={labels.copied}
        copied={copied}
        wrapped={wrapped}
        onCopy={onCopy}
        onWrap={() => {
          setWrapped((value) => !value);
        }}
      />
      <div className={css.body}>
        {head.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: patch 变化时行表整体重算，位置即身份
          <DiffLine key={index} row={row} tokens={tokensByRow[index]} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            className={css.expand}
            aria-expanded={expanded}
            aria-label={expanded ? labels.collapseAria : labels.expandAria(hidden)}
            onClick={onToggle}
          >
            {expanded ? labels.collapse : labels.expand(hidden)}
          </button>
        )}
        {tail.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同上
          <DiffLine key={index} row={row} tokens={tokensByRow[rows.length - tailLines + index]} />
        ))}
      </div>
    </div>
  );
}

function DiffLine({
  row,
  tokens = null,
}: {
  row: DiffRow;
  tokens?: readonly HighlightSpan[] | null;
}) {
  return (
    <div className={`${css.line} ${ROW_CLASS[row.kind] ?? ''}`}>
      {tokens === null || tokens === undefined || row.kind === 'path' || row.kind === 'gap' ? (
        row.text
      ) : (
        <span className={css.codeText}>
          {tokens.map((span, spanIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: token 序号即身份（整行重算）
            <span key={spanIndex} style={span.style}>
              {span.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function countKind(rows: readonly DiffRow[], kind: 'add' | 'del'): number {
  return rows.filter((row) => row.kind === kind).length;
}
