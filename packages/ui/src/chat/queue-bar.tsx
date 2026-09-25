import { cn } from '../utils/cn';

/**
 * QueueBar（docs/06 §4.2）：排队消息条——steering（插队）与 followUp（收尾后追问）两组。
 * 数据来自 `queue_update` 事件（fold 已折叠进 chat.queued）。
 */
export interface QueueBarProps {
  steering: string[];
  followUp: string[];
  onClear(): void;
}

export function QueueBar({ steering, followUp, onClear }: QueueBarProps) {
  if (steering.length === 0 && followUp.length === 0) return null;
  return (
    <div className="mx-auto flex w-(--chat-w) max-w-full flex-col gap-1 px-5 pb-1">
      {steering.length > 0 && <QueueGroup label="插队" items={steering} tone="accent" />}
      {followUp.length > 0 && <QueueGroup label="追问" items={followUp} tone="muted" />}
      <button
        type="button"
        onClick={onClear}
        className="sq self-start px-1.5 py-0.5 text-[10.5px] text-fg-faint hover:bg-hover hover:text-fg"
      >
        清空队列
      </button>
    </div>
  );
}

function QueueGroup({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'accent' | 'muted';
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={cn(
          'sq mt-0.5 shrink-0 px-1.5 py-0.5 text-[10.5px]',
          tone === 'accent' ? 'bg-accent-weak text-accent' : 'bg-surface-side text-fg-subtle',
        )}
      >
        {label} {items.length}
      </span>
      <ul className="min-w-0 flex-1">
        {items.map((item) => (
          // 队列内文本可能重复（用户连发同一句话），故用内容本身作 key（React 只要求兄弟间唯一）
          <li key={item} className="truncate text-[11.5px] text-fg-faint">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
