import type {
  ModelsConfigTestRequest,
  ModelsEnabledUpdate,
  ModelsRefreshRequest,
  PluginActionRequest,
  ProviderDraft,
  SessionDetailResponse,
  SessionInfo,
  SkillPatchRequest,
} from '@ice-ai/protocol';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { validateCwd } from '../endpoints/files';
import {
  deleteProviderApiKey,
  discoverModels,
  getAuthProviders,
  getEnabledModels,
  getModelCatalog,
  getModels,
  getModelsConfig,
  putModelsConfig,
  putProviderApiKey,
  queryProviderUsage,
  refreshModels,
  testModel,
  updateEnabledModels,
} from '../endpoints/models';
import {
  checkPluginUpdates,
  getPlugins,
  getProjectTrust,
  getSkills,
  installSkill,
  patchSkill,
  pluginAction,
  putProjectTrust,
  searchSkills,
} from '../endpoints/resources';
import { getSessionDetail } from '../endpoints/sessions';
import {
  deleteSession,
  getGitStatus,
  listProjects,
  listSessions,
  renameSession,
} from '../endpoints/workspace';

/**
 * REST 查询层（ADR-0009：TanStack Query 只管 REST，事件流走 AgentStream）。
 * queryKeys 工厂：失效粒度与域一一对应（改一处不要连带失效全部）。
 */
export const queryKeys = {
  sessions: (projectKey?: string) => ['sessions', { projectKey: projectKey ?? null }] as const,
  /** 会话详情：`useAgentSession.open()` 与 `useSessionDetailQuery` **共用同一个 key**，
   *  一次切换只拉一份（见 useSessionDetailQuery 注释） */
  sessionDetail: (sessionId: string) => ['sessionDetail', sessionId] as const,
  projects: () => ['projects'] as const,
  /** cwd → 项目身份（POST /api/cwd/validate 的结果，兼作 allowed-roots 授权） */
  cwdProject: (cwd: string) => ['cwdProject', cwd] as const,
  gitStatus: (cwd: string) => ['gitStatus', cwd] as const,
};

/** 列表轮询：注册表/磁盘变动没有推送，用低频轮询兜底（5s 与 idle 回收周期同量级） */
const LIST_REFETCH_MS = 5_000;

export function useSessionsQuery(projectKey: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions(projectKey ?? undefined),
    queryFn: () => listSessions(projectKey === null ? {} : { projectKey }),
    // 项目未定时不取数：全量列表是「按项目取数」要避免的那份 payload
    // （侧栏首屏的项目由 /api/projects 与 cwd/validate 决定，不靠会话列表反推）
    enabled: projectKey !== null,
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

/**
 * cwd → 项目身份（projectRoot/projectKey）。为什么侧栏需要它：会话列表按 `?projectKey=`
 * 取数后，`selectedCwd` 无法再从会话列表反查项目（新目录/子目录/未访问过的项目都不在手里的列表里）。
 *
 * 用 `POST /api/cwd/validate` 而不是列表反查：它是 `projectKey` 的权威来源，与 `?projectKey=`
 * 过滤**按构造同源**（server 两处共用同一个 ProjectResolver）。副作用是 allowed-roots 登记，
 * 幂等；`staleTime: Infinity` 因为「路径 → git 根」在进程内不会变。
 */
export function useCwdProjectQuery(cwd: string | null) {
  return useQuery({
    queryKey: queryKeys.cwdProject(cwd ?? ''),
    queryFn: () => validateCwd(cwd as string),
    enabled: cwd !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
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

// ---------------------------------------------------------------------------
// 设置域（F4）：模型 / skills / plugins / 项目信任
// ---------------------------------------------------------------------------

const settingsKeys = {
  models: (cwd?: string) => ['models', { cwd: cwd ?? null }] as const,
  modelsConfig: () => ['modelsConfig'] as const,
  authProviders: (cwd?: string) => ['modelsAuthProviders', { cwd: cwd ?? null }] as const,
  enabledModels: (cwd?: string) => ['modelsEnabled', { cwd: cwd ?? null }] as const,
  catalog: (q: string) => ['modelCatalog', q] as const,
  skills: (cwd: string) => ['skills', cwd] as const,
  plugins: (cwd: string) => ['plugins', cwd] as const,
  projectTrust: (cwd: string) => ['projectTrust', cwd] as const,
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

/** GET /api/models/auth-providers（本地读；cwd 只影响项目级目录解析） */
export function useAuthProvidersQuery(cwd?: string) {
  return useQuery({
    queryKey: settingsKeys.authProviders(cwd),
    queryFn: () => getAuthProviders(cwd),
    staleTime: 10_000,
  });
}

/** 保存 / 断开 API Key 后失效 auth-providers 与模型快照（配置状态可能翻转） */
function useInvalidateAuthProviders() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['modelsAuthProviders'] });
    void client.invalidateQueries({ queryKey: ['models'] });
  };
}

export function useSetApiKeyMutation() {
  const refreshAuthProviders = useInvalidateAuthProviders();
  return useMutation({
    mutationFn: (request: { provider: string; apiKey: string }) => putProviderApiKey(request),
    onSuccess: refreshAuthProviders,
  });
}

export function useRemoveApiKeyMutation() {
  const refreshAuthProviders = useInvalidateAuthProviders();
  return useMutation({
    mutationFn: (provider: string) => deleteProviderApiKey(provider),
    onSuccess: refreshAuthProviders,
  });
}

/** 用量查询是一次性动作不是缓存态：mutation，快照由调用方持有 */
export function useProviderUsageMutation() {
  return useMutation({ mutationFn: (providerId: string) => queryProviderUsage(providerId) });
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
 * 可见范围编辑：toggle（最小编辑）。
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

/**
 * 详情缓存的**新鲜窗口**。存在的唯一原因是「同一份详情的两个消费方」：
 * `useAgentSession.open()` 重建历史要用它，`useSessionDetailQuery` 渲染分支树/统计也
 * 要用它。两边共用同一个 query（见 `fetchSessionDetail`）后，后到的那一方会读到刚落地
 * 的数据而不再重发一次请求。
 *
 * 窗口取 5 s：只需覆盖「open() 完成 → 组件挂载」这几百毫秒；轮次结束后 chat-pane
 * 会显式 `refetch()`，改名/分支导航等写路径自带重取，不依赖窗口长短。
 */
const SESSION_DETAIL_STALE_MS = 5_000;

/** 会话详情的 query 定义（key + fetcher）——`useSessionDetailQuery` 与 `fetchSessionDetail` 的唯一来源 */
function sessionDetailQuery(sessionId: string | null) {
  return {
    queryKey: queryKeys.sessionDetail(sessionId ?? ''),
    // deferMedia=1：历史图片只发坐标（ADR-0024），渲染时再按 entryId+块下标取字节。
    // 初始页（详情里的 context）往往是图片最大的那一页。
    // force=1：同一会话文件被别的进程写过时（pi CLI 等外部进程），服务端从磁盘重建 runtime 并回
    // `wrapperRebuilt`——不探测的话本进程内存里的条目/统计会停在 resume 一刻（ADR-0013、2026-09-28 实测）。
    queryFn: () => getSessionDetail(sessionId as string, { deferMedia: true, force: true }),
  };
}

/**
 * 命令式取会话详情——**与 `useSessionDetailQuery` 共用同一个 query**，
 * `useAgentSession.open()` 走这里而不是裸调 `getSessionDetail`。
 *
 * 为什么要统一：同一次会话切换里两边都要这份数据（open() 重建历史与事件流水位线，
 * chat-pane 渲染分支树/统计/条目数）。各调各的就是两份 payload + 两次服务端全量解析：
 * 2026-09-26 实测切到 2.2 MB 的会话时，一次切换发了 **2–3 份 2.43 MB** 的详情
 * （开发期 StrictMode 还会把导航 effect 再跑一遍）。共用 query 后：
 * - open() 先到 → 写缓存，`useSessionDetailQuery` 挂载时直接读（1 次请求）
 * - 同时到 → react-query 合并 in-flight（`Query.fetch` 返回同一个 retryer promise）
 * - hook 先到（组件重挂载）→ open() 仍按 `staleTime: 0` 重新取，语义不变
 *
 * `staleTime: 0`——open() 拿到的必须是磁盘最新的一份：它要用来重建历史并取 `lastSeq`
 * 水位线，旧快照会让这段空白里的消息被当成重复事件丢掉。
 * `retry: false`（fetchQuery 默认）与原来的裸调用一致：404 在这里是**语义**
 * （会话还没落盘），要立刻交给调用方的兜底分支。
 */
export function fetchSessionDetail(
  queryClient: QueryClient,
  sessionId: string,
): Promise<SessionDetailResponse> {
  return queryClient.fetchQuery({ ...sessionDetailQuery(sessionId), staleTime: 0 });
}

/** GET /api/sessions/:id —— 详情（含 tree/leafId/stats/info；分支导航与会话信息面板用） */
export function useSessionDetailQuery(sessionId: string | null) {
  return useQuery({
    ...sessionDetailQuery(sessionId),
    enabled: sessionId !== null,
    retry: false,
    staleTime: SESSION_DETAIL_STALE_MS,
  });
}
