import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * PanelShell（docs/06 §4.4）：顶部活动面板的通用壳（整宽面板，不取原型的锚定浮层）。
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
    <section className="hairline-b flex min-h-0 shrink-0 flex-col border-line-2 bg-surface-raised">
      <header className="flex shrink-0 items-center gap-2 px-4 py-2">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {hint !== undefined && <span className="truncate text-[11px] text-fg-faint">{hint}</span>}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={onClose}
            title="关闭面板"
            aria-label={`关闭${title}`}
            className="sq flex h-7 w-7 items-center justify-center text-fg-subtle hover:bg-hover hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
      </header>
      <div className="scrollbar-thin min-h-0 max-h-[min(600px,60dvh)] overflow-y-auto px-4 pb-3">
        {children}
      </div>
    </section>
  );
}
