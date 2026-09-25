import { X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../utils/cn';

/**
 * SettingsPanel（docs/06 §4.4）：设置浮层——左侧节导航 + 右侧内容。
 * 纯壳：节清单与内容由宿主给（web 用 settings-navigation 记住上次节）。
 */
export interface SettingsSectionItem {
  id: string;
  label: string;
  /** 无项目上下文时禁用（由宿主算好，本组件不自己判断） */
  disabled?: boolean;
  /** 小节徽标（如更新数） */
  badge?: string;
}

export interface SettingsPanelProps {
  sections: SettingsSectionItem[];
  activeSection: string;
  onSelectSection(id: string): void;
  onClose(): void;
  title?: string;
  /** 无项目时的提示（requiresProject 的节被禁用时展示） */
  projectHint?: string;
  children: ReactNode;
}

export function SettingsPanel({
  sections,
  activeSection,
  onSelectSection,
  onClose,
  title = '设置',
  projectHint = '先选择项目后再查看这一节',
  children,
}: SettingsPanelProps) {
  const [hintFor, setHintFor] = useState<string | null>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="sq elev-panel flex h-[min(760px,86dvh)] w-[min(1040px,92vw)] overflow-hidden bg-surface-raised">
        <nav className="hairline-r flex w-48 shrink-0 flex-col gap-1 border-line-2 bg-surface-side p-3">
          <p className="px-2 py-1 text-[12.5px] font-semibold text-fg">{title}</p>
          {sections.map((section) => {
            const disabled = section.disabled === true;
            return (
              <button
                key={section.id}
                type="button"
                aria-pressed={section.id === activeSection}
                aria-disabled={disabled}
                onClick={() => {
                  if (disabled) {
                    setHintFor(section.id);
                    return;
                  }
                  setHintFor(null);
                  onSelectSection(section.id);
                }}
                className={cn(
                  'sq flex items-center gap-2 px-2 py-1.5 text-left text-[12.5px]',
                  section.id === activeSection
                    ? 'bg-accent-weak text-accent'
                    : 'text-fg-muted hover:bg-hover hover:text-fg',
                  disabled && 'opacity-50',
                )}
              >
                <span className="flex-1">{section.label}</span>
                {section.badge !== undefined && (
                  <span className="sq bg-accent-weak px-1 text-[10px] text-accent">
                    {section.badge}
                  </span>
                )}
                {disabled && <span className="text-[10px] text-fg-faint">需项目</span>}
              </button>
            );
          })}
          {hintFor !== null && (
            <p className="sq mt-1 bg-surface px-2 py-1 text-[11px] text-fg-faint">{projectHint}</p>
          )}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="hairline-b flex shrink-0 items-center justify-end border-line-2 px-3 py-2">
            <button
              type="button"
              onClick={onClose}
              title="关闭"
              aria-label="关闭设置"
              className="sq flex h-7 w-7 items-center justify-center text-fg-subtle hover:bg-hover hover:text-fg"
            >
              <X size={14} />
            </button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** 设置项行（标题 + 说明 + 右侧控件） */
export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="hairline-b flex items-start gap-4 border-line-1 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-fg">{label}</p>
        {hint !== undefined && <p className="mt-0.5 text-[11.5px] text-fg-faint">{hint}</p>}
      </div>
      {children !== undefined && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export function SettingsSectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2">
      <h3 className="text-[13.5px] font-semibold text-fg">{title}</h3>
      {hint !== undefined && <p className="mt-0.5 text-[11.5px] text-fg-faint">{hint}</p>}
    </div>
  );
}

/** 空态/提示条 */
export function SettingsNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error';
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'sq mb-2 px-2.5 py-1.5 text-[11.5px]',
        tone === 'info' && 'bg-surface-side text-fg-muted',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'error' && 'bg-danger-soft text-danger',
      )}
    >
      {children}
    </p>
  );
}
