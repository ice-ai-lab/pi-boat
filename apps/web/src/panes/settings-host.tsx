import {
  isThinkingExpandedByDefault,
  parseModelsConfigDraft,
  setThinkingExpandedByDefault,
  THEME_OPTIONS,
} from '@ice-ai/client';
import {
  useCheckPluginUpdatesMutation,
  useCheckSkillUpdatesMutation,
  useEnabledModelsQuery,
  useHomeQuery,
  useInstallSkillMutation,
  useModelCatalogMutation,
  useModelsConfigQuery,
  useModelsQuery,
  usePatchSkillMutation,
  usePluginActionMutation,
  usePluginsQuery,
  useRefreshModelsMutation,
  useSearchSkillsMutation,
  useSkillsQuery,
  useUpdateEnabledModelsMutation,
  useUpdateModelsConfigMutation,
  useUpdateSkillsMutation,
} from '@ice-ai/client/react';
import {
  GeneralSection,
  ModelsSection,
  PluginsSection,
  SettingsPanel,
  type SettingsSectionItem,
  SkillsSection,
} from '@ice-ai/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLastSettingsSection,
  type SettingsSection as SectionId,
  setLastSettingsSection,
} from '../services/settings-navigation';
import { useTheme } from '../services/theme';
import { useChatAppearance } from '../services/use-chat-appearance';

/**
 * SettingsHost（F4）：设置浮层的数据装配——模型（可见范围/原文/目录刷新）、
 * skills、plugins。节导航记忆走 services/settings-navigation（项目信任改由 ProjectTrustDialog 承担）。
 */
export interface SettingsHostProps {
  /** 当前项目根（决定项目级资源与信任范围） */
  projectRoot: string | null;
  onClose(): void;
  onNotice(message: string, tone?: 'info' | 'error'): void;
}

export function SettingsHost({ projectRoot, onClose, onNotice }: SettingsHostProps) {
  const [section, setSection] = useState<SectionId>(() => getLastSettingsSection());
  const theme = useTheme();
  const chatAppearance = useChatAppearance();
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  useEffect(() => {
    setThinkingExpanded(isThinkingExpandedByDefault());
  }, []);
  useEffect(() => {
    setLastSettingsSection(section);
  }, [section]);

  const home = useHomeQuery();
  /** 项目级资源的 cwd：项目根 → 家目录（无项目时只用用户级资源） */
  const resourceCwd = projectRoot ?? home.data?.home ?? null;

  // —— 模型 ——
  const models = useModelsQuery(projectRoot ?? undefined);
  const enabled = useEnabledModelsQuery(projectRoot ?? undefined);
  const updateEnabled = useUpdateEnabledModelsMutation(projectRoot ?? undefined);
  const config = useModelsConfigQuery();
  const saveConfig = useUpdateModelsConfigMutation();
  const refreshModels = useRefreshModelsMutation();
  const catalog = useModelCatalogMutation();

  const [configText, setConfigText] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  // models.json 载入 → 编辑草稿（重新载入时覆盖）
  const _configLoadedAt = config.dataUpdatedAt;
  useEffect(() => {
    if (config.data !== undefined) setConfigText(JSON.stringify(config.data.config, null, 2));
  }, [config.data]);

  const parseResult = useMemo(() => parseModelsConfigDraft(configText), [configText]);
  const dirty =
    config.data !== undefined &&
    parseResult.ok &&
    JSON.stringify(parseResult.value) !== JSON.stringify(config.data.config);

  const modelItems = useMemo(() => {
    // 服务端 enabled.models 的 id 是**裸 id**（provider 在旁字段）——必须按 provider:id 组合
    // 与上面的 modelList 对齐，否则勾选态永远错位（会误导用户反向操作）
    const enabledIds = new Set(
      (enabled.data?.models ?? []).map((model) => `${model.provider}:${model.id}`),
    );
    const list = models.data?.modelList ?? [];
    const items = list.map((model) => ({
      id: `${model.provider}:${model.id}`,
      name: model.name,
      provider: model.provider,
      enabled: enabledIds.has(`${model.provider}:${model.id}`),
    }));
    return items.length > 0
      ? items
      : [...enabledIds].map((id) => ({
          id,
          name: id,
          provider: id.split(':')[0] ?? '',
          enabled: true,
        }));
  }, [models.data, enabled.data]);

  const enabledCount = modelItems.filter((model) => model.enabled).length;

  // —— skills / plugins ——
  const skills = useSkillsQuery(resourceCwd);
  const patchSkill = usePatchSkillMutation(resourceCwd);
  const searchSkills = useSearchSkillsMutation();
  const installSkill = useInstallSkillMutation(resourceCwd);
  const checkSkills = useCheckSkillUpdatesMutation();
  const updateSkills = useUpdateSkillsMutation(resourceCwd);
  const plugins = usePluginsQuery(resourceCwd);
  const pluginAction = usePluginActionMutation(resourceCwd);
  const checkPlugins = useCheckPluginUpdatesMutation(resourceCwd);

  const [skillQuery, setSkillQuery] = useState('');
  const [installingPackage, setInstallingPackage] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState('');
  const [installScope, setInstallScope] = useState<'global' | 'project'>('global');

  const toggleEnabled = useCallback(
    (modelId: string, nextEnabled: boolean) => {
      const [providerId, ...rest] = modelId.split(':');
      updateEnabled.mutate(
        {
          op: 'toggle',
          providerId,
          modelId: rest.join(':'),
          enabled: nextEnabled,
        },
        {
          onError: (error) => {
            const message = error.message.includes('last-model')
              ? '不能关闭最后一个可见模型（空列表等于「全部可用」）'
              : error.message.includes('project-shadow')
                ? '项目 .pi/settings.json 覆盖了可见范围，本项目内只读'
                : `修改失败：${error.message}`;
            onNotice(message, 'error');
          },
        },
      );
    },
    [updateEnabled, onNotice],
  );

  const sections: SettingsSectionItem[] = [
    { id: 'general', label: 'General' },
    { id: 'models', label: 'Models' },
    { id: 'skills', label: 'Skills', disabled: resourceCwd === null },
    { id: 'plugins', label: 'Plugins', disabled: resourceCwd === null },
  ];

  const renderSection = (id: string) => {
    if (id === 'general') {
      return (
        <GeneralSection
          theme={{
            options: THEME_OPTIONS,
            preference: theme.preference,
            onSelect: theme.setPreference,
          }}
          chat={{
            width: chatAppearance.width,
            fontSize: chatAppearance.fontSize,
            thinkingExpanded,
            onThinkingExpandedChange: (enabled) => {
              setThinkingExpandedByDefault(enabled);
              setThinkingExpanded(enabled);
            },
            onWidthChange: chatAppearance.setWidth,
            onFontSizeChange: chatAppearance.setFontSize,
          }}
        />
      );
    }
    if (id === 'models') {
      return (
        <ModelsSection
          enabled={{
            models: modelItems,
            scope: enabled.data?.scope ?? 'global',
            canWrite: enabled.data?.canWrite ?? false,
            settingsPath: enabled.data?.settingsPath ?? '',
            warnings: enabled.data?.warnings ?? [],
            hint:
              modelItems.length === 0
                ? '没有可见模型：模型选择器会退化为「全部可用」'
                : enabledCount === 1
                  ? '只剩 1 个可见模型：关闭它会退回「全部可用」语义，故被禁止'
                  : null,
            busy: updateEnabled.isPending,
            onToggle: toggleEnabled,
            onPrune: () =>
              updateEnabled.mutate(
                { op: 'prune' },
                {
                  onSuccess: () => onNotice('已清理匹配不到模型的项'),
                  onError: (error) => onNotice(`prune 失败：${error.message}`, 'error'),
                },
              ),
            onResync: () =>
              updateEnabled.mutate(
                { op: 'resync' },
                {
                  onSuccess: () => onNotice('已按当前目录修复改名残留'),
                  onError: (error) => onNotice(`resync 失败：${error.message}`, 'error'),
                },
              ),
          }}
          config={{
            modelsPath: config.data?.modelsPath ?? '',
            text: configText,
            dirty,
            saving: saveConfig.isPending,
            error:
              config.error === null || config.error === undefined
                ? null
                : 'models.json 存在但无法解析（服务端拒绝覆盖，先手工修好文件）',
            parseError: parseResult.ok ? null : parseResult.error,
            onChange: setConfigText,
            onSave: () => {
              if (!parseResult.ok) return;
              saveConfig.mutate(parseResult.value, {
                onSuccess: () => onNotice('models.json 已保存'),
                onError: (error) => onNotice(`保存失败：${error.message}`, 'error'),
              });
            },
            onReload: () => void config.refetch(),
          }}
          refresh={{
            busy: refreshModels.isPending,
            lastResult: refreshResult,
            onRefresh: () =>
              refreshModels.mutate(
                { force: true },
                {
                  onSuccess: (result) => {
                    setRefreshResult(
                      result.ok
                        ? result.changed
                          ? '目录已更新'
                          : '目录无变化'
                        : `未刷新：${result.reason ?? '未知原因'}`,
                    );
                  },
                  onError: (error) => setRefreshResult(`刷新失败：${error.message}`),
                },
              ),
          }}
          catalog={{
            query: catalogQuery,
            onQueryChange: setCatalogQuery,
            onSearch: () => catalog.mutate(catalogQuery),
            results: catalog.data?.models ?? [],
            loading: catalog.isPending,
            error: catalog.data?.error ?? null,
          }}
        />
      );
    }
    if (id === 'skills') {
      return (
        <SkillsSection
          cwd={resourceCwd}
          skills={(skills.data?.skills ?? []).map((skill) => ({
            name: skill.name,
            description: skill.description,
            scope: skill.scope,
            disableModelInvocation: skill.disableModelInvocation,
          }))}
          diagnostics={skills.data?.diagnostics ?? []}
          projectResourcesLoaded={skills.data?.projectResourcesLoaded ?? true}
          loading={skills.isLoading}
          busy={patchSkill.isPending}
          onToggle={(skill, disableModelInvocation) =>
            patchSkill.mutate(
              { name: skill.name, disableModelInvocation },
              { onError: (error) => onNotice(`保存失败：${error.message}`, 'error') },
            )
          }
          search={{
            query: skillQuery,
            onQueryChange: setSkillQuery,
            onSearch: () => searchSkills.mutate(skillQuery.trim()),
            results: searchSkills.data?.results ?? [],
            loading: searchSkills.isPending,
            error: searchSkills.data?.error ?? null,
            installingPackage,
            onInstall: (packageName, scope) => {
              setInstallingPackage(packageName);
              installSkill.mutate(
                { package: packageName, scope },
                {
                  onSuccess: () => onNotice(`已安装 ${packageName}`),
                  onError: (error) => onNotice(`安装失败：${error.message}`, 'error'),
                  onSettled: () => setInstallingPackage(null),
                },
              );
            },
          }}
          updates={{
            results: updateSkills.data?.results ?? checkSkills.data?.results ?? [],
            checking: checkSkills.isPending,
            updating: updateSkills.isPending,
            onCheck: () => checkSkills.mutate(undefined),
            onUpdate: (pkg) =>
              updateSkills.mutate(pkg, {
                onSuccess: () => onNotice('更新完成'),
                onError: (error) => onNotice(`更新失败：${error.message}`, 'error'),
              }),
          }}
        />
      );
    }
    if (id === 'plugins') {
      return (
        <PluginsSection
          cwd={resourceCwd}
          packages={(plugins.data?.packages ?? []).map((pkg) => ({
            source: pkg.source,
            displayName: pkg.displayName,
            scope: pkg.scope,
            type: pkg.type,
            enabled: pkg.enabled,
            filtered: pkg.filtered,
          }))}
          standaloneExtensions={plugins.data?.standaloneExtensions ?? []}
          totals={plugins.data?.totals ?? { packages: 0, extensions: 0, skills: 0 }}
          projectResourcesLoaded={plugins.data?.projectResourcesLoaded ?? true}
          loading={plugins.isLoading}
          busy={pluginAction.isPending}
          onAction={(action, source) =>
            pluginAction.mutate(
              { action, source },
              {
                onSuccess: () => onNotice(`${action} 完成`),
                onError: (error) => onNotice(`${action} 失败：${error.message}`, 'error'),
              },
            )
          }
          install={{
            source: installSource,
            onSourceChange: setInstallSource,
            scope: installScope,
            onScopeChange: setInstallScope,
            busy: pluginAction.isPending,
            onInstall: () =>
              pluginAction.mutate(
                { action: 'install', source: installSource.trim(), scope: installScope },
                {
                  onSuccess: () => {
                    onNotice(`已安装 ${installSource.trim()}`);
                    setInstallSource('');
                  },
                  onError: (error) => onNotice(`安装失败：${error.message}`, 'error'),
                },
              ),
          }}
          updates={{
            results: checkPlugins.data?.results ?? [],
            checking: checkPlugins.isPending,
            onCheck: () => checkPlugins.mutate(undefined),
          }}
        />
      );
    }
    return null;
  };

  return (
    <SettingsPanel
      sections={sections}
      activeSection={section}
      onSelectSection={(id) => setSection(id as SectionId)}
      onClose={onClose}
      title="Settings"
      projectHint="Open a project from the sidebar (or open a session)"
      renderSection={renderSection}
    />
  );
}
