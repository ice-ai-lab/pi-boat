import type { SessionInfo } from '@ice-ai/protocol';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import { Icon } from '../primitives/icon';

/**
 * 会话列表项（原型 `.session-item` + hover `.ops`）。
 *
 * 原型用 `<button>` 套 `<span class="icon-btn">`（嵌套可点击元素，HTML 非法且键盘不可达）——
 * 这里拆成「外层 div 定位 + 内层标题 button + 并列的操作 button」，视觉类名与原型一致。
 * 标题取 `name ?? firstMessage`，两者都空时给显式占位而不是空白。
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
    <div className={cn('session-item sq', active && 'active', className)}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        title={title === '' ? session.id : title}
        className="block w-full text-left"
      >
        <div className="st">{title === '' ? '（无标题会话）' : title}</div>
        <div className="sm">
          <span className="num">{formatRelativeTime(session.modified, now)}</span>
          <span>·</span>
          <span className="num">{session.messageCount} 条消息</span>
          {running ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <span className="run" />
              运行中
            </span>
          ) : null}
        </div>
      </button>

      {hasOps ? (
        <span className="ops">
          {onRename === undefined ? null : (
            <button
              type="button"
              className="icon-btn"
              title="重命名"
              aria-label="重命名会话"
              onClick={onRename}
            >
              <Icon name="pencil" size={12} />
            </button>
          )}
          {onDelete === undefined ? null : (
            <button
              type="button"
              className="icon-btn"
              title="删除"
              aria-label="删除会话"
              style={{ color: 'var(--red)' }}
              onClick={onDelete}
            >
              <Icon name="trash" size={12} />
            </button>
          )}
        </span>
      ) : null}
    </div>
  );
}
