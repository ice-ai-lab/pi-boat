import type { ThinkingRow as ThinkingRowModel } from '@ice-ai/client';
import { formatDuration } from '@ice-ai/client';
import { useState } from 'react';
import { cn } from '../utils/cn';
import { TrailTag } from './trail';
import styles from './trail.module.css';

/** 设计规范 `ThinkingIcon`（折叠态 = 暗色灯泡；展开 = 高亮灯泡） */
function ThinkingIcon({ active, size = 14 }: { active: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M9.5 2A5.5 5.5 0 0 0 4 7.5c0 1.7.78 3.21 2 4.21V14a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.29c1.22-1 2-2.51 2-4.21A5.5 5.5 0 0 0 9.5 2z"
        stroke={active ? 'var(--amber)' : undefined}
        fill={active ? 'rgba(250, 204, 21, 0.18)' : 'none'}
        style={{ filter: active ? 'drop-shadow(0 0 2px rgba(250, 204, 21, 0.35))' : 'none' }}
      />
      <line x1="7" y1="18" x2="12" y2="18" />
      <line x1="8" y1="21" x2="11" y2="21" />
    </svg>
  );
}

/**
 * ThinkingRow：结构/样式按设计规范 的 `.disc`（docs/06 §6 组件表）
 * （折叠态单行 = 「思考」签 + 首行预览省略 + 耗时；
 *  展开态 = 与标题合并成同一枚淡底卡片：灯泡 + 全文，不另挂详情块）。
 */
export function ThinkingRowView({ row }: { row: ThinkingRowModel }) {
  const [expanded, setExpanded] = useState(false);
  const preview = row.text.split('\n').find((line) => line.trim().length > 0) ?? '';
  const duration = row.durationMs === undefined ? null : formatDuration(row.durationMs);

  return (
    <div className={styles.disc}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`思考${preview.length > 0 ? `: ${preview}` : ''}`}
        title={expanded ? '收起思考' : '展开思考'}
        onClick={() => setExpanded((value) => !value)}
        className={cn(styles.discHead, expanded && styles.discHeadOpen)}
      >
        {expanded ? (
          <>
            <span className={styles.thinkIcon}>
              <ThinkingIcon active size={13} />
            </span>
            <span className={styles.thinkText}>{row.text}</span>
          </>
        ) : (
          <>
            <TrailTag icon={<ThinkingIcon active={false} size={11} />}>思考</TrailTag>
            <span
              className={cn(styles.discTitle, styles.discTitlePlain, row.streaming && 'shimmer')}
            >
              {preview.length > 0 ? preview : '思考中…'}
            </span>
          </>
        )}
        {duration !== null && <span className={styles.discDur}>{duration}</span>}
      </button>
    </div>
  );
}

/** SystemRow：压缩 / 重试 / 终止等系统提示行（设计规范的窄条提示块） */
export function SystemRowView({ text, tone }: { text: string; tone: 'info' | 'warn' | 'error' }) {
  const color =
    tone === 'warn' ? 'var(--amber)' : tone === 'error' ? 'var(--red)' : 'var(--text-muted)';
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 7,
        padding: '6px 10px',
        background: 'var(--bg-subtle)',
        color,
        fontFamily: 'var(--font-mono)',
        fontSize: 'calc(11px + var(--chat-font-size-offset, 0px))',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      }}
    >
      {text}
    </div>
  );
}
