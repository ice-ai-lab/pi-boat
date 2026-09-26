import type { ToolRow as ToolRowModel } from '@ice-ai/client';
import { formatDuration } from '@ice-ai/client';
import { useState } from 'react';

/**
 * ToolRow：结构/样式照抄 pi-web `MessageView.tsx` 的 `ToolCallBlock`
 * （工具名等宽色签 + 摘要单行省略 + 耗时 + 折叠箭头；成功绿/失败红 1px 描边与淡底）。
 * 展开态 = 入参 pre（`--bg-subtle` 底 + 对应色上边线）。
 */
export function ToolRowView({ row }: { row: ToolRowModel }) {
  const [expanded, setExpanded] = useState(false);
  const errored = row.isError || row.status === 'error';
  const running = row.status === 'running';
  const accent = errored ? '#f87171' : running ? 'var(--accent)' : '#16a34a';

  return (
    <div
      style={{
        borderRadius: 7,
        overflow: 'hidden',
        fontSize: 12,
        border: errored ? '1px solid rgba(248,113,113,0.45)' : '1px solid rgba(34,197,94,0.25)',
        background: errored ? 'rgba(248,113,113,0.05)' : 'rgba(34,197,94,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            flex: 1,
            minWidth: 0,
            padding: '6px 10px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            textAlign: 'left',
          }}
        >
          <span
            className={running ? 'shimmer' : undefined}
            style={{
              color: accent,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            {row.toolName}
          </span>
          <span
            style={{
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {row.title}
          </span>
          {row.durationMs !== undefined && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-dim)',
                flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDuration(row.durationMs)}
            </span>
          )}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              flexShrink: 0,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
            aria-hidden="true"
          >
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>
      </div>
      {expanded && (
        <pre
          style={{
            margin: 0,
            padding: '8px 10px',
            color: 'var(--text-muted)',
            fontSize: 'calc(12px + var(--chat-font-size-offset, 0px))',
            lineHeight: 1.5,
            overflow: 'auto',
            maxHeight: 480,
            background: 'var(--bg-subtle)',
            borderTop: errored
              ? '1px solid rgba(248,113,113,0.25)'
              : '1px solid rgba(34,197,94,0.2)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {row.argsText}
          {row.output !== null && row.output.length > 0 ? `\n${row.output}` : ''}
        </pre>
      )}
    </div>
  );
}
