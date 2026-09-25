import type { ProcessGroupData, TrailItem } from '@ice-ai/client';
import { formatDuration } from '@ice-ai/client';
import { ChevronRight } from 'lucide-react';
import { SystemRowView, ThinkingRowView } from './thinking-row';
import { ToolRowView } from './tool-row';

function ProcessItem({ item }: { item: TrailItem }) {
  if (item.kind === 'thinking') return <ThinkingRowView row={item} />;
  if (item.kind === 'tool') return <ToolRowView row={item} />;
  return <SystemRowView text={item.text} tone={item.tone} />;
}

/**
 * ProcessGroup（docs/06 §4.2）：「处理详情 · N 条消息 · M 次工具调用」收拢壳。
 * defaultExpanded = 本轮没拿到回答（中断/报错时展开避免空白，docs/05 §6.5-6）。
 */
export function ProcessGroup({
  group,
  defaultExpanded,
}: {
  group: ProcessGroupData;
  defaultExpanded: boolean;
}) {
  const duration = groupDuration(group);
  return (
    <details className="group/g sq hairline border-line-1 py-1.5" open={defaultExpanded}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 text-[12px] text-fg-subtle">
        <ChevronRight size={12} className="shrink-0 transition-transform group-open/g:rotate-90" />
        <span>
          处理详情 · {group.messageCount} 条消息
          {group.toolCallCount > 0 && ` · ${group.toolCallCount} 次工具调用`}
          {duration !== null && ` · ${formatDuration(duration)}`}
        </span>
      </summary>
      <div className="ml-3 mt-1.5 flex flex-col gap-1.5 border-l border-line-2 pl-2.5">
        {group.items.map((item, index) => (
          <ProcessItem
            key={item.kind === 'tool' ? item.toolCallId : `${item.kind}-${index}`}
            item={item}
          />
        ))}
      </div>
    </details>
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
