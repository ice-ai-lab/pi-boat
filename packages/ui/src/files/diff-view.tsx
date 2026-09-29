import { parseUnifiedDiff } from '@ice-ai/client';
import { useMemo } from 'react';
import styles from './diff-view.module.css';

/**
 * DiffView（docs/06 §4.2/§4.3）：unified diff 行渲染（行号 + `+`/`-`/上下文前缀）。
 * 无需 diff 库：patch 由服务端给（git diff），解析是纯函数（client/files/unified-diff）。
 * 视觉对齐 dsh-file-explorer：无表格描边，行号走三级文字色，增删行用语义软底。
 */
export interface DiffViewProps {
  patch: string;
  /** 空 patch 时的提示 */
  emptyHint?: string;
  className?: string;
}

export function DiffView({ patch, emptyHint = '没有改动', className }: DiffViewProps) {
  const parsed = useMemo(() => parseUnifiedDiff(patch), [patch]);

  if (parsed.rows.length === 0) {
    return (
      <p className={`${styles.empty}${className === undefined ? '' : ` ${className}`}`}>
        {emptyHint}
      </p>
    );
  }

  return (
    <div className={`${styles.scroll}${className === undefined ? '' : ` ${className}`}`}>
      <div className={styles.summary}>
        <span className={styles.additions}>+{parsed.additions}</span>
        <span className={styles.deletions}>-{parsed.deletions}</span>
      </div>
      <table className={styles.table}>
        <tbody>
          {parsed.rows.map((row, index) => {
            if (row.kind === 'hunk') {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: patch 变化时整表重算，位置即身份
                <tr key={index}>
                  <td colSpan={3} className={styles.hunk}>
                    {row.header}
                  </td>
                </tr>
              );
            }
            if (row.kind === 'meta') {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                <tr key={index}>
                  <td colSpan={3} className={styles.meta}>
                    {row.text}
                  </td>
                </tr>
              );
            }
            const tone =
              row.kind === 'add'
                ? styles.rowAdd
                : row.kind === 'remove'
                  ? styles.rowRemove
                  : styles.rowContext;
            const marker = row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' ';
            const oldNo = row.kind === 'add' ? '' : row.oldLine;
            const newNo = row.kind === 'remove' ? '' : row.newLine;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上
              <tr key={index} className={tone}>
                <td className={styles.gutter}>{oldNo}</td>
                <td className={styles.gutter}>{newNo}</td>
                <td className={styles.code}>
                  <span className={styles.marker}>{marker}</span>
                  {row.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
