import type { SessionInfo } from '@ice-ai/protocol';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import { Icon } from '../primitives/icon';

/**
 * 会话列表项（原型 `.sess` + `.st`/`.sm` + 运行态 `.spin`）。
 *
 * 原型用 `<button>` 套操作钮（嵌套可点击元素，HTML 非法且键盘不可达）——
 * 拆成「外层 div 定位 + 内层标题 button + 并列的 `.ops` 操作 button」，视觉与原型一致。
 * 标题取 `name ?? firstMessage`，两者都空时给显式占位而不是空白。
 */
export interface SessionListItemProps {
  session: SessionInfo;
  /** 当前打开的会话（`.on`：左侧 2px 选中条 + 选中底色） */
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
    <div className={cn('sess', active && 'on', className)}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        title={title === '' ? session.id : title}
        style={{ display: 'block', width: '100%', textAlign: 'left' }}
      >
        <div className="st">
          {running ? (
            <svg className="spin" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="5.4" />
            </svg>
          ) : null}
          {title === '' ? '（无标题会话）' : title}
        </div>
        <div className="sm">
          {running ? (
            <span>进行中</span>
          ) : (
            <span className="num">{formatRelativeTime(session.modified, now)}</span>
          )}
          <span>·</span>
          <span className="num">{session.messageCount} 条消息</span>
        </div>
      </button>
      {hasOps ? (
        <span className="ops">
          {onRename === undefined ? null : (
            <button
              type="button"
              className="ico-btn"
              style={{ width: 22, height: 22 }}
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
              className="ico-btn"
              style={{ width: 22, height: 22, color: 'var(--k-err)' }}
              title="删除"
              aria-label="删除会话"
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
