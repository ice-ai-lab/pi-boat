import { parseModelsConfigDraft, sendAgentCommand } from '@ice-ai/client';
import {
  useAuthProvidersQuery,
  useCheckPluginUpdatesMutation,
  useDiscoverModelsMutation,
  useCheckSkillUpdatesMutation,
  useEnabledModelsQuery,
  useInstallSkillMutation,
  useModelCatalogMutation,
  useModelsConfigQuery,
  usePatchSkillMutation,
  usePluginActionMutation,
  usePluginsQuery,
  useProviderUsageMutation,
  useRefreshModelsMutation,
  useRemoveApiKeyMutation,
  useSearchSkillsMutation,
  useSetApiKeyMutation,
  useSkillsQuery,
  useTestModelMutation,
  useUpdateEnabledModelsMutation,
  useUpdateModelsConfigMutation,
  useUpdateSkillsMutation,
} from '@ice-ai/client/react';
import {
  GeneralSection,
  type ModelItemView,
  ModelsSection,
  PluginsSection,
  SettingsPanel,
  type SettingsSectionItem,
  SkillsSection,
  useI18n,
} from '@ice-ai/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLastSettingsSection,
  type SettingsSection as SectionId,
  setLastSettingsSection,
} from '../services/settings-navigation';
import { useChatAppearance } from '../services/use-chat-appearance';

/**
 * SettingsHost（F4）：设置浮层的数据装配——模型（provider 主从视图 / 可见范围 /
 * 目录刷新）、skills、plugins。节导航记忆走 services/settings-navigation
 * （项目信任改由 ProjectTrustDialog 承担）。
 */
export interface SettingsHostProps {
  /** 当前项目根（决定项目级资源与信任范围） */
  projectRoot: string | null;
  /** 当前会话 id（插件「重新加载会话」用；没有会话时该动作禁用） */
  sessionId: string | null;
  onClose(): void;
  onNotice(message: string, tone?: 'info' | 'error'): void;
}

export function SettingsHost({ projectRoot, sessionId, onClose, onNotice }: SettingsHostProps) {
  const { t } = useI18n();
  const [section, setSection] = useState<SectionId>(() => getLastSettingsSection());
  const chatAppearance = useChatAppearance();
  useEffect(() => {
    setLastSettingsSection(section);
  }, [section]);

  /**
   * 项目域节（skills / plugins）与项目域判定：对齐 参考实现 SettingsPanel —— 没有真实项目 cwd 时
   * 这两节禁用（K5），停在它们上时回退到「常规」（K4）。此前退到家目录，会出现 参考实现 没有的空态。
   */
  useEffect(() => {
    if (projectRoot !== null) return;
    if (section !== 'skills' && section !== 'plugins') return;
    setSection('general');
  }, [projectRoot, section]);

  /** 项目级资源的 cwd：没有项目就没有项目域资源（与禁用口径同一判据，K5） */
  const resourceCwd = projectRoot;

  // —— 模型：provider 清单 / 可见范围 / models.json 草稿 / 目录 ——
  const enabled = useEnabledModelsQuery(projectRoot ?? undefined);
  const updateEnabled = useUpdateEnabledModelsMutation(projectRoot ?? undefined);
  const config = useModelsConfigQuery();
  const saveConfig = useUpdateModelsConfigMutation();
  const refreshModels = useRefreshModelsMutation();
  const catalog = useModelCatalogMutation();
  const discover = useDiscoverModelsMutation();
  const testModel = useTestModelMutation();
  const authProviders = useAuthProvidersQuery(projectRoot ?? undefined);
  const setApiKey = useSetApiKeyMutation();
  const removeApiKey = useRemoveApiKeyMutation();
  const queryUsage = useProviderUsageMutation();

  const [configText, setConfigText] = useState('');
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  // models.json 载入 → 编辑草稿（重新载入时覆盖）
  useEffect(() => {
    if (config.data !== undefined) setConfigText(JSON.stringify(config.data.config, null, 2));
  }, [config.data]);

  const parseResult = useMemo(() => parseModelsConfigDraft(configText), [configText]);
  const dirty =
    config.data !== undefined &&
    parseResult.ok &&
    JSON.stringify(parseResult.value) !== JSON.stringify(config.data.config);

  const modelItems = useMemo(() => {
    // 服务端 id 是**裸 id**（provider 在旁字段）——必须按 provider:id 组合，否则
    // 勾选态永远错位（会误导用户反向操作）。
    // 列表以 **catalog（完整目录）** 为底、enabled（可见集）只用来点亮开关：
    // 只用可见集的话，关掉一条模型它就从面板消失了，用户再也没法打开（ADR-0011 后果）。
    const key = (model: { provider: string; id: string }) => `${model.provider}:${model.id}`;
    const enabledIds = new Set((enabled.data?.models ?? []).map(key));
    const items = new Map<string, ModelItemView>();
    for (const model of enabled.data?.catalog ?? []) {
      items.set(key(model), {
        id: key(model),
        name: model.name,
        provider: model.provider,
        enabled: enabledIds.has(key(model)),
      });
    }
    // 可见但不在目录里的模型（理论上不该发生，但少了它开关态就丢）
    for (const model of enabled.data?.models ?? []) {
      if (items.has(key(model))) continue;
      items.set(key(model), {
        id: key(model),
        name: model.name,
        provider: model.provider,
        enabled: true,
      });
    }
    return [...items.values()];
  }, [enabled.data]);

  const enabledCount = modelItems.filter((model) => model.enabled).length;

  // —— skills / plugins ——
  const skills = useSkillsQuery(resourceCwd);
  const patchSkill = usePatchSkillMutation(resourceCwd);
  const searchSkills = useSearchSkillsMutation();
  const installSkill = useInstallSkillMutation(resourceCwd);
  const checkSkills = useCheckSkillUpdatesMutation(resourceCwd);
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
      const [providerId = '', ...rest] = modelId.split(':');
      updateEnabled.mutate(
        {
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
    { id: 'general', label: t('settings.general') },
    { id: 'models', label: t('common.models') },
    { id: 'skills', label: t('common.skills'), disabled: projectRoot === null },
    { id: 'plugins', label: t('common.plugins'), disabled: projectRoot === null },
  ];

  const renderSection = (id: string) => {
    if (id === 'general') {
      return (
        <GeneralSection
          chat={{
            width: chatAppearance.width,
            fontSize: chatAppearance.fontSize,
            onWidthChange: chatAppearance.setWidth,
            onFontSizeChange: chatAppearance.setFontSize,
          }}
        />
      );
    }
    if (id === 'models') {
      return (
        <ModelsSection
          cwd={projectRoot}
          authProviders={authProviders.data?.providers ?? []}
          authProvidersLoading={authProviders.isLoading}
          enabled={{
            models: modelItems,
            canWrite: enabled.data?.canWrite ?? false,
            busy: updateEnabled.isPending,
            hint:
              modelItems.length === 0
                ? '没有可见模型：模型选择器会退化为「全部可用」'
                : enabledCount === 1
                  ? '只剩 1 个可见模型：关闭它会退回「全部可用」语义，故被禁止'
                  : null,
            warnings: enabled.data?.warnings ?? [],
            onToggle: toggleEnabled,
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
                onSuccess: () => {
                  onNotice('models.json 已保存');
                  void authProviders.refetch();
                },
                onError: (error) => onNotice(`保存失败：${error.message}`, 'error'),
              });
            },
          }}
          apiKey={{
            saving: setApiKey.isPending || removeApiKey.isPending,
            onSave: (providerId, apiKey) => {
              setApiKey.mutate(
                { provider: providerId, apiKey },
                {
                  onSuccess: () => onNotice('API Key 已保存'),
                  onError: (error) => onNotice(`保存失败：${error.message}`, 'error'),
                },
              );
            },
            onRemove: (providerId) => {
              removeApiKey.mutate(providerId, {
                onSuccess: (result) => {
                  if (result.status === 'type_mismatch') {
                    onNotice(
                      `该 provider 使用 ${result.storedType} 凭据，请在 pi CLI 中管理`,
                      'error',
                    );
                  } else {
                    onNotice('已断开连接');
                  }
                },
                onError: (error) => onNotice(`断开失败：${error.message}`, 'error'),
              });
            },
          }}
          onQueryUsage={(providerId) => queryUsage.mutateAsync(providerId)}
          onSearchCatalog={(q) => catalog.mutateAsync(q)}
          onDiscover={(providerName, provider) => discover.mutateAsync({ providerName, provider })}
          onTestModel={(providerName, provider, modelId) =>
            testModel.mutateAsync({ providerName, provider, model: { id: modelId } })
          }
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
            filePath: skill.filePath,
            source: skill.source,
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
          packages={plugins.data?.packages ?? []}
          standaloneExtensions={plugins.data?.standaloneExtensions ?? []}
          totals={
            plugins.data?.totals ?? {
              packages: 0,
              extensions: 0,
              skills: 0,
              prompts: 0,
              themes: 0,
            }
          }
          projectResourcesLoaded={plugins.data?.projectResourcesLoaded ?? true}
          loading={plugins.isLoading}
          busy={pluginAction.isPending}
          sessionId={sessionId}
          onAction={(action, source) =>
            pluginAction.mutate(
              { action, source },
              {
                onSuccess: () => {
                  onNotice(`${action} 完成`);
                  // 更新成功后重跑检查：checkPlugins 是 mutation，结果不会自己失效，
                  // 否则侧栏 ↑ 不消、按钮停在「更新」，这份结论就一直是旧的
                  if (action === 'update') checkPlugins.mutate(undefined);
                },
                onError: (error) => onNotice(`${action} 失败：${error.message}`, 'error'),
              },
            )
          }
          onReloadSession={() => {
            if (sessionId === null) return;
            sendAgentCommand(sessionId, { type: 'reload' })
              .then(() => onNotice('会话已重新加载'))
              .catch((error: unknown) =>
                onNotice(
                  `重新加载失败：${error instanceof Error ? error.message : String(error)}`,
                  'error',
                ),
              );
          }}
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
      title={t('settings.title')}
      projectHint={t('settings.projectRequired')}
      renderSection={renderSection}
    />
  );
}
