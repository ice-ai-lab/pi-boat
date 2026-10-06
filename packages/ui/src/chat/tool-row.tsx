import type { ToolRow as ToolRowModel } from '@ice-ai/client';
import { formatDuration, getLanguageFromPath } from '@ice-ai/client';
import { useState } from 'react';
import { CodeRuns } from '../code/code-runs';
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
 * 工具输出的 shiki 语言（F5）：只按形态能确定的才高亮——
 * `read` 的标题是文件路径，`bash` 是命令行产物，`edit` 吐 patch；其余（grep/find/ls 的表格文本）保持纯文本。
 */
function outputLanguage(row: ToolRowModel): string | undefined {
  if (row.output === null || row.output.length === 0) return undefined;
  if (row.toolName === 'read') {
    const language = getLanguageFromPath(row.title);
    return language === 'text' ? undefined : language;
  }
  if (row.toolName === 'bash') return 'bash';
  if (row.toolName === 'edit') return 'diff';
  return undefined;
}

/**
 * 展开态详情块（淡底）。单独一个组件是为了让高亮 hook 只在展开时跑：
 * 长会话里折叠的工具有几百条，不能为它们各自算一遍高亮。
 */
function ToolRowDetail({ row }: { row: ToolRowModel }) {
  const output = row.output;
  const hasOutput = output !== null && output.length > 0;

  return (
    <div className={styles.discInner}>
      {row.images !== undefined && row.images.length > 0 && (
        <div className={styles.discImages}>
          <ChatImageList sources={row.images} />
        </div>
      )}
      <pre className={styles.discInnerPre}>
        {/* 参数原文是 JSON（流式中可能是半截 JSON，shiki 认得下） */}
        <CodeRuns code={row.argsText} language="json" />
        {hasOutput && (
          <>
            {'\n'}
            <CodeRuns code={output} language={outputLanguage(row)} />
          </>
        )}
      </pre>
    </div>
  );
}

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
      {expanded && <ToolRowDetail row={row} />}
    </div>
  );
}
