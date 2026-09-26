import type { ThinkingRow as ThinkingRowModel } from '@ice-ai/client';
import { useState } from 'react';
import { cn } from '../utils/cn';

/** pi-web `ThinkingIcon`（折叠态 = 暗色灯泡；展开 = 高亮灯泡） */
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
        stroke={active ? '#d4a017' : undefined}
        fill={active ? 'rgba(250, 204, 21, 0.18)' : 'none'}
        style={{ filter: active ? 'drop-shadow(0 0 2px rgba(250, 204, 21, 0.35))' : 'none' }}
      />
      <line x1="7" y1="18" x2="12" y2="18" />
      <line x1="8" y1="21" x2="11" y2="21" />
    </svg>
  );
}

/**
 * ThinkingRow：结构/样式照抄 pi-web `MessageView.tsx` 的 `ThinkingBlock`
 * （1px 描边 + 7px 圆角 + mono 11px；折叠态单行省略，展开态换行全文）。
 */
export function ThinkingRowView({ row }: { row: ThinkingRowModel }) {
  const [expanded, setExpanded] = useState(false);
  const preview = row.text.split('\n').find((line) => line.trim().length > 0) ?? '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        minWidth: 0,
        border: '1px solid var(--border)',
        borderRadius: 7,
        padding: '6px 10px',
        background: 'var(--bg)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'calc(11px + var(--chat-font-size-offset, 0px))',
        lineHeight: 1.5,
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`思考${preview.length > 0 ? `: ${preview}` : ''}`}
        title="思考"
        onClick={() => setExpanded((value) => !value)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          width: expanded ? 14 : '100%',
          flexShrink: expanded ? 0 : 1,
          minWidth: 0,
          minHeight: '1.5em',
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
        }}
      >
        <ThinkingIcon active={expanded} />
        {!expanded && (
          <span
            className={cn(row.streaming && 'shimmer')}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {preview.length > 0 ? preview : '思考中…'}
          </span>
        )}
      </button>
      {expanded && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            color: row.streaming ? 'var(--accent)' : 'var(--text-muted)',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {row.text}
        </div>
      )}
    </div>
  );
}

/** SystemRow：压缩 / 重试 / 终止等系统提示行（pi-web 的窄条提示块） */
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
