import type { ToolRow as ToolRowModel } from '@ice-ai/client';
import { formatDuration } from '@ice-ai/client';
import { useState } from 'react';
import { cn } from '../utils/cn';
import { ChatImageList } from './chat-image';
import { TrailTag } from './trail';
import styles from './trail.module.css';

/** 内置工具名 → 色签（docs/06 §7 工具名→色表；表外工具落默认橙） */
const TAG_TONE: Record<string, string | undefined> = {
  bash: styles.tagBash,
  read: styles.tagRead,
  edit: styles.tagEdit,
  write: styles.tagWrite,
  grep: styles.tagGrep,
  find: styles.tagFind,
  ls: styles.tagLs,
};

/**
 * ToolRow：结构/样式按设计规范 的 `.disc`（docs/06 §6 组件表）
 * （折叠态单行 = 等宽色签 + 摘要省略 + 耗时；展开态 = 淡底详情块；
 *  执行失败时签仍按工具色，标题字改红）。
 */
export function ToolRowView({ row }: { row: ToolRowModel }) {
  const [expanded, setExpanded] = useState(false);
  const errored = row.isError || row.status === 'error';
  const running = row.status === 'running';
  const tone = TAG_TONE[row.toolName] ?? styles.tagOther;

  return (
    <div className={styles.disc}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={styles.discHead}
      >
        <TrailTag tone={tone} mono pulse={running}>
          {row.toolName}
        </TrailTag>
        <span className={cn(styles.discTitle, errored && styles.discTitleError)}>{row.title}</span>
        {row.durationMs !== undefined && (
          <span className={styles.discDur}>{formatDuration(row.durationMs)}</span>
        )}
      </button>
      {expanded && (
        <div className={styles.discInner}>
          {row.images !== undefined && row.images.length > 0 && (
            <div className={styles.discImages}>
              <ChatImageList sources={row.images} />
            </div>
          )}
          <pre className={styles.discInnerPre}>
            {row.argsText}
            {row.output !== null && row.output.length > 0 ? `\n${row.output}` : ''}
          </pre>
        </div>
      )}
    </div>
  );
}
