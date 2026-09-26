import { useI18n } from '../i18n/i18n-provider';

/**
 * QueueBar：排队消息条——steering（插队）与 followUp（收尾后追问）。
 *
 * 按设计规范 `ChatInput` 的排队面板（T2-12）：1px 描边 + 6px 圆角 + `--bg-panel` 底；
 * 头行是 `chat.queued`（"已排队 · N"）与带 SVG 的「移回输入框」按钮；每行是**胶囊标签**
 * （steer 带 accent 描边）+ 单行省略的正文。数据来自 `queue_update` 事件。
 */
export interface QueueBarProps {
  steering: string[];
  followUp: string[];
  onClear(): void;
}

export function QueueBar({ steering, followUp, onClear }: QueueBarProps) {
  const { t } = useI18n();
  const total = steering.length + followUp.length;
  if (total === 0) return null;
  return (
    <div style={{ maxWidth: 'var(--chat-content-max-width, 820px)', margin: '0 auto 8px' }}>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--bg-panel)',
          padding: '5px 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '2px 8px 4px 10px',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {t('chat.queued', { count: total })}
          </span>
          <button
            type="button"
            onClick={onClear}
            title={t('chat.recallTitle')}
            aria-label={t('chat.recallTitle')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              fontSize: 12,
              color: 'var(--text)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 7,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'var(--bg-hover)';
              event.currentTarget.style.borderColor =
                'color-mix(in srgb, var(--accent) 45%, var(--border))';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent';
              event.currentTarget.style.borderColor = 'var(--border)';
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

function QueuedMessageRow({ kind, text }: { kind: 'steer' | 'follow-up'; text: string }) {
  return (
    <div
      title={text}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 10px',
        fontSize: 12,
        color: 'var(--text-muted)',
        minWidth: 0,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          padding: '1px 7px',
          borderRadius: 999,
          border: `1px solid ${
            kind === 'steer'
              ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
              : 'var(--border)'
          }`,
          color: kind === 'steer' ? 'var(--accent)' : 'var(--text-dim)',
        }}
      >
        {kind}
      </span>
      <span
        style={{
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
