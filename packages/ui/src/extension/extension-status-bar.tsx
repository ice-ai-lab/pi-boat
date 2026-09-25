import type { ExtensionStatusItem } from '@ice-ai/protocol';
import { cn } from '../utils/cn';

/**
 * ExtensionStatusBar（docs/06 §4.4 / ADR-0012）：扩展上报的状态项（状态栏短文本）。
 * 只展示——写状态的是扩展自己经 SDK 的 setStatus，前端仅订阅 `extensionStatuses`。
 */
export function ExtensionStatusBar({ statuses }: { statuses: ExtensionStatusItem[] }) {
  if (statuses.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-1">
      {statuses.map((status) => (
        <span
          key={status.statusKey}
          className={cn('sq bg-surface-side px-1.5 py-0.5 text-[10.5px] text-fg-subtle')}
          title={status.statusText}
        >
          {status.statusText}
        </span>
      ))}
    </div>
  );
}
