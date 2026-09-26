/**
 * QueueBar：排队消息条——steering（插队）与 followUp（收尾后追问）两组。
 * 视觉按设计规范 `ChatInput` 的排队消息面板：1px 描边 + 6px 圆角 + `--bg-panel` 底，
 * 组标题为 mono 10px 大写字距标签。数据来自 `queue_update` 事件（fold 已折叠进 chat.queued）。
 */
export interface QueueBarProps {
  steering: string[];
  followUp: string[];
  onClear(): void;
}

export function QueueBar({ steering, followUp, onClear }: QueueBarProps) {
  if (steering.length === 0 && followUp.length === 0) return null;
  return (
    <div
      style={{
        maxWidth: 'var(--chat-content-max-width, 820px)',
        margin: '0 auto 8px',
        padding: 0,
      }}
    >
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
            排队消息
          </span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-[5px] px-2 text-[11px] text-text-dim hover:bg-bg-hover hover:text-text"
            style={{ height: 22 }}
          >
            清空队列
          </button>
        </div>
        {steering.length > 0 && <QueueGroup label="插队" items={steering} color="var(--accent)" />}
        {followUp.length > 0 && (
          <QueueGroup label="追问" items={followUp} color="var(--text-dim)" />
        )}
      </div>
    </div>
  );
}

function QueueGroup({ label, items, color }: { label: string; items: string[]; color: string }) {
  return (
    <div style={{ padding: '2px 10px 4px' }}>
      <div
        style={{
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          color,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 2,
        }}
      >
        {label} · {items.length}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => (
          // 队列内文本可能重复（用户连发同一句话），故用内容本身作 key（React 只要求兄弟间唯一）
          <li
            key={item}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11.5,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
