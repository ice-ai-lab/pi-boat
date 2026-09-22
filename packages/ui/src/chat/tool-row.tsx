import type { ToolRow as ToolRowData } from '@ice-ai/client';
import { useState } from 'react';
import { CollapseRow, ToolTag } from './collapse-row';
import { DiffView } from './diff-view';

/**
 * 工具行（原型 `.tag.tool.*` + `.disc`，docs/06 §4.2）。
 *
 * 生命周期跨两类事件（docs/05 §6.3 易错点①）：`toolcall_*` 提供标题/参数、
 * `tool_execution_*` 与 toolResult 提供状态/输出——两者都落在同一个 `row` 上。
 *
 * 自动展开/收起：执行中与失败默认展开（用户要看输出/错误），成功后收起；
 * 用户手动操作过则不再被自动切换。
 */
export interface ToolRowProps {
  row: ToolRowData;
}

export function ToolRow({ row }: ToolRowProps) {
  const defaultOpen =
    row.status === 'running' || row.status === 'preparing' || row.status === 'error';
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? defaultOpen;

  return (
    <CollapseRow
      tag={<ToolTag toolName={row.toolName} status={row.status} />}
      title={row.title}
      durationMs={row.durationMs}
      open={open}
      onToggle={setUserOpen}
    >
      {row.diff === undefined ? null : <DiffView diff={row.diff} />}
      {row.output === null || row.output === '' ? (
        row.status === 'running' ? (
          <span className="shimmer">执行中…</span>
        ) : null
      ) : (
        <div className={row.diff === undefined ? undefined : 'mt-2'}>{row.output}</div>
      )}
      {row.args !== undefined && JSON.stringify(row.args) !== '{}' && row.output === null ? (
        <div className="mt-2 opacity-70">{JSON.stringify(row.args, null, 2)}</div>
      ) : null}
    </CollapseRow>
  );
}
