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
  ConfigListAction,
  ConfigPanelShell,
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

/**
 * SkillsSection（docs/06 §4.4；对齐 参考实现 SkillsConfig 的主从布局）：
 * 左侧按作用域分组的技能清单（状态点 = 是否允许模型自动调用）+ 底部「添加技能」；
 * 右侧详情（作用域标签 + 路径 + 开关 + Name/Description）或安装面板。
 *
 * 开关写的是 SKILL.md frontmatter（core 定点替换），不改 settings。
 */

/** skills 列表项（协议 SkillInfo 的展示子集） */
export interface SkillItemView {
  name: string;
  description: string;
  /** SKILL.md 绝对路径（详情页展示 + 选中记忆的键） */
  filePath: string;
  /** 来源路径（包 / 用户目录 / 项目目录） */
  source: string;
  scope: 'user' | 'project' | 'temporary';
  disableModelInvocation: boolean;
}

export interface SkillSearchItemView {
  package: string;
  description?: string;
  installs: number | null;
  url: string;
}

export interface SkillUpdateView {
  package: string;
  state: 'up-to-date' | 'update-available' | 'unsupported' | 'error';
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

export interface SkillsSectionProps {
  cwd: string | null;
  skills: SkillItemView[];
  diagnostics: { type: string; message: string }[];
  projectResourcesLoaded: boolean;
  loading: boolean;
  busy: boolean;
  onToggle(skill: SkillItemView, disableModelInvocation: boolean): void;

  search: {
    query: string;
    onQueryChange(q: string): void;
    onSearch(): void;
    results: SkillSearchItemView[];
    loading: boolean;
    error: string | null;
    onInstall(packageName: string, scope: 'global' | 'project'): void;
    installingPackage: string | null;
  };

  updates: {
    results: SkillUpdateView[];
    checking: boolean;
    updating: boolean;
    onCheck(): void;
    onUpdate(packageName?: string): void;
  };
}

function shortenPath(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+/, '~');
}

/** 侧栏与详情标签的作用域三分类（对齐 参考实现 的 sourceLabel） */
function scopeLabel(skill: SkillItemView): 'global' | 'project' | 'path' {
  if (skill.scope === 'user') return 'global';
  if (skill.scope === 'project') return 'project';
  return 'path';
}

/** 详情里的路径展示：项目技能相对 cwd，其余缩写家目录 */
function displayPath(skill: SkillItemView, cwd: string | null): string {
  if (scopeLabel(skill) === 'project' && cwd !== null && skill.filePath.startsWith(cwd)) {
    const rel = skill.filePath.slice(cwd.length).replace(/^[/\\]/, '');
    return `./${rel}`;
  }
  return shortenPath(skill.filePath);
}

/** 启用的排前、禁用的排后（与侧栏状态点一致） */
function orderSkillsByDormancy(skills: SkillItemView[]): SkillItemView[] {
  return [
    ...skills.filter((skill) => !skill.disableModelInvocation),
    ...skills.filter((skill) => skill.disableModelInvocation),
  ];
}

const UPDATE_LABEL: Record<SkillUpdateView['state'], string> = {
  'up-to-date': 'i18n.upToDate',
  'update-available': 'i18n.updateAvailable',
  unsupported: 'i18n.automaticChecksUnavailable',
  error: 'i18n.checkFailed',
};

// ── 详情：技能 ────────────────────────────────────────────────────────────────

function SkillDetail({
  skill,
  cwd,
  onToggle,
  toggling,
}: {
  skill: SkillItemView;
  cwd: string | null;
  onToggle(skill: SkillItemView): void;
  toggling: boolean;
}) {
  const { t } = useI18n();
  const label = scopeLabel(skill);
  const enabled = !skill.disableModelInvocation;

  return (
    <ConfigDetailStack>
      <div className={skillStyles.detailHeading}>
        <ConfigDetailHeader>
          <ConfigDetailHeaderInfo>
            <span className={cn(styles.scopeTag, label === 'project' && styles.isProject)}>
              {t(
                label === 'global'
                  ? 'skills.scope.global'
                  : label === 'project'
                    ? 'skills.scope.project'
                    : 'skills.scope.path',
              )}
            </span>
            <span className={styles.detailPath} title={skill.filePath}>
              {displayPath(skill, cwd)}
            </span>
          </ConfigDetailHeaderInfo>
          <ConfigDetailActions>
            <ConfigSwitch
              checked={enabled}
              loading={toggling}
              label={t(enabled ? 'i18n.visibleInPrompt' : 'i18n.hiddenFromPrompt')}
              onChange={() => onToggle(skill)}
            />
          </ConfigDetailActions>
        </ConfigDetailHeader>
        <div className={skillStyles.detailStatusRow}>
          {!enabled && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {t('i18n.hiddenButInvocable')}
            </span>
          )}
        </div>
      </div>

      <ConfigField label={t('i18n.name')}>
        <span className={skillStyles.nameValue}>{skill.name}</span>
      </ConfigField>

      <ConfigField label={t('i18n.description')}>
        <span className={skillStyles.description}>{skill.description}</span>
      </ConfigField>
    </ConfigDetailStack>
  );
}

// ── 详情：添加技能（npm 搜索 / 安装 / 更新检查） ─────────────────────────────

const inputStyle = {
  flex: 1,
  minWidth: 0,
  padding: '7px 10px',
  fontSize: 12,
  background: 'var(--bg-panel)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  outline: 'none',
} as const;

function AddSkillPanel({
  cwd,
  projectResourcesLoaded,
  search,
  updates,
  onInstalledFocus,
}: {
  cwd: string | null;
  projectResourcesLoaded: boolean;
  search: SkillsSectionProps['search'];
  updates: SkillsSectionProps['updates'];
  onInstalledFocus(): void;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const hasUpdatable = updates.results.length > 0;
  const pendingCount = updates.results.filter(
    (result) => result.state === 'update-available',
  ).length;
  const installPath =
    scope === 'global' ? '~/.pi/agent/skills/' : `${shortenPath(cwd ?? '')}/.pi/skills/`;

  return (
    <ConfigDetailStack className={styles.isFill}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        <ConfigDetailTitle>{t('i18n.addSkill')}</ConfigDetailTitle>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={search.query}
            onChange={(event) => search.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') search.onSearch();
            }}
            placeholder={t('i18n.skillSearchPlaceholder')}
            style={inputStyle}
          />
          <ConfigButton
            variant="primary"
            onClick={search.onSearch}
            disabled={search.loading || search.query.trim() === ''}
          >
            {search.loading ? t('i18n.searching') : t('i18n.search')}
          </ConfigButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              borderRadius: 5,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {(['global', 'project'] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  if (entry === 'global' || projectResourcesLoaded) setScope(entry);
                }}
                disabled={entry === 'project' && !projectResourcesLoaded}
                title={
                  entry === 'project' && !projectResourcesLoaded
                    ? t('trust.projectScopeUnavailable')
                    : undefined
                }
                style={{
                  padding: '3px 10px',
                  border: 'none',
                  cursor:
                    entry === 'project' && !projectResourcesLoaded ? 'not-allowed' : 'pointer',
                  background: scope === entry ? 'var(--bg-selected)' : 'none',
                  color: scope === entry ? 'var(--text)' : 'var(--text-dim)',
                  fontWeight: scope === entry ? 600 : 400,
                  opacity: entry === 'project' && !projectResourcesLoaded ? 0.45 : 1,
                  borderRight: entry === 'global' ? '1px solid var(--border)' : 'none',
                }}
              >
                {t(entry === 'global' ? 'skills.scope.global' : 'skills.scope.project')}
              </button>
            ))}
          </div>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            → {installPath}
          </span>
        </div>

        {search.error !== null && (
          <div style={{ fontSize: 12, color: '#f87171' }}>{search.error}</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {search.results.map((result) => {
          const isInstalling = search.installingPackage === result.package;
          return (
            <div
              key={result.package}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}
                >
                  {result.package}
                </div>
                {result.description !== undefined && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {result.description}
                  </div>
                )}
              </div>
              {result.installs !== null && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  ↓{result.installs}
                </span>
              )}
              <ConfigButton
                size="small"
                disabled={search.installingPackage !== null}
                onClick={() => search.onInstall(result.package, scope)}
                style={{ flexShrink: 0 }}
              >
                {isInstalling ? t('i18n.installing') : t('i18n.install')}
              </ConfigButton>
            </div>
          );
        })}
        {search.results.length === 0 && !search.loading && search.error === null && (
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.8 }}>
            {t('skills.searchHint')}
          </div>
        )}
      </div>

      {/* 更新检查（作用于已安装的 npm 技能包） */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
            {t('i18n.checkUpdates')}
          </span>
          <ConfigButton size="small" disabled={updates.checking} onClick={updates.onCheck}>
            {updates.checking ? t('i18n.checking') : t('i18n.check')}
          </ConfigButton>
          <ConfigButton
            size="small"
            disabled={
              updates.updating ||
              !updates.results.some((result) => result.state === 'update-available')
            }
            onClick={() => updates.onUpdate()}
          >
            {updates.updating ? t('i18n.updating') : t('i18n.update')}
          </ConfigButton>
          {pendingCount > 0 && (
            <span style={{ fontSize: 11, color: '#d97706' }}>
              {pendingCount} {t('i18n.updates')}
            </span>
          )}
          <button
            type="button"
            onClick={onInstalledFocus}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'none',
              color: 'var(--text-dim)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ← {t('skills.backToList')}
          </button>
        </div>
        {hasUpdatable &&
          updates.results.map((result) => (
            <div
              key={result.package}
              style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {result.package}
              </span>
              <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                {result.state === 'update-available'
                  ? `${result.currentVersion ?? '?'} → ${result.latestVersion ?? '?'}`
                  : (result.error ?? t(UPDATE_LABEL[result.state]))}
              </span>
              {result.state === 'update-available' && (
                <ConfigButton
                  size="small"
                  disabled={updates.updating}
                  onClick={() => updates.onUpdate(result.package)}
                >
                  {t('i18n.update')}
                </ConfigButton>
              )}
            </div>
          ))}
      </div>
    </ConfigDetailStack>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function SkillsSection({
  cwd,
  skills,
  diagnostics,
  projectResourcesLoaded,
  loading,
  busy,
  onToggle,
  search,
  updates,
}: SkillsSectionProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);

  // 选中态跟随列表：优先保留已选，否则选第一个启用的技能
  useEffect(() => {
    setSelected((current) => {
      if (current !== null && skills.some((skill) => skill.filePath === current)) return current;
      const first = skills.find((skill) => !skill.disableModelInvocation) ?? skills[0];
      return first?.filePath ?? null;
    });
  }, [skills]);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.filePath === selected) ?? null,
    [skills, selected],
  );

  const groups = useMemo(() => {
    const definitions: { label: string; match: (skill: SkillItemView) => boolean }[] = [
      { label: t('skills.scope.project'), match: (skill) => scopeLabel(skill) === 'project' },
      { label: t('skills.scope.global'), match: (skill) => scopeLabel(skill) === 'global' },
      { label: t('skills.scope.path'), match: (skill) => scopeLabel(skill) === 'path' },
    ];
    return definitions
      .map(({ label, match }) => ({ label, skills: skills.filter(match) }))
      .filter((group) => group.skills.length > 0);
  }, [skills, t]);

  const toggle = (skill: SkillItemView) => {
    onToggle(skill, !skill.disableModelInvocation);
  };

  return (
    <ConfigPanelShell
      embedded
      title={t('common.skills')}
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
              {t('trust.skillsNotLoaded')}
            </div>
          )}
          <ConfigSplitView>
            <ConfigSidebar>
              <ConfigSidebarList>
                {loading ? (
                  <div className={styles.sidebarMessage}>{t('i18n.loading')}</div>
                ) : skills.length === 0 ? (
                  <div className={cn(styles.sidebarMessage, styles.isEmpty)}>
                    {t('i18n.noSkills')}
                  </div>
                ) : (
                  groups.map((group) => (
                    <div key={group.label} className={styles.sidebarGroup}>
                      <ConfigSidebarGroupLabel>{group.label}</ConfigSidebarGroupLabel>
                      {orderSkillsByDormancy(group.skills).map((skill) => {
                        const isSelected = !addMode && selected === skill.filePath;
                        const disabled = skill.disableModelInvocation;
                        return (
                          <ConfigSidebarItem
                            key={skill.filePath}
                            active={isSelected}
                            onClick={() => {
                              setSelected(skill.filePath);
                              setAddMode(false);
                            }}
                          >
                            <ConfigStatusDot active={!disabled} />
                            <ConfigSidebarText
                              className={cn(styles.isGrow, disabled && styles.isMuted)}
                            >
                              {skill.name}
                            </ConfigSidebarText>
                          </ConfigSidebarItem>
                        );
                      })}
                    </div>
                  ))
                )}
                {diagnostics.length > 0 && (
                  <div
                    className={cn(styles.sidebarMessage, styles.isError)}
                    title={diagnostics.map((d) => d.message).join('\n')}
                  >
                    {diagnostics.length} ⚠
                  </div>
                )}
              </ConfigSidebarList>
              <ConfigListAction
                active={addMode}
                onClick={() => {
                  setAddMode(true);
                }}
              >
                {t('i18n.addSkill')}
              </ConfigListAction>
            </ConfigSidebar>

            <ConfigDetail>
              <ConfigDetailStack className={styles.isFill}>
                {addMode ? (
                  <AddSkillPanel
                    cwd={cwd}
                    projectResourcesLoaded={projectResourcesLoaded}
                    search={search}
                    updates={updates}
                    onInstalledFocus={() => setAddMode(false)}
                  />
                ) : loading ? null : selectedSkill !== null ? (
                  <SkillDetail
                    key={selectedSkill.filePath}
                    skill={selectedSkill}
                    cwd={cwd}
                    toggling={busy}
                    onToggle={toggle}
                  />
                ) : (
                  <ConfigEmptyState>{t('i18n.selectSkill')}</ConfigEmptyState>
                )}
              </ConfigDetailStack>
            </ConfigDetail>
          </ConfigSplitView>
        </>
      )}
    </ConfigPanelShell>
  );
}
