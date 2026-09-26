import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * PanelShell：顶部活动面板的通用壳（整宽面板，不取原型的锚定浮层）。
 * 视觉按设计规范顶部下拉面板：`--bg-panel` 底 + 1px 下描边 + 28px 落影，内边距 12×16。
 * 系统提示词 / 工具定义 / 会话统计 / 分支导航共用。
 */
export interface PanelShellProps {
  title: string;
  hint?: string;
  onClose(): void;
  /** 右侧附加控件（如「刷新」） */
  actions?: ReactNode;
  children: ReactNode;
}

export function PanelShell({ title, hint, onClose, actions, children }: PanelShellProps) {
  return (
    <section
      className="hairline-b flex min-h-0 shrink-0 flex-col border-border bg-bg-panel"
      style={{ boxShadow: '0 10px 28px rgba(0,0,0,0.10)' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        {hint !== undefined && (
          <span
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11,
              color: 'var(--text-dim)',
            }}
          >
            {hint}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {actions}
          <button
            type="button"
            onClick={onClose}
            title="关闭面板"
            aria-label={`关闭${title}`}
            className="flex h-6 w-6 items-center justify-center rounded-[5px] text-text-dim hover:bg-bg-hover hover:text-text"
          >
            <X size={13} />
          </button>
        </div>
      </header>
      <div
        className="min-h-0 overflow-y-auto"
        style={{ maxHeight: 'min(600px, 60dvh)', padding: '12px 16px' }}
      >
        {children}
      </div>
    </section>
  );
}
