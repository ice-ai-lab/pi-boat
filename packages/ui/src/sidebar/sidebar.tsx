import type { SessionInfo } from '@ice-ai/protocol';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { formatRelativeTime } from '../i18n/format';
import { useI18n } from '../i18n/i18n-provider';
import { DirectoryPicker } from '../settings/directory-picker';
import { SessionSearch } from './session-search';

/** 会话列表固定行高：窗口化渲染只挂可见切片（pi-web `SESSION_LIST_ITEM_HEIGHT`） */
const SESSION_LIST_ITEM_HEIGHT = 54;

export function getSessionListIndices(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  focusedIndex = -1,
): number[] {
  const overscan = 8;
  const visibleCount = Math.ceil((viewportHeight || 600) / SESSION_LIST_ITEM_HEIGHT) + overscan * 2;
  const start = Math.max(
    0,
    Math.min(Math.floor(scrollTop / SESSION_LIST_ITEM_HEIGHT) - overscan, count - visibleCount),
  );
  const end = Math.min(count, start + visibleCount);
  const indices = Array.from({ length: end - start }, (_, offset) => start + offset);
  // 焦点行保持挂载，避免滚动把行内重命名卸掉
  if (focusedIndex >= 0 && focusedIndex < start) indices.unshift(focusedIndex);
  if (focusedIndex >= end && focusedIndex < count) indices.push(focusedIndex);
  return indices;
}

/** pi-web `SessionSidebar` 的 26×26 工具条图标按钮原语（T2-6） */
function ToolbarIconButton({
  onClick,
  title,
  disabled,
  skipHover,
  color,
  background = 'none',
  marginRight,
  ariaPressed,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  skipHover?: boolean;
  color: string;
  background?: string;
  marginRight?: number;
  ariaPressed?: boolean;
  children: ReactNode;
}) {
  const enter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || skipHover) return;
    e.currentTarget.style.color = 'var(--text-muted)';
    e.currentTarget.style.background = 'var(--bg-hover)';
  };
  const leave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || skipHover) return;
    e.currentTarget.style.color = color;
    e.currentTarget.style.background = background;
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={ariaPressed}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        padding: 0,
        marginRight,
        background,
        border: 'none',
        color,
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: 5,
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
        transition: 'color 0.3s, background 0.3s',
      }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {children}
    </button>
  );
}

/** 家目录前缀替换为 ~（pi-web `displayCwd`；不做路径截断——截断交给 PathLabel） */
export function displayCwd(cwd: string, homeDir?: string): string {
  return homeDir && cwd.startsWith(homeDir) ? `~${cwd.slice(homeDir.length)}` : cwd;
}

/**
 * 左省略路径标签（pi-web `PathLabel`）：rtl 容器把省略号挪到左缘，
 * 内层 plaintext 双向隔离保证路径本身严格从左到右渲染。
 */
function PathLabel({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'block',
        minWidth: 0,
        lineHeight: 1.35,
        direction: 'rtl',
        textAlign: 'left',
        ...style,
      }}
    >
      <span style={{ unicodeBidi: 'plaintext' }}>{text}</span>
    </span>
  );
}

const DROPDOWN_ANIMATION_MS = 140;

function AnimatedDropdown({
  open,
  children,
  style,
}: {
  open: boolean;
  children: ReactNode;
  style: CSSProperties;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    let frame: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (open) {
      setMounted(true);
      setVisible(false);
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      timeout = setTimeout(() => setMounted(false), DROPDOWN_ANIMATION_MS);
    }

    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.96)',
        transformOrigin: 'top center',
        transition: `opacity ${DROPDOWN_ANIMATION_MS}ms ease, transform ${DROPDOWN_ANIMATION_MS}ms ease`,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {children}
    </div>
  );
}

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

function useScramble(target: string, running: boolean): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const iterRef = useRef(0);

  useEffect(() => {
    if (!running) {
      setDisplay(target);
      return;
    }
    iterRef.current = 0;
    const totalFrames = target.length * 4;

    const step = () => {
      iterRef.current += 1;
      const progress = iterRef.current / totalFrames;
      const resolved = Math.floor(progress * target.length);

      setDisplay(
        target
          .split('')
          .map((char, i) => {
            if (char === ' ') return ' ';
            if (i < resolved) return char;
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join(''),
      );

      if (iterRef.current < totalFrames) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, running]);

  return display;
}

/** 品牌字标：`Pi Web`，点击切换显示版本号（带字符扰乱动画，T2-15） */
function PiWebTitle({ versionLabel }: { versionLabel: string }) {
  const [showVersion, setShowVersion] = useState(false);
  const [scrambling, setScrambling] = useState(false);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = showVersion ? versionLabel : 'Pi Web';
  const display = useScramble(target, scrambling);

  const triggerScramble = useCallback((toVersion: boolean) => {
    setShowVersion(toVersion);
    setScrambling(true);
    setTimeout(() => setScrambling(false), (toVersion ? 6 : 8) * 4 * (1000 / 60) + 100);
  }, []);

  const handleClick = useCallback(() => {
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current);

    const next = !showVersion;
    triggerScramble(next);

    if (next) {
      revertTimerRef.current = setTimeout(() => triggerScramble(false), 3000);
    }
  }, [showVersion, triggerScramble]);

  useEffect(
    () => () => {
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'default',
        fontWeight: 700,
        fontSize: 15,
        letterSpacing: '-0.01em',
        color: showVersion ? 'var(--accent)' : 'var(--text)',
        fontFamily: 'var(--font-mono)',
        minWidth: '6ch',
      }}
    >
      {display}
    </button>
  );
}

function RunningSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      role="img"
      title={t('sidebar.agentRunning')}
      aria-label={t('sidebar.agentRunning')}
      style={{
        width: 14,
        height: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--accent)',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <g>
          <path
            d="M21 12a9 9 0 1 1-3.8-7.4"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </g>
      </svg>
    </span>
  );
}

function UnreadSessionIndicator() {
  const { t } = useI18n();
  return (
    <span
      role="img"
      title={t('sidebar.newActivity')}
      aria-label={t('sidebar.newSessionActivity')}
      style={{
        width: 14,
        height: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#0891b2',
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        <circle cx="7" cy="7" r="2.5" fill="currentColor" />
        <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" opacity="0.32">
          <animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite" />
          <animate
            attributeName="opacity"
            values="0.32;0;0.32"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </span>
  );
}

/** 项目下拉里的活动徽标（运行计数 + 未读计数，pi-web `showProjectActivity`） */
function showProjectActivity(
  activity: { running: number; unread: number } | undefined,
  t: (key: string) => string,
): ReactNode {
  if (!activity || (activity.running === 0 && activity.unread === 0)) return null;
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 6 }}
    >
      {activity.running > 0 && (
        <span
          role="img"
          title={t('sidebar.agentRunning')}
          aria-label={`${t('sidebar.agentRunning')} (${activity.running})`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            color: 'var(--accent)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            style={{ display: 'block' }}
          >
            <g>
              <path
                d="M21 12a9 9 0 1 1-3.8-7.4"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 12 12"
                to="360 12 12"
                dur="0.9s"
                repeatCount="indefinite"
              />
            </g>
          </svg>
          {activity.running}
        </span>
      )}
      {activity.unread > 0 && (
        <span
          role="img"
          title={t('sidebar.newSessionActivity')}
          aria-label={`${t('sidebar.newSessionActivity')} (${activity.unread})`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            color: '#0891b2',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'currentColor',
              display: 'inline-block',
            }}
          />
          {activity.unread}
        </span>
      )}
    </span>
  );
}

/** 会话行（pi-web `SessionItem`：54px 固定高 + 行内重命名/删除确认 + hover 双图标按钮，T2-7/T2-13） */
function SessionItem({
  session,
  isSelected,
  isRunning,
  isUnread,
  onClick,
  onRenamed,
  onDeleted,
  onRenameSession,
  onDeleteSession,
}: {
  session: SessionInfo;
  isSelected: boolean;
  isRunning?: boolean;
  isUnread?: boolean;
  onClick: () => void;
  onRenamed?: () => void;
  onDeleted?: (id: string) => void;
  onRenameSession?: (id: string, name: string) => Promise<void>;
  onDeleteSession?: (id: string) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameError, setRenameError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      const id = requestAnimationFrame(() => inputRef.current?.select());
      return () => cancelAnimationFrame(id);
    }
  }, [renaming]);

  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12);

  const startRename = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (session.transient) return;
      setRenameValue(session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12));
      setRenaming(true);
    },
    [session.name, session.transient, session.firstMessage, session.id],
  );

  const commitRename = useCallback(async () => {
    const name = renameValue.trim();
    setRenaming(false);
    // 未变化时不落盘：回退标题（首条消息 / id）不是真正的存储名
    if (renameValue === title || name === (session.name ?? '')) return;
    setRenameError(false);
    try {
      await onRenameSession?.(session.id, name);
      onRenamed?.();
    } catch {
      setRenameError(true);
    }
  }, [renameValue, session.id, session.name, onRenamed, title, onRenameSession]);

  const performDelete = useCallback(async () => {
    if (session.transient) return;
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await onDeleteSession?.(session.id);
      onDeleted?.(session.id);
    } catch {
      setDeleting(false);
    }
  }, [session.id, session.transient, onDeleted, onDeleteSession]);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.shiftKey) {
        void performDelete();
      } else {
        setConfirmDelete(true);
      }
    },
    [performDelete],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 逐字移植 pi-web 会话行（行点击选中）
    // biome-ignore lint/a11y/useKeyWithClickEvents: 同上——键盘用户由 Tab 聚焦行内按钮替代
    <div
      onClick={confirmDelete || renaming ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
      }}
      style={{
        height: SESSION_LIST_ITEM_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 14,
        paddingRight: 8,
        cursor: confirmDelete || renaming ? 'default' : 'pointer',
        background: confirmDelete
          ? 'rgba(239,68,68,0.06)'
          : isSelected
            ? 'var(--bg-selected)'
            : hovered
              ? 'var(--bg-hover)'
              : 'transparent',
        borderLeft: confirmDelete
          ? '2px solid #ef4444'
          : isSelected
            ? '2px solid var(--accent)'
            : '2px solid transparent',
        transition: 'background 0.1s',
        opacity: deleting ? 0.5 : 1,
        gap: 6,
        overflow: 'hidden',
      }}
    >
      {confirmDelete ? (
        /* ── 删除确认：同高双按钮 ── */
        <>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {t('sidebar.deleteSession', {
              title: `${title.slice(0, 22)}${title.length > 22 ? '…' : ''}`,
            })}
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void performDelete();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                height: 30,
                padding: '0 11px',
                background: '#ef4444',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
              {t('sidebar.delete')}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 30,
                padding: '0 11px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {t('sidebar.cancel')}
            </button>
          </div>
        </>
      ) : renaming ? (
        /* ── 重命名：输入框填满同一行 ── */
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
          // biome-ignore lint/a11y/noAutofocus: 逐字移植 pi-web（行内重命名进入即聚焦）
          autoFocus
          style={{
            flex: 1,
            fontSize: 12,
            padding: '5px 8px',
            border: `1px solid ${renameError ? '#ef4444' : 'var(--accent)'}`,
            borderRadius: 5,
            outline: 'none',
            background: 'var(--bg)',
            color: 'var(--text)',
            height: 30,
          }}
        />
      ) : (
        /* ── 常规视图 ── */
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                minWidth: 0,
                fontSize: 12,
                fontWeight: isSelected ? 500 : 400,
                lineHeight: 1.4,
                color: 'var(--text)',
              }}
              title={title}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {title}
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
              {isRunning ? (
                <RunningSessionIndicator />
              ) : isUnread ? (
                <UnreadSessionIndicator />
              ) : (
                <span title={session.modified}>{formatRelativeTime(session.modified, locale)}</span>
              )}
              <span>{t('sidebar.messagesCount', { count: session.messageCount })}</span>
              {session.isWorktree && session.branch && (
                <span
                  title={`Worktree: ${session.cwd}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    color: 'var(--accent)',
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {session.branch}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* hover 操作：两个 32×32 图标按钮（T2-13） */}
          {hovered && !session.transient && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={startRename}
                title={t('sidebar.rename')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  padding: 0,
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-selected)';
                  e.currentTarget.style.color = 'var(--accent)';
                  e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleDeleteClick}
                title={t('sidebar.deleteWithShiftClick')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  padding: 0,
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export interface SidebarWorktreeState {
  projectKey: string;
  isGit: boolean;
  isTopLevel: boolean;
  currentWorktreePath: string | null;
  worktrees: { path: string; branch: string | null; isMain: boolean }[];
}

export interface SidebarProject {
  key: string;
  root: string;
}

/**
 * 侧栏（T2 全量重排，结构逐字照抄 pi-web `SessionSidebar`）：
 * 头部（Pi Web 字标 + 新建 + 搜索图标）→ 项目下拉（筛选/对勾/活动徽标/默认目录/自定义路径）
 * → worktree 行（或只读引导态）→ 会话列表（窗口化）→ `.sidebar-section-resize-handle`
 * → EXPLORER（可折叠标题 + 26×26 图标行 + 文件树内容）。
 * 数据与动作全部由宿主注入（ui 保持纯展示）。
 */
export interface SidebarProps {
  sessions: SessionInfo[];
  loading: boolean;
  error: string | null;
  selectedSessionId: string | null;
  runningSessionIds: ReadonlySet<string>;
  unreadSessionIds: ReadonlySet<string>;
  selectedCwd: string | null;
  selectedProject: SidebarProject | null;
  projects: SidebarProject[];
  projectActivity: Map<string, { running: number; unread: number }>;
  homeDir: string;
  /** PiWebTitle 点击后显示的版本串（如 `0.1.0p0.87.1`） */
  versionLabel: string;
  worktreeState: SidebarWorktreeState | null;
  worktreeLoading: boolean;
  /** EXPLORER 区是否显示（选中了项目才显示，pi-web 同款） */
  showExplorer: boolean;
  explorerOpen: boolean;
  onToggleExplorer(open: boolean): void;
  /** EXPLORER 的内容（文件树 / 搜索面板 / 变更文件） */
  explorerSlot?: ReactNode;
  /** 会话/EXPLORER 之间的拖拽手柄（宿主用 useResizablePanel(axis:'vertical') 构造） */
  resizeHandleSlot?: ReactNode;
  /** 会话区高度 CSS（`--sidebar-session-pane-height` var） */
  sessionPaneStyle?: CSSProperties;
  sessionPaneRef?: React.RefObject<HTMLDivElement | null>;
  /** 头部图标行的动作（T2-6） */
  changesCount: number;
  changesCollapsed: boolean;
  onToggleChanges(): void;
  fileSearchOpen: boolean;
  onToggleFileSearch(open: boolean): void;
  uploadBusy: boolean;
  onUpload(): void;
  onRefreshExplorer(): void;
  explorerRefreshDone: boolean;
  // —— 动作回调 ——
  onSelectSession(session: SessionInfo): void;
  onNewSession(): void;
  onSelectProjectRoot(root: string): void;
  /** 「使用默认目录」：创建 ~/pi-cwd-YYYYMMDD；失败返回错误文案 */
  onUseDefaultDirectory(): Promise<string | null>;
  /** 「自定义路径…」选中目录后验证；失败返回错误文案 */
  onCommitCustomPath(path: string): Promise<string | null>;
  onSelectWorktree(path: string): void;
  onCreateWorktree(branch: string): Promise<string | null>;
  /** 删除 worktree；dirty 冲突时宿主返回 { dirty: true } */
  onRemoveWorktree(
    path: string,
    force: boolean,
  ): Promise<{ error?: string; dirty?: boolean } | null>;
  onRenameSession(id: string, name: string): Promise<void>;
  onDeleteSession(id: string): Promise<void>;
  /** 行内重命名/删除成功后的列表刷新（宿主 refetch） */
  onSessionsChanged?(): void;
  onSessionRemoved?(id: string): void;
  /** 上次自定义路径（DirectoryPicker 初始值；持久化由宿主负责） */
  lastCustomCwd: string;
}

export function Sidebar(props: SidebarProps) {
  const { t } = useI18n();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');
  const [wtFilter, setWtFilter] = useState('');
  const [customPathOpen, setCustomPathOpen] = useState(false);
  const [customPathValue, setCustomPathValue] = useState(props.lastCustomCwd);
  const [customPathError, setCustomPathError] = useState<string | null>(null);
  const [customPathValidating, setCustomPathValidating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [wtDropdownOpen, setWtDropdownOpen] = useState(false);
  const [wtNewOpen, setWtNewOpen] = useState(false);
  const [wtNewBranch, setWtNewBranch] = useState('');
  const [wtError, setWtError] = useState<string | null>(null);
  const [wtBusy, setWtBusy] = useState(false);
  const [wtConfirmRemove, setWtConfirmRemove] = useState<string | null>(null);
  const wtDropdownRef = useRef<HTMLDivElement>(null);
  const wtNewInputRef = useRef<HTMLInputElement>(null);
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');

  // 窗口化列表：只挂可见切片
  const listScrollRef = useRef<HTMLDivElement>(null);
  const [listViewportH, setListViewportH] = useState(0);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const listScrollRafRef = useRef<number | null>(null);
  const listScrollTopRef = useRef(0);
  const renderedListScrollTopRef = useRef(0);
  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    listScrollTopRef.current = e.currentTarget.scrollTop;
    if (listScrollRafRef.current != null) return;
    listScrollRafRef.current = requestAnimationFrame(() => {
      listScrollRafRef.current = null;
      const nextTop =
        Math.floor(listScrollTopRef.current / SESSION_LIST_ITEM_HEIGHT) * SESSION_LIST_ITEM_HEIGHT;
      if (renderedListScrollTopRef.current === nextTop) return;
      renderedListScrollTopRef.current = nextTop;
      setListScrollTop(nextTop);
    });
  }, []);
  useLayoutEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setListViewportH(entry.contentRect.height);
    });
    ro.observe(el);
    setListViewportH(el.clientHeight);
    listScrollTopRef.current = el.scrollTop;
    renderedListScrollTopRef.current =
      Math.floor(el.scrollTop / SESSION_LIST_ITEM_HEIGHT) * SESSION_LIST_ITEM_HEIGHT;
    setListScrollTop(renderedListScrollTopRef.current);
    return () => ro.disconnect();
  }, []);

  // 外点关闭两个下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setProjectFilter('');
      }
      if (wtDropdownRef.current && !wtDropdownRef.current.contains(e.target as Node)) {
        setWtDropdownOpen(false);
        setWtNewOpen(false);
        setWtNewBranch('');
        setWtError(null);
        setWtConfirmRemove(null);
        setWtFilter('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const recentProjects = props.projects;
  const showProjectFilter = recentProjects.length > 8;
  const visibleProjects = useMemo(() => {
    const query = projectFilter.trim().toLowerCase();
    return query
      ? recentProjects.filter((project) => project.root.toLowerCase().includes(query))
      : recentProjects;
  }, [projectFilter, recentProjects]);

  const hasOtherWorkspaceActivity = useMemo(
    () =>
      [...props.projectActivity.entries()].some(
        ([key, { running, unread }]) =>
          key !== props.selectedProject?.key && (running > 0 || unread > 0),
      ),
    [props.projectActivity, props.selectedProject?.key],
  );

  const worktreeState = props.worktreeState;

  const showWorktreeSwitcher = Boolean(
    worktreeState?.isGit &&
      worktreeState.isTopLevel &&
      props.selectedCwd &&
      props.selectedProject?.key === worktreeState.projectKey,
  );
  const worktreeGuide =
    props.selectedCwd &&
    worktreeState !== null &&
    props.selectedProject?.key === worktreeState.projectKey &&
    !showWorktreeSwitcher
      ? worktreeState.isGit
        ? { label: t('sidebar.openRepoRoot'), title: t('sidebar.openRepoRootTitle') }
        : { label: t('sidebar.gitRepoRootOnly'), title: t('sidebar.gitRepoRootOnlyTitle') }
      : null;
  const worktreeLoading = props.worktreeLoading && !showWorktreeSwitcher;
  const inactiveWorktreeSelector =
    worktreeGuide ??
    (worktreeLoading
      ? { label: t('sidebar.worktrees'), title: t('sidebar.checkingWorktrees') }
      : null);

  const currentWorktree = worktreeState
    ? (worktreeState.worktrees.find((worktree) => worktree.path === props.selectedCwd) ??
      (worktreeState.currentWorktreePath
        ? worktreeState.worktrees.find(
            (worktree) => worktree.path === worktreeState.currentWorktreePath,
          )
        : undefined) ??
      worktreeState.worktrees.find((worktree) => worktree.isMain))
    : undefined;
  const currentWorktreePath = currentWorktree?.path ?? null;

  const commitCustomPath = useCallback(
    async (candidate?: string) => {
      const path = (candidate ?? customPathValue).trim();
      if (!path || customPathValidating) return;

      setCustomPathValidating(true);
      setCustomPathError(null);
      const error = await props.onCommitCustomPath(path);
      setCustomPathValidating(false);
      if (error !== null) {
        setCustomPathError(error);
        return;
      }
      setCustomPathValue(path);
      setCustomPathOpen(false);
      setDropdownOpen(false);
    },
    [customPathValue, customPathValidating, props],
  );

  const handleCustomPathClick = useCallback(() => {
    setCustomPathOpen(true);
    setCustomPathError(null);
    setDropdownOpen(false);
  }, []);

  const handleDefaultCwd = useCallback(async () => {
    const error = await props.onUseDefaultDirectory();
    if (error === null) {
      setCustomPathOpen(false);
      setCustomPathError(null);
      setDropdownOpen(false);
    }
  }, [props]);

  const handleCreateWorktree = useCallback(async () => {
    const branch = wtNewBranch.trim();
    if (!branch || wtBusy) return;
    setWtBusy(true);
    setWtError(null);
    const error = await props.onCreateWorktree(branch);
    setWtBusy(false);
    if (error !== null) {
      setWtError(error);
      return;
    }
    setWtNewOpen(false);
    setWtNewBranch('');
    setWtDropdownOpen(false);
  }, [wtNewBranch, wtBusy, props]);

  const handleRemoveWorktree = useCallback(
    async (path: string, force: boolean) => {
      if (wtBusy) return;
      setWtBusy(true);
      setWtError(null);
      const result = await props.onRemoveWorktree(path, force);
      setWtBusy(false);
      if (result?.dirty && !force) {
        setWtConfirmRemove(path);
        return;
      }
      if (result?.error) {
        setWtError(result.error);
        return;
      }
      setWtConfirmRemove(null);
    },
    [wtBusy, props],
  );

  const virtualIndices = useMemo(
    () =>
      getSessionListIndices(
        props.sessions.length,
        listScrollTop,
        listViewportH,
        props.sessions.findIndex((session) => session.id === focusedSessionId),
      ),
    [focusedSessionId, listScrollTop, listViewportH, props.sessions],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {customPathOpen && (
        <DirectoryPicker
          initialPath={customPathValue}
          busy={customPathValidating}
          error={customPathError}
          onCancel={() => {
            setCustomPathOpen(false);
            setCustomPathError(null);
          }}
          onSelect={(path) => void commitCustomPath(path)}
        />
      )}
      {/* 头部 */}
      <div
        style={{
          padding: '12px 10px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <PiWebTitle versionLabel={props.versionLabel} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={props.onNewSession}
              disabled={!props.selectedCwd}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: props.selectedCwd ? 'var(--text-muted)' : 'var(--text-dim)',
                cursor: props.selectedCwd ? 'pointer' : 'not-allowed',
                height: 32,
                paddingLeft: 10,
                paddingRight: 12,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                flexShrink: 0,
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              title={
                props.selectedCwd
                  ? t('sidebar.newSessionTitle', { path: props.selectedCwd })
                  : t('sidebar.selectProject')
              }
              onMouseEnter={(e) => {
                if (!props.selectedCwd) return;
                e.currentTarget.style.background = 'var(--bg-selected)';
                e.currentTarget.style.color = 'var(--accent)';
                e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = props.selectedCwd
                  ? 'var(--text-muted)'
                  : 'var(--text-dim)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              {t('sidebar.new')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSessionSearchOpen((open) => !open);
                setWtDropdownOpen(false);
              }}
              title={t('sidebar.toggleSessionSearch')}
              aria-label={t('sidebar.toggleSessionSearch')}
              aria-expanded={sessionSearchOpen}
              aria-controls="session-search-input"
              className={`flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border hover:bg-bg-selected focus-visible:outline-2 focus-visible:outline-accent ${sessionSearchOpen ? 'bg-bg-selected text-accent' : 'bg-bg-hover text-text-muted'}`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            </button>
          </div>
        </div>

        {/* 项目选择 */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            title={props.selectedProject?.root ?? props.selectedCwd ?? ''}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              background: props.selectedCwd ? 'var(--bg-hover)' : 'rgba(37,99,235,0.06)',
              border: props.selectedCwd
                ? '1px solid var(--border)'
                : '1px solid rgba(37,99,235,0.4)',
              borderRadius: 7,
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text)',
              textAlign: 'left',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {props.selectedCwd ? (
              <PathLabel
                text={displayCwd(props.selectedProject?.root ?? props.selectedCwd, props.homeDir)}
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text)',
                }}
              />
            ) : (
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-dim)',
                }}
              >
                {t('sidebar.selectProject')}
              </span>
            )}
            {hasOtherWorkspaceActivity && (
              <span
                role="img"
                title={t('sidebar.newActivity')}
                aria-label={t('sidebar.newActivity')}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  marginLeft: 6,
                  background: 'var(--accent)',
                }}
              />
            )}
          </button>

          <AnimatedDropdown
            open={dropdownOpen}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: 100,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
              overflow: 'hidden',
            }}
          >
            {showProjectFilter && (
              <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                <input
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setProjectFilter('');
                      setDropdownOpen(false);
                    }
                  }}
                  placeholder={t('sidebar.filterProjects')}
                  // biome-ignore lint/a11y/noAutofocus: 逐字移植 pi-web（下拉展开即聚焦筛选框）
                  autoFocus
                  style={{
                    width: '100%',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    padding: '5px 8px',
                    border: '1px solid var(--border)',
                    borderRadius: 5,
                    outline: 'none',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
            <div style={{ maxHeight: 'min(50vh, 380px)', overflowY: 'auto' }}>
              {visibleProjects.map((project) => (
                <button
                  type="button"
                  key={project.key}
                  onClick={() => {
                    props.onSelectProjectRoot(project.root);
                    setProjectFilter('');
                    setCustomPathOpen(false);
                    setCustomPathError(null);
                    setDropdownOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    width: '100%',
                    padding: '8px 10px',
                    background: 'var(--bg)',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    color:
                      project.key === props.selectedProject?.key
                        ? 'var(--text)'
                        : 'var(--text-muted)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={project.root}
                >
                  {project.key === props.selectedProject?.key && (
                    <svg
                      aria-hidden="true"
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flexShrink: 0 }}
                    >
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                  )}
                  {project.key !== props.selectedProject?.key && (
                    <span style={{ width: 10, flexShrink: 0 }} />
                  )}
                  <PathLabel text={displayCwd(project.root, props.homeDir)} style={{ flex: 1 }} />
                  {showProjectActivity(props.projectActivity.get(project.key), t)}
                </button>
              ))}
              {visibleProjects.length === 0 && projectFilter.trim() && (
                <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-dim)' }}>
                  {t('sidebar.noMatchingProjects')}
                </div>
              )}
            </div>

            {/* 默认目录快捷项 */}
            {!customPathOpen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDefaultCwd();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  width: '100%',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  borderTop: visibleProjects.length > 0 ? '1px solid var(--border)' : 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                }}
              >
                <svg
                  aria-hidden="true"
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M1 3A1 1 0 0 1 2 2H4L5 3.5H8.5a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 1 8V3Z" />
                </svg>
                <span>{t('sidebar.useDefaultDirectory')}</span>
              </button>
            )}

            {/* 自定义路径 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCustomPathClick();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                width: '100%',
                padding: '8px 10px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 11,
              }}
            >
              <svg
                aria-hidden="true"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
                style={{ flexShrink: 0 }}
              >
                <line x1="5" y1="1" x2="5" y2="9" />
                <line x1="1" y1="5" x2="9" y2="5" />
              </svg>
              <span>{t('sidebar.customPath')}</span>
            </button>
          </AnimatedDropdown>
        </div>

        {sessionSearchOpen && (
          <input
            id="session-search-input"
            type="search"
            // biome-ignore lint/a11y/noAutofocus: 逐字移植 pi-web（点开搜索即聚焦）
            autoFocus
            value={sessionSearchQuery}
            maxLength={200}
            aria-label={t('sidebar.searchSessions')}
            placeholder={t('sidebar.searchSessions')}
            onChange={(event) => setSessionSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setSessionSearchQuery('');
              }
            }}
            className="mt-[6px] block h-[29px] w-full min-w-0 rounded-[7px] border border-border bg-bg px-[10px] text-xs text-text focus:outline-2 focus:outline-accent"
          />
        )}

        {/* worktree 切换行（T2-4） */}
        {!sessionSearchOpen &&
          showWorktreeSwitcher &&
          worktreeState != null &&
          (() => {
            const state = worktreeState;
            const showWtFilter = state.worktrees.length >= 8;
            const visibleWorktrees =
              showWtFilter && wtFilter.trim()
                ? state.worktrees.filter((w) =>
                    (w.branch ?? displayCwd(w.path, props.homeDir))
                      .toLowerCase()
                      .includes(wtFilter.trim().toLowerCase()),
                  )
                : state.worktrees;
            return (
              <div ref={wtDropdownRef} style={{ position: 'relative', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setWtDropdownOpen((v) => !v)}
                  title={
                    currentWorktree
                      ? t('sidebar.switchWorktreeTitle', { path: currentWorktree.path })
                      : t('sidebar.switchWorktree')
                  }
                  style={{
                    width: '100%',
                    height: 29,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 10px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                    borderRadius: 7,
                    cursor: 'pointer',
                    fontSize: 11,
                    lineHeight: 1.35,
                    color: 'var(--text-muted)',
                    textAlign: 'left',
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      flexShrink: 0,
                      color:
                        currentWorktree && !currentWorktree.isMain
                          ? 'var(--accent)'
                          : 'var(--text-dim)',
                    }}
                  >
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  <PathLabel
                    text={
                      currentWorktree
                        ? (currentWorktree.branch ??
                          displayCwd(currentWorktree.path, props.homeDir))
                        : '…'
                    }
                    style={{ flex: 1, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}
                  />
                  {currentWorktree?.isMain && (
                    <span style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: 10 }}>
                      {t('sidebar.main')}
                    </span>
                  )}
                  {state.worktrees.length > 1 && (
                    <span style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: 10 }}>
                      {state.worktrees.length}
                    </span>
                  )}
                  <svg
                    aria-hidden="true"
                    width="9"
                    height="9"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="2 3.5 5 6.5 8 3.5" />
                  </svg>
                </button>

                <AnimatedDropdown
                  open={wtDropdownOpen}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
                    overflow: 'hidden',
                  }}
                >
                  {showWtFilter && (
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                      <input
                        value={wtFilter}
                        onChange={(e) => setWtFilter(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setWtFilter('');
                            setWtDropdownOpen(false);
                          }
                        }}
                        placeholder={t('sidebar.filterWorktrees')}
                        // biome-ignore lint/a11y/noAutofocus: 逐字移植 pi-web（下拉展开即聚焦筛选框）
                        autoFocus
                        style={{
                          width: '100%',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          padding: '5px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: 5,
                          outline: 'none',
                          background: 'var(--bg)',
                          color: 'var(--text)',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )}
                  <div style={{ maxHeight: 'min(40vh, 300px)', overflowY: 'auto' }}>
                    {visibleWorktrees.map((wt) => {
                      const isCurrent = wt.path === currentWorktreePath;
                      if (wtConfirmRemove === wt.path) {
                        return (
                          <div
                            key={wt.path}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '7px 10px',
                              borderBottom: '1px solid var(--border)',
                              background: 'rgba(239,68,68,0.06)',
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                fontSize: 11,
                                color: 'var(--text)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t('sidebar.forceRemoveCheckout')}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleRemoveWorktree(wt.path, true)}
                              disabled={wtBusy}
                              style={{
                                padding: '3px 9px',
                                background: '#ef4444',
                                border: 'none',
                                borderRadius: 5,
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {t('sidebar.force')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setWtConfirmRemove(null)}
                              style={{
                                padding: '3px 9px',
                                background: 'var(--bg-hover)',
                                border: '1px solid var(--border)',
                                borderRadius: 5,
                                color: 'var(--text-muted)',
                                fontSize: 11,
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {t('sidebar.cancel')}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={wt.path}
                          className="wt-row"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              props.onSelectWorktree(wt.path);
                              setWtDropdownOpen(false);
                              setWtError(null);
                              setWtFilter('');
                            }}
                            title={wt.path}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 7,
                              padding: '8px 10px',
                              background: 'var(--bg)',
                              border: 'none',
                              color: isCurrent ? 'var(--text)' : 'var(--text-muted)',
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {isCurrent ? (
                              <svg
                                aria-hidden="true"
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                fill="none"
                                stroke="var(--accent)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ flexShrink: 0 }}
                              >
                                <polyline points="1.5 5 4 7.5 8.5 2.5" />
                              </svg>
                            ) : (
                              <span style={{ width: 10, flexShrink: 0 }} />
                            )}
                            <PathLabel
                              text={wt.branch ?? displayCwd(wt.path, props.homeDir)}
                              style={{ flex: 1 }}
                            />
                            {wt.isMain && (
                              <span
                                style={{ flexShrink: 0, color: 'var(--text-dim)', fontSize: 10 }}
                              >
                                {t('sidebar.main')}
                              </span>
                            )}
                          </button>
                          {!wt.isMain && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveWorktree(wt.path, false)}
                              disabled={wtBusy}
                              title={t('sidebar.removeWorktreeTitle', { path: wt.path })}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 34,
                                height: 28,
                                padding: 0,
                                marginRight: 4,
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-dim)',
                                cursor: 'pointer',
                                borderRadius: 5,
                                flexShrink: 0,
                                transition: 'color 0.12s, background 0.12s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#ef4444';
                                e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'var(--text-dim)';
                                e.currentTarget.style.background = 'none';
                              }}
                            >
                              <svg
                                aria-hidden="true"
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {showWtFilter && visibleWorktrees.length === 0 && wtFilter.trim() && (
                      <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-dim)' }}>
                        {t('sidebar.noMatchingWorktrees')}
                      </div>
                    )}
                  </div>

                  {!wtNewOpen ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWtNewOpen(true);
                        setWtError(null);
                        setTimeout(() => wtNewInputRef.current?.focus(), 0);
                      }}
                      title={t('sidebar.createWorktreeTitle')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        width: '100%',
                        padding: '8px 10px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 11,
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                        style={{ flexShrink: 0 }}
                      >
                        <line x1="5" y1="1" x2="5" y2="9" />
                        <line x1="1" y1="5" x2="9" y2="5" />
                      </svg>
                      <span>{t('sidebar.newWorktree')}</span>
                    </button>
                  ) : (
                    <div style={{ padding: '6px 8px' }}>
                      <input
                        ref={wtNewInputRef}
                        value={wtNewBranch}
                        onChange={(e) => {
                          setWtNewBranch(e.target.value);
                          setWtError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleCreateWorktree();
                          }
                          if (e.key === 'Escape') {
                            setWtNewOpen(false);
                            setWtNewBranch('');
                            setWtError(null);
                          }
                        }}
                        placeholder={t('sidebar.branchName')}
                        style={{
                          width: '100%',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          padding: '5px 8px',
                          border: '1px solid var(--accent)',
                          borderRadius: 5,
                          outline: 'none',
                          background: 'var(--bg)',
                          color: 'var(--text)',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                        <button
                          type="button"
                          onClick={() => void handleCreateWorktree()}
                          disabled={wtBusy || !wtNewBranch.trim()}
                          style={{
                            flex: 1,
                            padding: '4px 0',
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: 5,
                            color: 'var(--accent-contrast)',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: wtBusy || !wtNewBranch.trim() ? 'not-allowed' : 'pointer',
                            opacity: wtBusy || !wtNewBranch.trim() ? 0.65 : 1,
                          }}
                        >
                          {wtBusy ? t('sidebar.creating') : t('sidebar.create')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWtNewOpen(false);
                            setWtNewBranch('');
                            setWtError(null);
                          }}
                          style={{
                            flex: 1,
                            padding: '4px 0',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--border)',
                            borderRadius: 5,
                            color: 'var(--text-muted)',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {t('sidebar.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                  {wtError && (
                    <div
                      style={{
                        padding: '5px 10px 8px',
                        color: '#dc2626',
                        fontSize: 11,
                        lineHeight: 1.35,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {wtError}
                    </div>
                  )}
                </AnimatedDropdown>
              </div>
            );
          })()}
        {!sessionSearchOpen && inactiveWorktreeSelector && (
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            title={inactiveWorktreeSelector.title}
            style={{
              width: '100%',
              height: 29,
              boxSizing: 'border-box',
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              border: '1px solid var(--border)',
              borderRadius: 7,
              background: 'var(--bg-hover)',
              color: 'var(--text-dim)',
              fontSize: 11,
              lineHeight: 1.35,
              whiteSpace: 'nowrap',
              textAlign: 'left',
              cursor: 'default',
              opacity: 0.82,
            }}
          >
            <svg
              aria-hidden="true"
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {inactiveWorktreeSelector.label}
            </span>
          </button>
        )}
      </div>

      {/* 会话列表 */}
      <div
        ref={props.sessionPaneRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex:
            props.showExplorer && props.explorerOpen && props.selectedCwd
              ? '0 1 var(--sidebar-session-pane-height, 320px)'
              : '1 1 auto',
          minHeight: 80,
          overflow: 'hidden',
          ...(props.sessionPaneStyle ?? {}),
        }}
      >
        <SessionSearch
          open={sessionSearchOpen}
          query={sessionSearchQuery}
          selectedSessionId={props.selectedSessionId}
          onSelectSession={(session) => props.onSelectSession(session)}
        >
          <div
            ref={listScrollRef}
            onScroll={handleListScroll}
            className="scrollbar-subtle"
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              padding: '0',
            }}
          >
            {props.loading && (
              <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                {t('sidebar.loading')}
              </div>
            )}
            {props.error && (
              <div style={{ padding: '12px 14px', color: '#f87171', fontSize: 12 }}>
                {props.error}
              </div>
            )}
            {!props.loading && !props.error && props.sessions.length === 0 && (
              <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                {t('sidebar.noSessions')}
              </div>
            )}
            {props.sessions.length > 0 && (
              <div
                style={{
                  position: 'relative',
                  height: props.sessions.length * SESSION_LIST_ITEM_HEIGHT,
                }}
              >
                {virtualIndices.map((index) => {
                  const session = props.sessions[index];
                  if (session === undefined) return null;
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: 焦点跟踪容器（子元素为交互主体）
                    <div
                      key={session.id}
                      onFocus={() => setFocusedSessionId(session.id)}
                      onBlur={() => setFocusedSessionId(null)}
                      style={{
                        position: 'absolute',
                        top: index * SESSION_LIST_ITEM_HEIGHT,
                        left: 0,
                        right: 0,
                      }}
                    >
                      <SessionItem
                        session={session}
                        isSelected={session.id === props.selectedSessionId}
                        isRunning={props.runningSessionIds.has(session.id)}
                        isUnread={props.unreadSessionIds.has(session.id)}
                        onClick={() => props.onSelectSession(session)}
                        onRenameSession={props.onRenameSession}
                        onDeleteSession={props.onDeleteSession}
                        onRenamed={() => void props.onSessionsChanged?.()}
                        onDeleted={(id) => void props.onSessionRemoved?.(id)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SessionSearch>
      </div>

      {props.showExplorer && props.explorerOpen && props.selectedCwd && props.resizeHandleSlot}

      {/* EXPLORER 区（T2-1：常驻会话列表下方，不再藏在页签里） */}
      {props.showExplorer && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            flex: props.explorerOpen ? '1 1 0' : '0 0 auto',
            minHeight: props.explorerOpen ? 120 : 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => props.onToggleExplorer(!props.explorerOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                padding: '6px 10px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                textAlign: 'left',
              }}
            >
              <svg
                aria-hidden="true"
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: props.explorerOpen ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              {t('files.explorer')}
            </button>
            {/* 终端按钮：⛔ 排除域（ADR-0014），不移植 */}
            {props.explorerOpen && props.changesCount > 0 && (
              <ToolbarIconButton
                onClick={props.onToggleChanges}
                title={t('sidebar.changedFiles', { count: props.changesCount })}
                ariaPressed={!props.changesCollapsed}
                color={props.changesCollapsed ? 'var(--text-dim)' : 'var(--accent)'}
                background={props.changesCollapsed ? 'none' : 'var(--bg-selected)'}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M3 12h6" />
                  <path d="M15 12h6" />
                </svg>
              </ToolbarIconButton>
            )}
            {props.explorerOpen && (
              <ToolbarIconButton
                onClick={() => props.onToggleFileSearch(!props.fileSearchOpen)}
                title={t('sidebar.searchFiles')}
                ariaPressed={props.fileSearchOpen}
                color={props.fileSearchOpen ? 'var(--accent)' : 'var(--text-dim)'}
                background={props.fileSearchOpen ? 'var(--bg-selected)' : 'none'}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </ToolbarIconButton>
            )}
            {props.explorerOpen && (
              <ToolbarIconButton
                onClick={props.onUpload}
                disabled={props.uploadBusy}
                title={t('sidebar.uploadFilesTitle')}
                color="var(--text-dim)"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
              </ToolbarIconButton>
            )}
            <ToolbarIconButton
              onClick={props.onRefreshExplorer}
              title={t('sidebar.refreshExplorer')}
              skipHover={props.explorerRefreshDone}
              color={props.explorerRefreshDone ? '#4ade80' : 'var(--text-dim)'}
              background={props.explorerRefreshDone ? 'rgba(74,222,128,0.18)' : 'none'}
              marginRight={6}
            >
              {props.explorerRefreshDone ? (
                <svg
                  aria-hidden="true"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </ToolbarIconButton>
          </div>
          {props.explorerOpen && props.explorerSlot}
        </div>
      )}
    </div>
  );
}
