import { useMemo } from 'react';
import styles from './code-viewer.module.css';

/**
 * CodeViewer（docs/06 §4.3）：行号 + 等宽正文。
 * 语法高亮在 F5 接 shiki（ADR-0009）；现在给行号与折行开关，保证大文件也能读。
 * 行数上限：超大文件只渲染前 N 行（避免几万行 DOM 卡死），并提示截断。
 */
export interface CodeViewerProps {
  code: string;
  wrapLines: boolean;
  /** 只渲染前 N 行（默认 5000） */
  maxLines?: number;
  className?: string;
}

const DEFAULT_MAX_LINES = 5000;

export function CodeViewer({
  code,
  wrapLines,
  maxLines = DEFAULT_MAX_LINES,
  className,
}: CodeViewerProps) {
  const { lines, truncated } = useMemo(() => {
    const all = code.split('\n');
    if (all.length <= maxLines) return { lines: all, truncated: false };
    return { lines: all.slice(0, maxLines), truncated: true };
  }, [code, maxLines]);

  return (
    <div className={`${styles.scroll}${className === undefined ? '' : ` ${className}`}`}>
      <table className={styles.table}>
        <tbody>
          {lines.map((line, index) => (
            // 代码行以行号为身份（文件内容整体替换时才重算）
            // biome-ignore lint/suspicious/noArrayIndexKey: 见上行说明
            <tr key={index} className={styles.row}>
              <td className={styles.gutter}>{index + 1}</td>
              <td className={`${styles.code} ${wrapLines ? styles.wrap : styles.nowrap}`}>
                {line.length === 0 ? ' ' : line}
              </td>
            </tr>
          ))}
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
