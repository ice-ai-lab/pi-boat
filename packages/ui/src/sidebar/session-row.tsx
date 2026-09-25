import { formatRelativeTime, sessionDisplayTitle } from '@ice-ai/client';
import type { SessionInfo } from '@ice-ai/protocol';
import { Copy, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../utils/cn';

/**
 * SessionRow（docs/06 §4.3 inspect 册）：会话行 = 标题 + 相对时间/条数 + 运行标记 +
 * 悬停操作（重命名 / 删除 / 复制 id）。定高 54px（窗口化依赖，见 session-list-window）。
 */
export interface SessionRowProps {
  session: SessionInfo;
  active: boolean;
  running: boolean;
  onSelect(): void;
  onRename(name: string): void;
  onDelete(): void;
  /** 运行中改名要走命令通道，由宿主决定是否禁用 */
  renameDisabled?: boolean;
}

export const SESSION_ROW_HEIGHT = 54;

export function SessionRow({
  session,
  active,
  running,
  onSelect,
  onRename,
  onDelete,
  renameDisabled = false,
}: SessionRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  // 进入重命名态即聚焦（替代 autoFocus：a11y 规则不允许声明式自动聚焦）
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const name = draft.trim();
    setEditing(false);
    if (name.length > 0 && name !== (session.name ?? '')) onRename(name);
  };

  return (
    <div
      className={cn(
        'group/row relative flex flex-col justify-center gap-0.5 rounded-[10px] px-2.5',
        active ? 'bg-accent-weak' : 'hover:bg-hover',
      )}
      style={{ height: SESSION_ROW_HEIGHT }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label="会话名称"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setEditing(false);
          }}
          className="sq w-full bg-surface-raised px-1.5 py-0.5 text-[12.5px] text-fg outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-current={active}
          className="flex w-full flex-col items-start gap-0.5 text-left"
        >
          <span
            className={cn(
              'w-full truncate text-[12.5px] leading-tight',
              active ? 'text-fg' : 'text-fg-muted',
            )}
          >
            {running && <Loader2 size={11} className="mr-1 inline animate-spin text-accent" />}
            {sessionDisplayTitle(session)}
          </span>
          <span className="w-full truncate text-[11px] text-fg-faint">
            {formatRelativeTime(session.modified)}
            {session.messageCount > 0 && ` · ${session.messageCount} 条`}
            {session.branch !== undefined && ` · ${session.branch}`}
          </span>
        </button>
      )}

      <div className="absolute right-1.5 top-1.5 hidden items-center gap-0.5 group-hover/row:flex">
        {!renameDisabled && (
          <button
            type="button"
            title="重命名"
            aria-label="重命名会话"
            className="sq flex h-6 w-6 items-center justify-center text-fg-faint hover:bg-hover hover:text-fg"
            onClick={() => {
              setDraft(session.name ?? '');
              setEditing(true);
            }}
          >
            <Pencil size={12} />
          </button>
        )}
        <button
          type="button"
          title="复制会话 id"
          aria-label="复制会话 id"
          className="sq flex h-6 w-6 items-center justify-center text-fg-faint hover:bg-hover hover:text-fg"
          onClick={() => {
            void navigator.clipboard?.writeText(session.id).catch(() => {});
          }}
        >
          <Copy size={12} />
        </button>
        <button
          type="button"
          title="删除会话"
          aria-label="删除会话"
          className="sq flex h-6 w-6 items-center justify-center text-fg-faint hover:bg-danger-soft hover:text-danger"
          onClick={onDelete}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
