import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../utils/cn';
import styles from './config-ui.module.css';

type ConfigButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ConfigButtonSize = 'small' | 'default';

// CSS Modules 索引签名在 noUncheckedIndexedAccess 下为 string | undefined，故此处放宽（键仍强约束）
const BUTTON_VARIANT_CLASS: Record<ConfigButtonVariant, string | undefined> = {
  primary: styles.buttonPrimary,
  secondary: styles.buttonSecondary,
  danger: styles.buttonDanger,
  ghost: styles.buttonGhost,
};
const BUTTON_SIZE_CLASS: Record<ConfigButtonSize, string | undefined> = {
  small: styles.buttonSmall,
  default: styles.buttonDefault,
};

/**
 * SettingsUi（T2-8）：按设计规范 全族。
 * 只把 `"use client"` 去掉、缺省文案改为英文（真正的文案由调用方走 i18n）。
 * CSS 单一来源是 `config-ui.module.css`（原 `.config-*` 全局类，2026 模块化）。
 */
interface ConfigPanelShellProps {
  embedded: boolean;
  title: string;
  subtitle?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  height?: string;
}

export function ConfigPanelShell({
  embedded,
  title,
  subtitle,
  closeLabel = 'Close',
  onClose,
  children,
  width = 900,
  height = '78vh',
}: ConfigPanelShellProps) {
  const panelStyle = embedded
    ? undefined
    : ({
        '--config-panel-width': `${width}px`,
        '--config-panel-height': height,
      } as CSSProperties);

  return (
    <>
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: 按设计规范；`aria-modal` 仅在非 embedded 时有效 */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 按设计规范的遮罩点击关闭 */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上 */}
      <div
        role={embedded ? undefined : 'dialog'}
        aria-modal={embedded ? undefined : 'true'}
        aria-label={title}
        className={cn(styles.panelRoot, embedded ? styles.isEmbedded : styles.isModal)}
        onClick={(event) => {
          if (!embedded && event.target === event.currentTarget) onClose();
        }}
      >
        <div className={styles.panelSurface} style={panelStyle}>
          {!embedded && (
            <div className={styles.panelHeader}>
              <strong className={styles.panelTitle}>{title}</strong>
              {subtitle !== undefined && (
                <code className={styles.panelSubtitle} title={subtitle}>
                  {subtitle}
                </code>
              )}
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                title={closeLabel}
                aria-label={closeLabel}
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </>
  );
}

export function ConfigSplitView({ children }: { children: ReactNode }) {
  return <div className={styles.splitView}>{children}</div>;
}

export function ConfigSidebar({ children }: { children: ReactNode }) {
  return <aside className={styles.sidebar}>{children}</aside>;
}

export function ConfigSidebarList({ children }: { children: ReactNode }) {
  return <div className={styles.sidebarList}>{children}</div>;
}

export function ConfigSidebarGroupLabel({ children }: { children: ReactNode }) {
  return <div className={styles.sidebarGroupLabel}>{children}</div>;
}

export function ConfigSidebarItem({
  active = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      aria-current={active ? 'page' : undefined}
      className={[styles.sidebarItem, className].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}

export function ConfigSidebarText({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={[styles.sidebarText, className].filter(Boolean).join(' ')} />;
}

export function ConfigDetailStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={[styles.detailStack, className].filter(Boolean).join(' ')} />;
}

export function ConfigDetailHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={[styles.detailHeader, className].filter(Boolean).join(' ')} />;
}

export function ConfigDetailHeaderInfo({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={[styles.detailHeaderInfo, className].filter(Boolean).join(' ')} />
  );
}

export function ConfigDetailActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={[styles.detailActions, className].filter(Boolean).join(' ')} />;
}

export function ConfigDetailTitle({ children }: { children: ReactNode }) {
  return <div className={styles.detailTitle}>{children}</div>;
}

export function ConfigSectionTitle({ children }: { children: ReactNode }) {
  return <div className={styles.sectionTitle}>{children}</div>;
}

export function ConfigField({
  label,
  children,
  style,
}: {
  label: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className={styles.field} style={style}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

export function ConfigEmptyState({ children }: { children: ReactNode }) {
  return <div className={styles.emptyState}>{children}</div>;
}

export function ConfigDetail({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={styles.detail} style={style}>
      {children}
    </div>
  );
}

export function ConfigFooter({ status, children }: { status?: ReactNode; children?: ReactNode }) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerStatus}>{status}</div>
      <div className={styles.footerActions}>{children}</div>
    </footer>
  );
}

export function ConfigButton({
  variant = 'secondary',
  size = 'default',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ConfigButtonVariant;
  size?: ConfigButtonSize;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        styles.button,
        BUTTON_VARIANT_CLASS[variant],
        BUTTON_SIZE_CLASS[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ConfigSwitch({
  checked,
  disabled = false,
  loading = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const inactive = disabled || loading;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading || undefined}
      aria-label={label}
      title={label}
      disabled={inactive}
      className={cn(styles.switch, loading && styles.isLoading)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchKnob} aria-hidden="true" />
    </button>
  );
}

export function ConfigListAction({
  active = false,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <div className={styles.listAction}>
      <button
        type="button"
        {...props}
        aria-current={active ? 'page' : undefined}
        className={[styles.listActionButton, className].filter(Boolean).join(' ')}
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
          <path d="M12 5v14M5 12h14" />
        </svg>
        {children}
      </button>
    </div>
  );
}

export function ConfigStatusDot({ active, color }: { active?: boolean; color?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        styles.statusDot,
        active && styles.isActive,
        active === false && styles.isInactive,
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
