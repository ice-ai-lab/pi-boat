import type { ProcessGroupData, TrailItem } from '@ice-ai/client';
import { formatDuration } from '@ice-ai/client';
import { useState } from 'react';
import { SystemRowView, ThinkingRowView } from './thinking-row';
import { ToolRowView } from './tool-row';

function ProcessItem({ item }: { item: TrailItem }) {
  if (item.kind === 'thinking') return <ThinkingRowView row={item} />;
  if (item.kind === 'tool') return <ToolRowView row={item} />;
  return <SystemRowView text={item.text} tone={item.tone} />;
}

/**
 * ProcessGroup：结构/样式按设计规范 的 `ProcessDetailsGroup`
 * （纯文字折叠按钮：12px mono-ish、箭头 90° 旋转、无描边无底色；展开内容 marginTop 8）。
 * defaultExpanded = 本轮没拿到回答（中断/报错时展开避免空白，docs/05 §6.5-6）。
 */
export function ProcessGroup({
  group,
  defaultExpanded,
}: {
  group: ProcessGroupData;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const duration = groupDuration(group);
  const parts = [
    '处理详情',
    `${group.messageCount} 条消息`,
    ...(group.toolCallCount > 0 ? [`${group.toolCallCount} 次工具调用`] : []),
    ...(duration !== null ? [formatDuration(duration)] : []),
  ];

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        title={expanded ? '收起处理详情' : '展开处理详情'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: 'auto',
          minHeight: 24,
          padding: '2px 0',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 12,
          textAlign: 'left',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            flexShrink: 0,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
          aria-hidden="true"
        >
          <polyline points="4 2.5 7.5 6 4 9.5" />
        </svg>
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {parts.join(' · ')}
        </span>
      </button>
      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {group.items.map((item, index) => (
            <ProcessItem
              key={item.kind === 'tool' ? item.toolCallId : `${item.kind}-${index}`}
              item={item}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 组内总耗时（子项 duration 之和；无数据返回 null） */
export function groupDuration(group: ProcessGroupData): number | null {
  const total = group.items.reduce(
    (sum, item) =>
      item.kind === 'tool' && item.durationMs !== undefined ? sum + item.durationMs : sum,
    0,
  );
  return total > 0 ? total : null;
}
