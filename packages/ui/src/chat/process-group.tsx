import type { ProcessGroupData, TrailItem } from '@ice-ai/client';
import { formatDuration } from '@ice-ai/client';
import { useState } from 'react';
import { TextRowView } from './text-row';
import { SystemRowView, ThinkingRowView } from './thinking-row';
import { ToolRowView } from './tool-row';
import { TrailChevron } from './trail';
import styles from './trail.module.css';

function ProcessItem({ item, streaming }: { item: TrailItem; streaming: boolean }) {
  if (item.kind === 'thinking') return <ThinkingRowView row={item} />;
  if (item.kind === 'tool') return <ToolRowView row={item} />;
  if (item.kind === 'text') return <TextRowView row={item} streaming={streaming} />;
  return <SystemRowView text={item.text} tone={item.tone} />;
}

/**
 * ProcessGroup：结构/样式按设计规范 的 `ProcessDetailsGroup`
 * （纯文字折叠按钮：12px 灰字、箭头 90° 旋转、无描边无底色；
 * 展开内容 = 左导轨 + 一行一个 `.disc` 轨迹行，docs/06 §6）。
 * defaultExpanded = 本轮没拿到回答（中断/报错时展开避免空白，docs/05 §6.5-6）。
 */
export function ProcessGroup({
  group,
  defaultExpanded,
  streaming = false,
}: {
  group: ProcessGroupData;
  defaultExpanded: boolean;
  /** 会话整体是否仍在流式（本轮组内的文本行还在增长） */
  streaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const duration = groupDuration(group);
  const parts = [
    '处理详情',
    `${group.messageCount} 条消息`,
    ...(group.toolCallCount > 0 ? [`${group.toolCallCount} 次工具调用`] : []),
    // 中间轮文本行数：提示这部分正文收在组里（曾因被 final 覆盖而整段丢失，见 docs/05 §6.5）
    ...(group.textCount > 0 ? [`${group.textCount} 段文本`] : []),
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
        <TrailChevron open={expanded} />
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
        <div className={styles.childRail}>
          {group.items.map((item, index) => (
            <ProcessItem
              key={item.kind === 'tool' ? item.toolCallId : `${item.kind}-${index}`}
              item={item}
              streaming={streaming}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 组内总耗时（思考行与工具行的 duration 之和；文本/系统行无耗时） */
function groupDuration(group: ProcessGroupData): number | null {
  const total = group.items.reduce(
    (sum, item) =>
      item.kind === 'tool' || item.kind === 'thinking' ? sum + (item.durationMs ?? 0) : sum,
    0,
  );
  return total > 0 ? total : null;
}
