import type { ProcessGroupData, SystemRow as SystemRowData, TrailRow } from '@ice-ai/client';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';
import { CollapseRow } from './collapse-row';
import { ThinkingRow } from './thinking-row';
import { ToolRow } from './tool-row';

/**
 * 过程组（原型 `.grp` + `.grp-head`(.gtitle/.gmeta) + `.grp-body` > `.grp-kids` > `.child-rail`）。
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
  const duration = formatDuration(group.durationMs);
  const meta = [`${group.toolCallCount} 步`, ...(duration === null ? [] : [duration])].join(' · ');
  return (
    <CollapseRow asGroup title="处理详情" meta={`· ${meta}`} open={open} onToggle={setUserOpen}>
      <div className="child-rail">
        {group.items.map((item) => (
          <TrailRowView key={item.id} row={item} />
        ))}
      </div>
    </CollapseRow>
  );
}

/** 组外的系统行（压缩 / 重试 / 终止）——正文分隔条，始终可见（原型未画，M1 新增） */
export function SystemRow({ row }: { row: SystemRowData }) {
  const tone = row.tone === 'error' ? 'err' : row.tone === 'warn' ? 'warn' : undefined;
  return (
    <div className={cn('sys-row', tone)}>
      <span className="rule" />
      <span className="txt">{row.text}</span>
      <span className="rule" />
    </div>
  );
}

/** 轨迹行分发（组内渲染） */
export function TrailRowView({ row }: { row: TrailRow }) {
  if (row.kind === 'thinking') return <ThinkingRow row={row} />;
  if (row.kind === 'tool') return <ToolRow row={row} />;
  if (row.kind === 'text') return <div className="text-row">{row.text}</div>;
  return <SystemRow row={row} />;
}
