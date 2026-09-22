import type { SessionInfo } from '@ice-ai/protocol';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import { IconButton } from '../primitives/button';

/**
 * 会话列表项（原型 `.session-item` + hover `.ops`，docs/06 §4.3）。
 *
 * 原型用 `<button>` 套 `<span class="icon-btn">`（嵌套可点击元素，HTML 非法且键盘不可达）——
 * 这里拆成「外层 div 定位 + 内层标题 button + 并列的操作 button」（docs/06 §9.2）。
 * 标题取 `name ?? firstMessage`：`name` 是用户命名，`firstMessage` 是磁盘扫描得到的第一条
 * 用户消息（两者都可能为空，兜底给一个显式占位而不是空白）。
 */
export interface SessionListItemProps {
  session: SessionInfo;
  /** 当前打开的会话 */
  active?: boolean;
  running?: boolean;
  /** 相对时间的基准（测试可注入固定时间） */
  now?: Date;
  onSelect: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function SessionListItem({
  session,
  active = false,
  running = false,
  now,
  onSelect,
  onRename,
  onDelete,
  className,
}: SessionListItemProps) {
  const title = session.name ?? session.firstMessage ?? '';
  const hasOps = onRename !== undefined || onDelete !== undefined;

  return (
    <div className={cn('group relative flex-none', className)}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        title={title === '' ? session.id : title}
        className={cn(
          'w-full border-l-2 py-[5px] pl-2.5 pr-1.5 text-left transition-colors',
          active ? 'border-l-accent bg-hover' : 'border-l-transparent hover:bg-hover',
        )}
      >
        <span className="block truncate pr-[22px] text-[13px] leading-5 text-fg">
          {title === '' ? '（无标题会话）' : title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-4 text-fg-faint tabular-nums">
          <span>{formatRelativeTime(session.modified, now)}</span>
          <span>·</span>
          <span>{session.messageCount} 条消息</span>
          {running ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <span className="size-1.5 animate-pulse rounded-full bg-accent" />
              运行中
            </span>
          ) : null}
        </span>
      </button>

      {hasOps ? (
        <span className="absolute right-1 top-1.5 hidden gap-0.5 rounded-md bg-surface-side pl-1 group-hover:flex group-focus-within:flex">
          {onRename === undefined ? null : (
            <IconButton
              icon="pencil"
              title="重命名"
              iconSize={12}
              className="size-[22px]"
              onClick={onRename}
            />
          )}
          {onDelete === undefined ? null : (
            <IconButton
              icon="trash"
              title="删除"
              iconSize={12}
              className="size-[22px] text-danger hover:text-danger"
              onClick={onDelete}
            />
          )}
        </span>
      ) : null}
    </div>
  );
}
