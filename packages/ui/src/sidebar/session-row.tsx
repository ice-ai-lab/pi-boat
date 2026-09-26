import { formatRelativeTime, sessionDisplayTitle } from '@ice-ai/client';
import type { SessionInfo } from '@ice-ai/protocol';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * SessionRow：会话行 = 标题 + 相对时间/条数 + 运行标记 + 悬停操作（重命名 / 删除 / 复制 id）。
 * 视觉照抄 pi-web `SessionSidebar` 的 `SessionListItem`：定高 54px、左内边距 14、
 * 选中 = `--bg-selected` 底 + 左侧 2px accent 竖条（无圆角、无 hover 圆角块）。
 * 定高由窗口化依赖（见 session-list-window）。
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
      className={active ? 'group/row' : 'group/row hover:bg-bg-hover'}
      style={{
        height: SESSION_ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: 14,
        paddingRight: 8,
        overflow: 'hidden',
        cursor: editing ? 'default' : 'pointer',
        background: active ? 'var(--bg-selected)' : undefined,
        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
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
          style={{
            flex: 1,
            fontSize: 12,
            padding: '5px 8px',
            border: '1px solid var(--accent)',
            borderRadius: 5,
            outline: 'none',
            background: 'var(--bg)',
            color: 'var(--text)',
            height: 30,
          }}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={onSelect}
            aria-current={active}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'block',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              cursor: 'inherit',
              color: 'inherit',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                minWidth: 0,
                fontSize: 12,
                fontWeight: active ? 500 : 400,
                lineHeight: 1.4,
                color: 'var(--text)',
              }}
            >
              {running && (
                <Loader2
                  size={11}
                  className="shrink-0 animate-spin"
                  style={{ color: 'var(--accent)' }}
                />
              )}
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {sessionDisplayTitle(session)}
              </span>
            </div>
            <div
              style={{
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text-dim)',
                fontSize: 11,
                minWidth: 0,
              }}
            >
              <span>{formatRelativeTime(session.modified)}</span>
              <span>{session.messageCount > 0 ? `${session.messageCount} 条` : '0 条'}</span>
              {session.branch !== undefined && (
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {session.branch}
                </span>
              )}
            </div>
          </button>
          <div className="hidden shrink-0 items-center gap-2 group-hover/row:flex">
            {!renameDisabled && (
              <button
                type="button"
                title="重命名"
                aria-label="重命名会话"
                className="flex h-6 shrink-0 items-center justify-center rounded-[5px] px-1.5 text-[10px] text-text-dim hover:bg-bg hover:text-text"
                onClick={() => {
                  setDraft(session.name ?? '');
                  setEditing(true);
                }}
              >
                改名
              </button>
            )}
            <button
              type="button"
              title="复制会话 id"
              aria-label="复制会话 id"
              className="flex h-6 shrink-0 items-center justify-center rounded-[5px] px-1.5 text-[10px] text-text-dim hover:bg-bg hover:text-text"
              onClick={() => {
                void navigator.clipboard?.writeText(session.id).catch(() => {});
              }}
            >
              复制
            </button>
            <button
              type="button"
              title="删除会话"
              aria-label="删除会话"
              className="flex h-6 shrink-0 items-center justify-center rounded-[5px] px-1.5 text-[10px] text-text-dim hover:bg-danger-soft hover:text-danger"
              onClick={onDelete}
            >
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
