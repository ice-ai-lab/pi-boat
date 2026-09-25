import type {
  GitStatusResponse,
  ProjectInfo,
  SessionInfo,
  WorktreesResponse,
} from '@ice-ai/protocol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
