import { useI18n } from '../i18n/i18n-provider';

/**
 * QueueBar：排队消息条——steering（插队）与 followUp（收尾后追问）。
 *
 * 按原型 `.queue`（v3 玻璃）：16px 圆角玻璃卡 + `--elev-panel` 投影；头行
 * `chat.queued`（11.5px/650 `--text-muted`）+ 「移回输入框」按钮；每行是**语义底色胶囊标签**
 * （引导 = amber，后续消息 = accent）+ 单行省略正文 + 顶部发丝线。数据来自 `queue_update` 事件。
 */
export interface QueueBarProps {
  steering: string[];
  followUp: string[];
  onClear(): void;
}

/** 原型 `.cbar`：30px 高 / 10px 圆角 / 12px `--text-muted`，hover 填充 */
const RECALL_BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 30,
  padding: '0 10px',
  border: 'none',
  borderRadius: 10,
  background: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
  transition: 'background 0.14s, color 0.14s',
  flexShrink: 0,
} as const;

export function QueueBar({ steering, followUp, onClear }: QueueBarProps) {
  const { t } = useI18n();
  const total = steering.length + followUp.length;
  if (total === 0) return null;
  return (
    <div style={{ maxWidth: 'var(--chat-content-max-width, 1150px)', margin: '0 auto 9px' }}>
      <div
        style={{
          borderRadius: 16,
          background: 'var(--menu)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          boxShadow: 'var(--elev-panel), inset 0 0 0 1px var(--border)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px' }}>
          <span style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-muted)' }}>
            {t('chat.queued', { count: total })}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClear}
            title={t('chat.recallTitle')}
            aria-label={t('chat.recallTitle')}
            style={RECALL_BUTTON}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'var(--bg-hover)';
              event.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'none';
              event.currentTarget.style.color = 'var(--text-muted)';
            }}
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
              <polyline points="9 14 4 9 9 4" />
              <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
            </svg>
            {t('chat.recall')}
          </button>
        </div>
        {steering.map((text, index) => (
          // 队列内文本可能重复（用户连发同一句话），下标参与 key（React 只要求兄弟间唯一）
          // biome-ignore lint/suspicious/noArrayIndexKey: 内容可重复，下标是唯一稳定标识
          <QueuedMessageRow key={`steer-${index}`} kind="steer" text={text} />
        ))}
        {followUp.map((text, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同上
          <QueuedMessageRow key={`follow-up-${index}`} kind="follow-up" text={text} />
        ))}
      </div>
    </div>
  );
}

/** 原型 `.tag`：18px 高 / 9.5px 等宽加粗；引导 = amber 底，后续消息 = accent 底 */
function tagStyle(kind: 'steer' | 'follow-up') {
  return {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    height: 18,
    padding: '0 7px',
    borderRadius: 999,
    fontFamily: 'var(--font-mono)',
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.04em',
    background: kind === 'steer' ? 'var(--amber-bg)' : 'var(--user-bg)',
    color: kind === 'steer' ? 'var(--amber)' : 'var(--accent)',
  } as const;
}

function QueuedMessageRow({ kind, text }: { kind: 'steer' | 'follow-up'; text: string }) {
  const { t } = useI18n();
  return (
    <div
      title={text}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 11px',
        borderTop: '1px solid var(--border)',
        fontSize: 12.5,
        color: 'var(--text-2)',
        minWidth: 0,
      }}
    >
      <span style={tagStyle(kind)}>{kind === 'steer' ? t('chat.steer') : t('chat.followUp')}</span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
}
