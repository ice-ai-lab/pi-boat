import type { ThemePreference } from '@ice-ai/client';
import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '../utils/cn';
import { ThemeIcon } from './theme-icon';

/**
 * SettingsPanel（T5-1）：逐字移植 pi-web `SettingsPanel.tsx` 的外壳——
 * 顶部横向 tab（`.settings-section-tabs` / `.settings-section-tab`）+ 标题 `Settings` 在左
 * + `.config-close-button.settings-dialog-close` 的 `×` 关闭键；内容区 `.settings-dialog-main`
 * 内的每一节用 `.settings-section-host` 常驻挂载（`hidden` 切换，切节不丢状态）。
 * 节清单与内容由宿主给（web 用 settings-navigation 记住上次节）。
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
  /** 按节 id 渲染内容；面板负责挂载一次后常驻（hidden 切换） */
  renderSection(id: string): ReactNode;
}

export function SettingsPanel({
  sections,
  activeSection,
  onSelectSection,
  onClose,
  title = 'Settings',
  projectHint = 'Open a project to configure this section',
  renderSection,
}: SettingsPanelProps) {
  const [hintFor, setHintFor] = useState<string | null>(null);
  const [mountedSections, setMountedSections] = useState<ReadonlySet<string>>(
    () => new Set([activeSection]),
  );

  useEffect(() => {
    setMountedSections((current) => new Set(current).add(activeSection));
  }, [activeSection]);

  // ESC 关闭：document 级监听（G18：焦点不在浮层内时也要能关）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const activateSection = (id: string) => {
    setMountedSections((current) => new Set(current).add(id));
    setHintFor(null);
    onSelectSection(id);
  };

  return (
    <>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="settings-dialog-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="settings-dialog-surface">
          <div className="settings-dialog-header">
            <strong className="settings-dialog-title">{title}</strong>
            <select
              aria-label={title}
              value={activeSection}
              onChange={(event) => activateSection(event.target.value)}
              className="settings-mobile-section-picker"
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id} disabled={section.disabled === true}>
                  {section.label}
                </option>
              ))}
            </select>
            <nav aria-label={title} className="settings-section-tabs">
              {sections.map((section) => {
                const selected = section.id === activeSection;
                const disabled = section.disabled === true;
                return (
                  <button
                    key={section.id}
                    type="button"
                    className="settings-section-tab"
                    disabled={disabled}
                    title={disabled ? projectHint : section.label}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => {
                      if (disabled) {
                        setHintFor(section.id);
                        return;
                      }
                      activateSection(section.id);
                    }}
                  >
                    <SettingsSectionIcon section={section.id} />
                    <span>{section.label}</span>
                    {section.badge !== undefined && (
                      <span className="config-badge">{section.badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="config-close-button settings-dialog-close"
            >
              ×
            </button>
          </div>
          <main className="settings-dialog-main">
            {hintFor !== null && (
              <p className="settings-general-error" role="status">
                {projectHint}
              </p>
            )}
            {sections
              .filter((section) => mountedSections.has(section.id))
              .map((section) => (
                <div
                  key={section.id}
                  hidden={activeSection !== section.id}
                  className="settings-section-host"
                >
                  {renderSection(section.id)}
                </div>
              ))}
          </main>
        </div>
      </div>
    </>
  );
}

/** 设置节图标（移植自 pi-web `SettingsPanel.tsx` 的 `SettingsSectionIcon`；无子代理节） */
export function SettingsSectionIcon({
  section,
  size = 16,
  strokeWidth = 1.8,
}: {
  section: string;
  size?: number;
  strokeWidth?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'settings-section-icon',
  };

  if (section === 'general') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M20 7h-9M14 17H5" />
        <circle cx="7" cy="7" r="3" />
        <circle cx="17" cy="17" r="3" />
      </svg>
    );
  }
  if (section === 'models') {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
      </svg>
    );
  }
  if (section === 'skills') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="m12 2-10 5 10 5 10-5-10-5Z" />
        <path d="m2 12 10 5 10-5M2 17l10 5 10-5" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M9 7V2M15 7V2M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5a6 6 0 0 1-12 0ZM12 19v3" />
    </svg>
  );
}

/**
 * 外观（主题）选择：逐字照抄 pi-web `SettingsPanel.tsx` 的 GeneralSettings 外观段。
 * 档案与标签单一来源是 `@ice-ai/client` 的 `THEME_OPTIONS`（与 pi-web 同序）。
 */
export function ThemeOptions({
  options,
  preference,
  onSelect,
  ariaLabel = 'Appearance',
}: {
  options: readonly { id: ThemePreference; label: string }[];
  preference: ThemePreference;
  onSelect(preference: ThemePreference, origin?: { x: number; y: number }): void;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="settings-theme-options">
      {options.map((option) => (
        <label key={option.id} className="settings-theme-option">
          <input
            type="radio"
            name="theme"
            value={option.id}
            checked={preference === option.id}
            onChange={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onSelect(option.id, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }}
            className="sr-only"
          />
          <ThemeIcon preference={option.id} />
          <span className="settings-theme-option-label">{option.label}</span>
        </label>
      ))}
    </div>
  );
}

/** @deprecated 待改造区仍在使用；pi-web 没有 `.settings-row`，改完后删除（T5-10）。 */
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

/** @deprecated 待改造区仍在使用；pi-web 用 `.settings-general-heading`（T5-10）。 */
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
