import type { ProcessGroupData, SystemRow as SystemRowData, TrailRow } from '@ice-ai/client';
import { useState } from 'react';
import { CollapseRow } from './collapse-row';
import { ThinkingRow } from './thinking-row';
import { ToolRow } from './tool-row';

/**
 * 过程组（原型 `.group-disc` + `.child-rail` 左导轨 + `.gtitle` 汇总标题）。
 *
 * `defaultExpanded = 本轮没拿到回答`（中断/报错时默认展开，避免点开一片空白）；
 * 用户手动操作过则不再自动切换。系统行不吸入组内（见 client 的 `groupTrail`）。
 */
export interface ProcessGroupProps {
  group: ProcessGroupData;
  /** 本轮是否有最终回答（无回答 → 默认展开） */
  hasFinal: boolean;
}

export function ProcessGroup({ group, hasFinal }: ProcessGroupProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? !hasFinal;
  const summary = [
    '处理详情',
    `${group.messageCount} 条消息`,
    `${group.toolCallCount} 次工具调用`,
  ].join(' · ');
  return (
    <CollapseRow
      asGroup
      title={summary}
      titleClassName="gtitle"
      durationMs={group.durationMs}
      open={open}
      onToggle={setUserOpen}
    >
      {group.items.map((item) => (
        <TrailRowView key={item.id} row={item} />
      ))}
    </CollapseRow>
  );
}

/** 组外的系统行（压缩 / 重试 / 终止）——正文分隔条，始终可见（原型未画，M1 新增） */
export function SystemRow({ row }: { row: SystemRowData }) {
  const tone =
    row.tone === 'error' ? 'text-danger' : row.tone === 'warn' ? 'text-warn' : 'text-fg-subtle';
  return (
    <div className={`flex items-center gap-2 py-1 text-[12px] ${tone}`}>
      <span className="h-[0.5px] flex-1 bg-line-2" />
      <span className="max-w-[80%] whitespace-pre-wrap text-center">{row.text}</span>
      <span className="h-[0.5px] flex-1 bg-line-2" />
    </div>
  );
}

/** 轨迹行分发（组内渲染） */
export function TrailRowView({ row }: { row: TrailRow }) {
  if (row.kind === 'thinking') return <ThinkingRow row={row} />;
  if (row.kind === 'tool') return <ToolRow row={row} />;
  if (row.kind === 'text')
    return <p className="px-2 text-[12px] leading-[18px] text-fg-muted">{row.text}</p>;
  return <SystemRow row={row} />;
}
