import type { ThinkingRow as ThinkingRowModel } from '@ice-ai/client';
import { ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

/** ThinkingRow（docs/06 §4.2）：流式 shimmer → 定稿折叠行 */
export function ThinkingRowView({ row }: { row: ThinkingRowModel }) {
  return (
    <details className="group sq bg-surface-side/60 py-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 text-[12px]">
        <ChevronRight
          size={12}
          className="shrink-0 text-fg-faint transition-transform group-open:hidden"
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[12px]',
            row.streaming ? 'shimmer' : 'text-fg-subtle',
          )}
        >
          {row.streaming ? (row.text.length > 0 ? row.text.split('\n')[0] : '思考中…') : '思考过程'}
        </span>
      </summary>
      <div className="scrollbar-thin mt-1.5 max-h-60 overflow-auto px-2.5 pb-1.5">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] text-fg-muted">
          {row.text}
        </pre>
      </div>
    </details>
  );
}

/** SystemRow：压缩 / 重试 / 终止等系统提示行 */
export function SystemRowView({ text, tone }: { text: string; tone: 'info' | 'warn' | 'error' }) {
  return (
    <p
      className={cn(
        'sq px-2.5 py-1.5 text-[12px]',
        tone === 'info' && 'bg-surface-side text-fg-subtle',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'error' && 'bg-danger-soft text-danger',
      )}
    >
      {text}
    </p>
  );
}
