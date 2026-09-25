import type { ToolRow as ToolRowModel } from '@ice-ai/client';
import { formatDuration } from '@ice-ai/client';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

/** 工具名 → 色 token（docs/06 §7；不许组件内写死颜色） */
const TOOL_COLOR: Record<string, string> = {
  bash: 'bg-tool-bash/12 text-tool-bash',
  read: 'bg-tool-read/12 text-tool-read',
  edit: 'bg-tool-edit/12 text-tool-edit',
  write: 'bg-tool-edit/12 text-tool-edit',
};

export function toolTagClass(toolName: string, isError: boolean): string {
  if (isError) return 'bg-tool-err/12 text-tool-err';
  return TOOL_COLOR[toolName] ?? 'bg-warn-soft text-warn';
}

/** ToolTag（docs/06 §4.2）：工具名色签 + 状态图标 */
export function ToolTag({ row }: { row: ToolRowModel }) {
  return (
    <span
      className={cn(
        'sq inline-flex h-5 shrink-0 items-center gap-1 px-1.5 font-mono text-[11px] leading-none',
        toolTagClass(row.toolName, row.isError),
      )}
    >
      {row.status === 'running' && <Loader2 size={11} className="animate-spin" />}
      {row.status === 'error' && <AlertTriangle size={11} />}
      {row.status === 'ok' && row.output !== null && <Check size={11} />}
      {row.toolName}
    </span>
  );
}

/** ToolRow（docs/06 §4.2 CollapseRow 的工具实例）：tag + 摘要 + 耗时 + 折叠输出 */
export function ToolRowView({ row }: { row: ToolRowModel }) {
  const errored = row.isError || row.status === 'error';
  return (
    <details className="group/tool sq hairline border-line-1 bg-surface-side/60 py-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 text-[12px]">
        <ToolTag row={row} />
        <span className="min-w-0 flex-1 truncate font-mono text-fg-muted">{row.title}</span>
        {row.durationMs !== undefined && (
          <span className="shrink-0 font-mono text-[10.5px] text-fg-faint">
            {formatDuration(row.durationMs)}
          </span>
        )}
      </summary>
      <div className="scrollbar-thin mt-1.5 max-h-60 overflow-auto px-2.5 pb-1.5">
        {row.argsText.length > 0 && (
          <pre
            className={cn(
              'mb-1.5 whitespace-pre-wrap break-all font-mono text-[11.5px] leading-[1.55]',
              errored ? 'text-danger' : 'text-fg-subtle',
            )}
          >
            {row.argsText}
          </pre>
        )}
        {row.output !== null && row.output.length > 0 && (
          <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] leading-[1.55] text-fg-muted">
            {row.output}
          </pre>
        )}
      </div>
    </details>
  );
}
