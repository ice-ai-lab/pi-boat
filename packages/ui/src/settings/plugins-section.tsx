import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';
import { cn } from '../utils/cn';
import styles from './config-ui.module.css';
import {
  ConfigButton,
  ConfigDetail,
  ConfigDetailActions,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigDetailStack,
  ConfigDetailTitle,
  ConfigEmptyState,
  ConfigField,
  ConfigFooter,
  ConfigListAction,
  ConfigPanelShell,
  ConfigSectionTitle,
  ConfigSidebar,
  ConfigSidebarGroupLabel,
  ConfigSidebarItem,
  ConfigSidebarList,
  ConfigSidebarText,
  ConfigSplitView,
  ConfigStatusDot,
  ConfigSwitch,
} from './settings-ui';
import skillStyles from './skills.module.css';
import type { SkillUpdateView } from './skills-section';

/**
 * PluginsSection（docs/06 §4.4；对齐 参考实现 PluginsConfig 的主从布局）：
 * 左侧独立扩展 + 按作用域分组的包清单（状态点按 status 着色）+ 底部「添加插件」；
 * 右侧包详情（动作行 + 信息栅格 + 已解析资源）或安装面板；底部 totals + 更新/刷新。
 *
 * 「禁用」= settings 里保留来源但清空资源过滤器（行不消失，可再开）；
 * 「移除」= 连磁盘副本一起删。
 */

export interface PluginResourceView {
  kind: 'extension' | 'skill' | 'prompt' | 'theme';
  name: string;
  path: string;
  relativePath: string;
}

export interface PluginPackageView {
  source: string;
  displayName: string;
  scope: 'user' | 'project';
  type: 'npm' | 'git' | 'local';
  installedPath?: string;
  filtered: boolean;
  enabled: boolean;
  packageName?: string;
  version?: string;
  configuredVersion?: string;
  description?: string;
  counts: { extensions: number; skills: number; prompts: number; themes: number };
  resources: PluginResourceView[];
  status: 'loaded' | 'installed' | 'missing' | 'disabled';
}

export interface StandaloneExtensionView {
  kind: 'extension';
  name: string;
  path: string;
  relativePath: string;
  scope: 'user' | 'project' | 'temporary';
  enabled: boolean;
}

export interface PluginsSectionProps {
  cwd: string | null;
  packages: PluginPackageView[];
  standaloneExtensions: StandaloneExtensionView[];
  totals: { packages: number; extensions: number; skills: number; prompts: number; themes: number };
  projectResourcesLoaded: boolean;
  loading: boolean;
  busy: boolean;
  /** 当前会话 id（「重新加载会话」用；null = 按钮禁用） */
  sessionId: string | null;
  onAction(action: 'enable' | 'disable' | 'remove' | 'update', source: string): void;
  onReloadSession(): void;
  install: {
    source: string;
    onSourceChange(value: string): void;
    scope: 'global' | 'project';
    onScopeChange(scope: 'global' | 'project'): void;
    onInstall(): void;
    busy: boolean;
  };
  updates: {
    results: SkillUpdateView[];
    checking: boolean;
    onCheck(): void;
    onUpdateAll(): void;
  };
  onRefresh(): void;
}

function shortenPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, '~');
}

function scopeKey(scope: 'user' | 'project'): 'global' | 'project' {
  return scope === 'project' ? 'project' : 'global';
}

function statusColor(status: PluginPackageView['status']): string {
  if (status === 'loaded') return 'var(--accent)';
  if (status === 'installed') return '#f59e0b';
  if (status === 'disabled') return 'var(--text-dim)';
  return 'var(--red)';
}

function versionSummary(
  pkg: PluginPackageView,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const parts = [];
  if (pkg.version !== undefined) parts.push(t('i18n.installedVersion', { version: pkg.version }));
  if (pkg.configuredVersion !== undefined) {
    parts.push(t('i18n.configuredVersion', { version: pkg.configuredVersion }));
  }
  return parts.length > 0 ? parts.join(' · ') : t('i18n.unknown');
}

function resourceSummary(
  pkg: PluginPackageView,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (pkg.status === 'disabled') return t('i18n.disabled');
  const labels = {
    extensions: t('i18n.extensionShort'),
    skills: t('i18n.skillShort'),
    prompts: t('i18n.promptShort'),
    themes: t('i18n.themeShort'),
  } as const;
  const parts = (['extensions', 'skills', 'prompts', 'themes'] as const)
    .map((kind) =>
      pkg.counts[kind] > 0
        ? t('i18n.resourceCount', { count: pkg.counts[kind], label: labels[kind] })
        : '',
    )
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : t('i18n.noResources');
}

function ScopeTag({ scope }: { scope: string }) {
  const isProject = scope === 'project';
  return (
    <span
      style={{
        fontSize: 10,
        padding: '1px 5px',
        borderRadius: 3,
        flexShrink: 0,
        background: isProject ? 'rgba(99,102,241,0.12)' : 'rgba(120,120,120,0.12)',
        color: isProject ? 'rgba(99,102,241,0.85)' : 'var(--text-dim)',
      }}
    >
      {scope}
    </span>
  );
}

const inputStyle = {
  width: '100%',
  height: 36,
  padding: '0 11px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--bg-panel)',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
} as const;

/** 容忍粘贴 `pi install <pkg>` 命令：剥掉前缀只留来源 */
function normalizePluginSourceInput(value: string): string {
  const match = value.trim().match(/^\$?\s*pi\s+install\s+(\S+)\s*$/);
  return match?.[1] ?? value;
}

function installLocation(scope: 'global' | 'project', cwd: string | null): string {
  return scope === 'project'
    ? `${shortenPath(cwd ?? '')}/.pi/agent/{npm,git}`
    : '~/.pi/agent/{npm,git}';
}

// ── 详情：包 ─────────────────────────────────────────────────────────────────

function ResourceList({ pkg }: { pkg: PluginPackageView }) {
  const { t } = useI18n();
  const labels = {
    extension: t('i18n.extensions'),
    skill: t('common.skills'),
    prompt: t('i18n.prompts'),
    theme: t('i18n.themes'),
  } as const;
  const groups = (['extension', 'skill', 'prompt', 'theme'] as const)
    .map((kind) => ({
      kind,
      label: labels[kind],
      resources: pkg.resources.filter((r) => r.kind === kind),
    }))
    .filter((group) => group.resources.length > 0);

  if (groups.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        {pkg.status === 'disabled' ? t('i18n.packageDisabled') : t('i18n.noResolvedResources')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {groups.map((group, groupIndex) => (
        <div
          key={group.kind}
          style={{
            borderTop: groupIndex === 0 ? 'none' : '1px solid var(--border)',
            paddingTop: groupIndex === 0 ? 0 : 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-dim)',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {group.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.resources.map((resource) => (
              <div key={`${resource.kind}:${resource.path}`} style={{ minWidth: 0 }}>
                <div
                  title={resource.path}
                  style={{
                    fontSize: 12,
                    color: 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {resource.name}
                </div>
                <div
                  title={resource.path}
                  style={{
                    fontSize: 10,
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: 1,
                  }}
                >
                  {resource.relativePath}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PackageDetail({
  pkg,
  cwd,
  busy,
  sessionId,
  updateStatus,
  checkingUpdate,
  onAction,
  onReloadSession,
}: {
  pkg: PluginPackageView;
  cwd: string | null;
  busy: boolean;
  sessionId: string | null;
  updateStatus?: SkillUpdateView;
  checkingUpdate: boolean;
  onAction(action: 'enable' | 'disable' | 'remove' | 'update', source: string): void;
  onReloadSession(): void;
}) {
  const { t } = useI18n();
  const enabled = pkg.enabled;
  const updateAvailable = updateStatus?.state === 'update-available';
  const canCheckForUpdates = pkg.type !== 'local';
  const description = pkg.description?.trim();

  return (
    <ConfigDetailStack>
      <ConfigDetailHeader className={styles.isTopAligned}>
        <ConfigDetailHeaderInfo>
          <ScopeTag scope={scopeKey(pkg.scope)} />
          {pkg.status === 'disabled' && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                background: 'rgba(120,120,120,0.12)',
                color: 'var(--text-dim)',
              }}
            >
              {t('i18n.disabled')}
            </span>
          )}
          {pkg.filtered && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                background: 'rgba(245,158,11,0.12)',
                color: 'var(--amber)',
              }}
            >
              {t('i18n.filtered')}
            </span>
          )}
          <span
            title={pkg.source}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {pkg.source}
          </span>
        </ConfigDetailHeaderInfo>

        <ConfigDetailActions>
          <ConfigButton
            size="small"
            variant={updateAvailable ? 'primary' : 'secondary'}
            onClick={() => onAction('update', pkg.source)}
            disabled={busy || checkingUpdate}
            title={updateAvailable ? t('i18n.updateAvailable') : undefined}
          >
            {checkingUpdate
              ? t('i18n.checking')
              : updateAvailable || !canCheckForUpdates
                ? t('i18n.update')
                : t('i18n.check')}
          </ConfigButton>
          <ConfigButton
            size="small"
            onClick={onReloadSession}
            disabled={sessionId === null || busy}
            title={sessionId !== null ? t('i18n.reloadSession') : t('i18n.openSessionToReload')}
          >
            {t('i18n.reloadSession')}
          </ConfigButton>
          <ConfigButton
            variant="danger"
            size="small"
            onClick={() => onAction('remove', pkg.source)}
            disabled={busy}
          >
            {t('i18n.remove')}
          </ConfigButton>
          <ConfigSwitch
            checked={enabled}
            loading={busy}
            onChange={() => onAction(enabled ? 'disable' : 'enable', pkg.source)}
            label={enabled ? t('i18n.disablePackage') : t('i18n.enablePackage')}
          />
        </ConfigDetailActions>
      </ConfigDetailHeader>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(96px, 130px) minmax(0, 1fr)',
          gap: '9px 14px',
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        {description !== undefined && description !== '' && (
          <>
            <div style={{ color: 'var(--text-dim)' }}>{t('i18n.description')}</div>
            <div style={{ color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
              {description}
            </div>
          </>
        )}
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.status')}</div>
        <div style={{ color: statusColor(pkg.status), textTransform: 'capitalize' }}>
          {pkg.status}
        </div>
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.version')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div className={skillStyles.versionRow}>
            <span className={skillStyles.versionValue}>{versionSummary(pkg, t)}</span>
            {updateAvailable && (
              <span
                className={cn(skillStyles.versionValue, skillStyles.isUpdate)}
                title={updateStatus?.latestVersion}
              >
                {t('i18n.updateAvailable')}
              </span>
            )}
            {canCheckForUpdates && checkingUpdate && (
              <span className={cn(skillStyles.updateStatus, skillStyles.isChecking)}>
                {t('i18n.checking')}
              </span>
            )}
          </div>
        </div>
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.package')}</div>
        <div
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            overflowWrap: 'anywhere',
          }}
        >
          {pkg.packageName ?? pkg.displayName}
        </div>
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.resources')}</div>
        <div style={{ color: 'var(--text-muted)' }}>{resourceSummary(pkg, t)}</div>
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.installedPath')}</div>
        <div
          style={{
            color: pkg.installedPath !== undefined ? 'var(--text-muted)' : 'var(--red)',
            fontFamily: 'var(--font-mono)',
            overflowWrap: 'anywhere',
          }}
        >
          {pkg.installedPath !== undefined ? shortenPath(pkg.installedPath) : t('i18n.notFound')}
        </div>
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.cwd')}</div>
        <div
          style={{
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            overflowWrap: 'anywhere',
          }}
        >
          {cwd === null ? '—' : shortenPath(cwd)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ConfigSectionTitle>{t('i18n.resolvedResources')}</ConfigSectionTitle>
        <ResourceList pkg={pkg} />
      </div>
    </ConfigDetailStack>
  );
}

// ── 详情：独立扩展 ────────────────────────────────────────────────────────────

function StandaloneExtensionDetail({ extension }: { extension: StandaloneExtensionView }) {
  const { t } = useI18n();
  return (
    <ConfigDetailStack>
      <ConfigDetailHeader>
        <ConfigDetailHeaderInfo>
          <ScopeTag scope={extension.scope} />
          <ConfigDetailTitle>{extension.name}</ConfigDetailTitle>
        </ConfigDetailHeaderInfo>
      </ConfigDetailHeader>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(96px, 130px) minmax(0, 1fr)',
          gap: '9px 14px',
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.status')}</div>
        <div style={{ color: extension.enabled ? 'var(--accent)' : 'var(--text-dim)' }}>
          {extension.enabled ? 'loaded' : t('i18n.disabled')}
        </div>
        <div style={{ color: 'var(--text-dim)' }}>{t('i18n.installedPath')}</div>
        <div
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            overflowWrap: 'anywhere',
          }}
        >
          {shortenPath(extension.path)}
        </div>
      </div>
    </ConfigDetailStack>
  );
}

// ── 详情：添加插件 ────────────────────────────────────────────────────────────

function AddPluginPanel({
  cwd,
  install,
  projectResourcesLoaded,
}: {
  cwd: string | null;
  install: PluginsSectionProps['install'];
  projectResourcesLoaded: boolean;
}) {
  const { t } = useI18n();
  const examples = [
    'npm:@scope/pi-plugin',
    'git:https://github.com/user/repo',
    '/absolute/path/to/plugin',
  ];

  return (
    <ConfigDetailStack className={styles.isFill}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <ConfigDetailTitle>{t('i18n.addPlugin')}</ConfigDetailTitle>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {installLocation(install.scope, cwd)}
        </div>
      </div>

      <ConfigField label="Source">
        <input
          value={install.source}
          onChange={(event) => install.onSourceChange(event.target.value)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text');
            const normalized = normalizePluginSourceInput(pasted);
            if (normalized === pasted) return;
            event.preventDefault();
            install.onSourceChange(normalized);
          }}
          onBlur={(event) =>
            install.onSourceChange(normalizePluginSourceInput(event.currentTarget.value))
          }
          placeholder="npm:@scope/package"
          style={inputStyle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && install.source.trim() !== '' && !install.busy) {
              install.onInstall();
            }
          }}
        />
      </ConfigField>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            border: '1px solid var(--border)',
            borderRadius: 7,
            overflow: 'hidden',
            height: 30,
          }}
        >
          {(['global', 'project'] as const).map((scope) => {
            const active = install.scope === scope;
            const disabled = scope === 'project' && !projectResourcesLoaded;
            return (
              <button
                key={scope}
                type="button"
                onClick={() => {
                  if (!disabled) install.onScopeChange(scope);
                }}
                disabled={disabled}
                title={disabled ? t('trust.projectScopeUnavailable') : undefined}
                style={{
                  width: 76,
                  border: 'none',
                  borderRight: scope === 'global' ? '1px solid var(--border)' : 'none',
                  background: active ? 'var(--bg-selected)' : 'none',
                  color: active ? 'var(--text)' : 'var(--text-muted)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                  fontSize: 12,
                }}
              >
                {t(scope === 'global' ? 'skills.scope.global' : 'skills.scope.project')}
              </button>
            );
          })}
        </div>
        <ConfigButton
          variant="primary"
          onClick={install.onInstall}
          disabled={install.busy || install.source.trim() === ''}
          className={styles.isPushedRight}
        >
          {install.busy ? t('i18n.installing') : t('i18n.install')}
        </ConfigButton>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          {t('plugins.examples')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => install.onSourceChange(example)}
              style={{
                width: '100%',
                minHeight: 30,
                textAlign: 'left',
                padding: '6px 9px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg-panel)',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'var(--bg-hover)';
                event.currentTarget.style.color = 'var(--text-muted)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'var(--bg-panel)';
                event.currentTarget.style.color = 'var(--text-dim)';
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </ConfigDetailStack>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

function packageKeyOf(pkg: PluginPackageView): string {
  return `${pkg.scope}\0${pkg.source}`;
}

function extensionKeyOf(extension: StandaloneExtensionView): string {
  return `extension\0${extension.path}`;
}

export function PluginsSection({
  cwd,
  packages,
  standaloneExtensions,
  totals,
  projectResourcesLoaded,
  loading,
  busy,
  sessionId,
  onAction,
  onReloadSession,
  install,
  updates,
  onRefresh,
}: PluginsSectionProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);

  // 选中态跟随清单：保留已选，否则选第一个条目；清单为空自动进安装面板
  useEffect(() => {
    setSelected((current) => {
      if (
        current !== null &&
        (packages.some((pkg) => packageKeyOf(pkg) === current) ||
          standaloneExtensions.some((extension) => extensionKeyOf(extension) === current))
      ) {
        return current;
      }
      return packages[0] !== undefined
        ? packageKeyOf(packages[0])
        : standaloneExtensions[0] !== undefined
          ? extensionKeyOf(standaloneExtensions[0])
          : null;
    });
    setAddMode(
      (current) => current || (packages.length === 0 && standaloneExtensions.length === 0),
    );
  }, [packages, standaloneExtensions]);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => packageKeyOf(pkg) === selected) ?? null,
    [packages, selected],
  );
  const selectedExtension = useMemo(
    () => standaloneExtensions.find((extension) => extensionKeyOf(extension) === selected) ?? null,
    [standaloneExtensions, selected],
  );

  const grouped = useMemo(
    () =>
      (['project', 'user'] as const)
        .map((scope) => ({ scope, packages: packages.filter((pkg) => pkg.scope === scope) }))
        .filter((group) => group.packages.length > 0),
    [packages],
  );

  const availableUpdateCount = updates.results.filter(
    (result) => result.state === 'update-available',
  ).length;
  const updateFor = (pkg: PluginPackageView) =>
    updates.results.find((result) => result.package === pkg.source);
  const footerBusy = loading || busy || updates.checking;

  return (
    <ConfigPanelShell
      embedded
      title={t('common.plugins')}
      subtitle={cwd === null ? undefined : shortenPath(cwd)}
      closeLabel={t('i18n.close')}
      onClose={() => {}}
    >
      {cwd === null ? (
        <ConfigEmptyState>{t('settings.projectRequired')}</ConfigEmptyState>
      ) : (
        <>
          {!projectResourcesLoaded && (
            <div role="status" className={styles.trustNotice}>
              {t('trust.pluginsNotLoaded')}
            </div>
          )}
          <ConfigSplitView>
            <ConfigSidebar>
              <ConfigSidebarList>
                {loading ? (
                  <div className={styles.sidebarMessage}>{t('i18n.loading')}</div>
                ) : packages.length === 0 && standaloneExtensions.length === 0 ? (
                  <div className={cn(styles.sidebarMessage, styles.isEmpty)}>
                    {t('i18n.noPlugins')}
                  </div>
                ) : (
                  <>
                    {standaloneExtensions.length > 0 && (
                      <div className={styles.sidebarGroup}>
                        <ConfigSidebarGroupLabel>{t('i18n.extensions')}</ConfigSidebarGroupLabel>
                        {standaloneExtensions.map((extension) => {
                          const key = extensionKeyOf(extension);
                          return (
                            <ConfigSidebarItem
                              key={key}
                              active={!addMode && selected === key}
                              title={extension.path}
                              onClick={() => {
                                setSelected(key);
                                setAddMode(false);
                              }}
                            >
                              <ConfigStatusDot active={extension.enabled} />
                              <ConfigSidebarText
                                className={cn(styles.isGrow, !extension.enabled && styles.isMuted)}
                              >
                                {extension.name}
                              </ConfigSidebarText>
                            </ConfigSidebarItem>
                          );
                        })}
                      </div>
                    )}
                    {grouped.map((group) => (
                      <div key={group.scope} className={styles.sidebarGroup}>
                        <ConfigSidebarGroupLabel>
                          {t(
                            group.scope === 'project'
                              ? 'skills.scope.project'
                              : 'skills.scope.global',
                          )}
                        </ConfigSidebarGroupLabel>
                        {group.packages.map((pkg) => {
                          const key = packageKeyOf(pkg);
                          const hasUpdate = updateFor(pkg)?.state === 'update-available';
                          return (
                            <ConfigSidebarItem
                              key={key}
                              active={!addMode && selected === key}
                              title={pkg.description ?? pkg.source}
                              onClick={() => {
                                setSelected(key);
                                setAddMode(false);
                              }}
                            >
                              <ConfigStatusDot
                                active={pkg.enabled}
                                color={statusColor(pkg.status)}
                              />
                              <ConfigSidebarText
                                className={cn(styles.isGrow, !pkg.enabled && styles.isMuted)}
                              >
                                {pkg.source}
                              </ConfigSidebarText>
                              {hasUpdate && (
                                <span
                                  title={t('i18n.updateAvailable')}
                                  className={skillStyles.updateIndicator}
                                >
                                  ↑
                                </span>
                              )}
                            </ConfigSidebarItem>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
              </ConfigSidebarList>
              <ConfigListAction
                active={addMode}
                onClick={() => {
                  setAddMode(true);
                }}
              >
                {t('i18n.addPlugin')}
              </ConfigListAction>
            </ConfigSidebar>

            <ConfigDetail>
              <ConfigDetailStack className={styles.isFill}>
                {addMode ? (
                  <AddPluginPanel
                    cwd={cwd}
                    install={install}
                    projectResourcesLoaded={projectResourcesLoaded}
                  />
                ) : loading ? null : selectedExtension !== null ? (
                  <StandaloneExtensionDetail extension={selectedExtension} />
                ) : selectedPackage !== null ? (
                  <PackageDetail
                    key={packageKeyOf(selectedPackage)}
                    pkg={selectedPackage}
                    cwd={cwd}
                    busy={busy}
                    sessionId={sessionId}
                    updateStatus={updateFor(selectedPackage)}
                    checkingUpdate={updates.checking}
                    onAction={onAction}
                    onReloadSession={onReloadSession}
                  />
                ) : (
                  <ConfigEmptyState>{t('i18n.selectPackage')}</ConfigEmptyState>
                )}
              </ConfigDetailStack>
            </ConfigDetail>
          </ConfigSplitView>

          <ConfigFooter
            status={
              <span>
                {`${totals.extensions} ext · ${totals.skills} skills · ${totals.prompts} prompts · ${totals.themes} themes`}
              </span>
            }
          >
            <ConfigButton
              variant={availableUpdateCount > 0 ? 'primary' : 'secondary'}
              onClick={() => (availableUpdateCount > 0 ? updates.onUpdateAll() : updates.onCheck())}
              disabled={footerBusy}
              title={availableUpdateCount > 0 ? t('i18n.updateAllPluginsHint') : undefined}
            >
              {updates.checking
                ? t('i18n.checking')
                : availableUpdateCount > 0
                  ? `${t('i18n.updateAllPlugins')} (${availableUpdateCount})`
                  : t('i18n.checkUpdates')}
            </ConfigButton>
            <ConfigButton variant="secondary" onClick={onRefresh} disabled={footerBusy}>
              {t('i18n.refresh')}
            </ConfigButton>
          </ConfigFooter>
        </>
      )}
    </ConfigPanelShell>
  );
}
