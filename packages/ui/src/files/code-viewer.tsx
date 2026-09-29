import { useMemo } from 'react';
import { HighlightedText } from '../highlight/highlighted-text';
import { useHighlightLines } from '../highlight/use-highlight';
import styles from './code-viewer.module.css';

/**
 * CodeViewer（docs/06 §4.3）：行号 + 等宽正文 + shiki 高亮（F5，ADR-0009）。
 * 高亮走 `useHighlightLines`：异步就绪前先画纯文本（不闪空白），语言未知或超行数上限时全程纯文本。
 * 行数上限：超大文件只渲染前 N 行（避免几万行 DOM 卡死），并提示截断；高亮另有 1000 行上限。
 */
export interface CodeViewerProps {
  code: string;
  wrapLines: boolean;
  /** shiki 语言 id（`shikiLanguageFor()` 的结果）；null = 不高亮 */
  language?: string | null;
  /** 只渲染前 N 行（默认 5000） */
  maxLines?: number;
  className?: string;
}

const DEFAULT_MAX_LINES = 5000;

export function CodeViewer({
  code,
  wrapLines,
  language = null,
  maxLines = DEFAULT_MAX_LINES,
  className,
}: CodeViewerProps) {
  const { lines, visibleCode, truncated } = useMemo(() => {
    const all = code.split('\n');
    if (all.length <= maxLines) return { lines: all, visibleCode: code, truncated: false };
    const kept = all.slice(0, maxLines);
    return { lines: kept, visibleCode: kept.join('\n'), truncated: true };
  }, [code, maxLines]);

  const highlight = useHighlightLines(visibleCode, language);

  return (
    <div className={`${styles.scroll}${className === undefined ? '' : ` ${className}`}`}>
      <table className={styles.table}>
        <tbody>
          {lines.map((line, index) => {
            const tokens = highlight?.[index];
            return (
              // 代码行以行号为身份（文件内容整体替换时才重算）
              // biome-ignore lint/suspicious/noArrayIndexKey: 见上行说明
              <tr key={index} className={styles.row}>
                <td className={styles.gutter}>{index + 1}</td>
                <td className={`${styles.code} ${wrapLines ? styles.wrap : styles.nowrap}`}>
                  {tokens === undefined ? (
                    line.length === 0 ? (
                      ' '
                    ) : (
                      line
                    )
                  ) : (
                    <HighlightedText line={tokens} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {truncated && (
        <p className={styles.truncated}>
          文件过大，仅显示前 {maxLines.toLocaleString()} 行（完整内容请下载）
        </p>
      )}
    </div>
  );
}
