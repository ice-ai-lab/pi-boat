import type {
  GitStatusResponse,
  ModelsConfigTestRequest,
  ModelsEnabledUpdate,
  ModelsRefreshRequest,
  PluginActionRequest,
  ProjectInfo,
  ProviderDraft,
  SessionInfo,
  SkillPatchRequest,
  WorktreesResponse,
} from '@ice-ai/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  discoverModels,
  getEnabledModels,
  getModelCatalog,
  getModels,
  getModelsConfig,
  putModelsConfig,
  refreshModels,
  testModel,
  updateEnabledModels,
} from '../endpoints/models';
import {
  checkPluginUpdates,
  checkSkillUpdates,
  getPlugins,
  getProjectTrust,
  getSkills,
  getToolsSettings,
  installSkill,
  patchSkill,
  pluginAction,
  putProjectTrust,
  putToolsSettings,
  searchSkills,
  updateSkills,
} from '../endpoints/resources';
import { getSessionDetail } from '../endpoints/sessions';
import { browseCwd, getHome } from '../endpoints/system';
import {
  createWorktree,
  deleteSession,
  getGitStatus,
  listProjects,
  listSessions,
  listWorktrees,
  removeWorktree,
  renameSession,
  searchSessions,
} from '../endpoints/workspace';

/**
 * REST 查询层（ADR-0009：TanStack Query 只管 REST，事件流走 AgentStream）。
 * queryKeys 工厂：失效粒度与域一一对应（改一处不要连带失效全部）。
 */
export const queryKeys = {
  sessions: (projectKey?: string) => ['sessions', { projectKey: projectKey ?? null }] as const,
  sessionSearch: (q: string) => ['sessions', 'search', q] as const,
  projects: () => ['projects'] as const,
  gitStatus: (cwd: string) => ['gitStatus', cwd] as const,
  worktrees: (cwd: string) => ['worktrees', cwd] as const,
};

/** 列表轮询：注册表/磁盘变动没有推送，用低频轮询兜底（5s 与 idle 回收周期同量级） */
const LIST_REFETCH_MS = 5_000;

export function useSessionsQuery(projectKey?: string) {
  return useQuery({
    queryKey: queryKeys.sessions(projectKey),
    queryFn: () => listSessions(projectKey === undefined ? {} : { projectKey }),
    refetchInterval: LIST_REFETCH_MS,
    // 切项目/重挂载时保留上一份列表，避免侧栏闪空
    placeholderData: (previous) => previous,
  });
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => listProjects(),
    refetchInterval: LIST_REFETCH_MS * 4,
    placeholderData: (previous) => previous,
  });
}

export function useSessionSearchQuery(q: string) {
  return useQuery({
    queryKey: queryKeys.sessionSearch(q),
    queryFn: () => searchSessions(q),
    enabled: q.trim().length > 0,
  });
}

export function useGitStatusQuery(cwd: string | null) {
  return useQuery({
    queryKey: queryKeys.gitStatus(cwd ?? ''),
    queryFn: () => getGitStatus(cwd as string),
    enabled: cwd !== null,
    refetchInterval: LIST_REFETCH_MS * 2,
  });
}

export function useWorktreesQuery(cwd: string | null) {
  return useQuery({
    queryKey: queryKeys.worktrees(cwd ?? ''),
    queryFn: () => listWorktrees(cwd as string),
    enabled: cwd !== null,
  });
}

/** 改名：成功后就地更新列表缓存（避免整表重取） */
export function useRenameSessionMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, name }: { sessionId: string; name: string }) =>
      renameSession(sessionId, name),
    onSuccess: (_data, variables) => {
      client.setQueriesData<{ sessions: SessionInfo[] }>({ queryKey: ['sessions'] }, (previous) => {
        if (previous === undefined || !('sessions' in previous)) return previous;
        return {
          ...previous,
          sessions: previous.sessions.map((session) =>
            session.id === variables.sessionId ? { ...session, name: variables.name } : session,
          ),
        };
      });
      void client.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useDeleteSessionMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteSession(sessionId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sessions'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useCreateWorktreeMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ cwd, branch }: { cwd: string; branch: string }) => createWorktree(cwd, branch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['worktrees'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useRemoveWorktreeMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ cwd, path, force }: { cwd: string; path: string; force?: boolean }) =>
      removeWorktree(cwd, path, force),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['worktrees'] });
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export type { GitStatusResponse, ProjectInfo, WorktreesResponse };

// ---------------------------------------------------------------------------
// 设置域（F4）：模型 / skills / plugins / 工具设置 / 信任 / 目录选择
// ---------------------------------------------------------------------------

export const settingsKeys = {
  models: (cwd?: string) => ['models', { cwd: cwd ?? null }] as const,
  modelsConfig: () => ['modelsConfig'] as const,
  enabledModels: (cwd?: string) => ['modelsEnabled', { cwd: cwd ?? null }] as const,
  catalog: (q: string) => ['modelCatalog', q] as const,
  skills: (cwd: string) => ['skills', cwd] as const,
  plugins: (cwd: string) => ['plugins', cwd] as const,
  toolsSettings: () => ['toolsSettings'] as const,
  projectTrust: (cwd: string) => ['projectTrust', cwd] as const,
  cwdBrowse: (path?: string) => ['cwdBrowse', path ?? '~'] as const,
  home: () => ['home'] as const,
};

/** GET /api/models（离线）；cwd 决定项目级资源解析 */
export function useModelsQuery(cwd?: string) {
  return useQuery({
    queryKey: settingsKeys.models(cwd),
    queryFn: () => getModels(cwd),
    staleTime: 30_000,
  });
}

export function useModelsConfigQuery() {
  return useQuery({
    queryKey: settingsKeys.modelsConfig(),
    queryFn: () => getModelsConfig(),
  });
}

export function useUpdateModelsConfigMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) => putModelsConfig(config),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: settingsKeys.modelsConfig() });
      void client.invalidateQueries({ queryKey: ['models'] });
      void client.invalidateQueries({ queryKey: ['modelsEnabled'] });
    },
  });
}

export function useEnabledModelsQuery(cwd?: string) {
  return useQuery({
    queryKey: settingsKeys.enabledModels(cwd),
    queryFn: () => getEnabledModels(cwd),
  });
}

/**
 * 可见范围编辑：toggle（最小编辑）/ prune / resync。
 * 409 的两种 reason（last-model / project-shadow）由调用方按 ApiError 处理。
 */
export function useUpdateEnabledModelsMutation(cwd?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (update: ModelsEnabledUpdate) =>
      updateEnabledModels(cwd === undefined ? update : { ...update, cwd }),
    onSuccess: (data) => {
      client.setQueryData(settingsKeys.enabledModels(cwd), data);
      void client.invalidateQueries({ queryKey: ['models'] });
    },
  });
}

export function useModelCatalogMutation() {
  return useMutation({ mutationFn: (q: string) => getModelCatalog(q) });
}

export function useDiscoverModelsMutation() {
  return useMutation({
    mutationFn: ({ providerName, provider }: { providerName: string; provider: ProviderDraft }) =>
      discoverModels(providerName, provider),
  });
}

export function useTestModelMutation() {
  return useMutation({ mutationFn: (input: ModelsConfigTestRequest) => testModel(input) });
}

export function useRefreshModelsMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: ModelsRefreshRequest) => refreshModels(request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['models'] });
      void client.invalidateQueries({ queryKey: ['modelsEnabled'] });
    },
  });
}

export function useSkillsQuery(cwd: string | null) {
  return useQuery({
    queryKey: settingsKeys.skills(cwd ?? ''),
    queryFn: () => getSkills(cwd as string),
    enabled: cwd !== null,
  });
}

export function usePatchSkillMutation(cwd: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: SkillPatchRequest) => patchSkill(request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: settingsKeys.skills(cwd ?? '') });
    },
  });
}

export function useSearchSkillsMutation() {
  return useMutation({ mutationFn: (query: string) => searchSkills(query) });
}

export function useInstallSkillMutation(cwd: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: { package: string; scope: 'global' | 'project' }) =>
      installSkill(cwd === null ? request : { ...request, cwd }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: settingsKeys.skills(cwd ?? '') });
    },
  });
}

export function useCheckSkillUpdatesMutation() {
  return useMutation({ mutationFn: () => checkSkillUpdates() });
}

export function useUpdateSkillsMutation(cwd: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (pkg?: string) => updateSkills(pkg),
    onSuccess: () => void client.invalidateQueries({ queryKey: settingsKeys.skills(cwd ?? '') }),
  });
}

export function usePluginsQuery(cwd: string | null) {
  return useQuery({
    queryKey: settingsKeys.plugins(cwd ?? ''),
    queryFn: () => getPlugins(cwd as string),
    enabled: cwd !== null,
  });
}

export function usePluginActionMutation(cwd: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: Omit<PluginActionRequest, 'cwd'>) =>
      pluginAction({ ...request, cwd: cwd ?? '' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: settingsKeys.plugins(cwd ?? '') }),
  });
}

export function useCheckPluginUpdatesMutation(cwd: string | null) {
  return useMutation({ mutationFn: () => checkPluginUpdates(cwd ?? '') });
}

export function useToolsSettingsQuery() {
  return useQuery({ queryKey: settingsKeys.toolsSettings(), queryFn: () => getToolsSettings() });
}

export function useUpdateToolsSettingsMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (powerShellEnabled: boolean) => putToolsSettings(powerShellEnabled),
    onSuccess: (data) => client.setQueryData(settingsKeys.toolsSettings(), data),
  });
}

export function useProjectTrustQuery(cwd: string | null) {
  return useQuery({
    queryKey: settingsKeys.projectTrust(cwd ?? ''),
    queryFn: () => getProjectTrust(cwd as string),
    enabled: cwd !== null,
  });
}

export function useUpdateProjectTrustMutation(cwd: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (trusted: boolean) => putProjectTrust(cwd as string, trusted),
    onSuccess: (data) => {
      client.setQueryData(settingsKeys.projectTrust(cwd ?? ''), data);
      void client.invalidateQueries({ queryKey: settingsKeys.skills(cwd ?? '') });
      void client.invalidateQueries({ queryKey: settingsKeys.plugins(cwd ?? '') });
    },
  });
}

export function useCwdBrowseQuery(path?: string) {
  return useQuery({
    queryKey: settingsKeys.cwdBrowse(path),
    queryFn: () => browseCwd(path),
    staleTime: 5_000,
  });
}

export function useHomeQuery() {
  return useQuery({ queryKey: settingsKeys.home(), queryFn: () => getHome(), staleTime: Infinity });
}

/** GET /api/sessions/:id —— 详情（含 tree/leafId/stats/info；分支导航与会话信息面板用） */
export function useSessionDetailQuery(sessionId: string | null) {
  return useQuery({
    queryKey: ['sessionDetail', sessionId ?? ''],
    queryFn: () => getSessionDetail(sessionId as string),
    enabled: sessionId !== null,
    retry: false,
  });
}
