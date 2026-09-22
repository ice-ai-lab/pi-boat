import type { ThinkingRow as ThinkingRowData } from '@ice-ai/client';
import { useState } from 'react';
import { CollapseRow, ThinkTag } from './collapse-row';

/**
 * 思考行（原型 `.tag.think` + `.disc-title.plain` + `.shimmer` 流式态）。
 *
 * 自动展开/收起（docs/06 §8.1）：流式中默认展开，结束默认收起；
 * **用户手动展开过的不被自动收起覆盖**（`userOpen !== null` 即锁定）。
 */
export interface ThinkingRowProps {
  row: ThinkingRowData;
}

export function ThinkingRow({ row }: ThinkingRowProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? row.streaming;
  const title = firstLine(row.text) || '思考中…';
  return (
    <CollapseRow
      tag={<ThinkTag />}
      title={row.streaming ? <span className="shimmer">{title}</span> : title}
      durationMs={row.durationMs}
      open={open}
      onToggle={setUserOpen}
      body={row.text}
    />
  );
}

function firstLine(text: string): string {
  const line = text.split('\n')[0]?.trim() ?? '';
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}
