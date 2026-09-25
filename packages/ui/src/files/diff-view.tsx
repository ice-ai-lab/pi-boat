import { parseUnifiedDiff } from '@ice-ai/client';
import { useMemo } from 'react';
import { cn } from '../utils/cn';

/**
 * DiffView（docs/06 §4.2/§4.3）：unified diff 行渲染（行号 + `+`/`-`/上下文前缀）。
 * 无需 diff 库：patch 由服务端给（git diff），解析是纯函数（client/files/unified-diff）。
 */
export interface DiffViewProps {
  patch: string;
  /** 空 patch 时的提示 */
  emptyHint?: string;
  className?: string;
}

export function DiffView({ patch, emptyHint = '没有改动', className }: DiffViewProps) {
  const parsed = useMemo(() => parseUnifiedDiff(patch), [patch]);

  if (parsed.rows.length === 0) {
    return <p className={cn('px-3 py-3 text-[12px] text-fg-faint', className)}>{emptyHint}</p>;
  }

  return (
    <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-auto', className)}>
      <div className="hairline-b sticky top-0 z-10 flex items-center gap-3 border-line-2 bg-surface-raised px-3 py-1.5 text-[11.5px]">
        <span className="text-success">+{parsed.additions}</span>
        <span className="text-danger">-{parsed.deletions}</span>
      </div>
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.6]">
        <tbody>
          {parsed.rows.map((row, index) => {
            if (row.kind === 'hunk') {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: patch 变化时整表重算，位置即身份
                <tr key={index} className="bg-surface-side">
                  <td colSpan={3} className="px-3 py-1 text-[11px] text-fg-subtle">
                    {row.header}
                  </td>
                </tr>
              );
            }
            if (row.kind === 'meta') {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                <tr key={index}>
                  <td colSpan={3} className="px-3 py-0.5 text-[11px] text-fg-faint">
                    {row.text}
                  </td>
                </tr>
              );
            }
            const tone =
              row.kind === 'add'
                ? 'bg-success-soft text-fg'
                : row.kind === 'remove'
                  ? 'bg-danger-soft text-fg'
                  : 'text-fg-muted';
            const marker = row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' ';
            const oldNo = row.kind === 'add' ? '' : row.oldLine;
            const newNo = row.kind === 'remove' ? '' : row.newLine;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上
              <tr key={index} className={tone}>
                <td className="w-px select-none border-r border-line-1 px-2 text-right text-[11px] text-fg-faint">
                  {oldNo}
                </td>
                <td className="w-px select-none border-r border-line-1 px-2 text-right text-[11px] text-fg-faint">
                  {newNo}
                </td>
                <td className="whitespace-pre px-3">
                  <span className="select-none text-fg-faint">{marker}</span>
                  {row.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
