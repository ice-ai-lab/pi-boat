import type { SessionContextQuery, SessionListQuery } from '@ice-ai/protocol';
import { useQuery } from '@tanstack/react-query';
import { getRunningState } from '../endpoints/agent';
import { listProjects } from '../endpoints/projects';
import { getSessionContext, getSessionDetail, listSessions } from '../endpoints/sessions';
import { getApiClient } from './client';

/**
 * REST 的 TanStack Query 封装（docs/05 §7）：**只用于 REST 读**，事件流不走 Query
 * （ADR-0009 理由 1）。`staleTime` / `retry` 由 app 侧 QueryClient 统一配。
 *
 * `queryKeys` 是失效粒度工厂：`listFingerprint`（ADR-0008）作为列表失效键——
 * 指纹变了说明磁盘侧内容变了，此时才需要重建列表。
 */

export const queryKeys = {
  sessions: {
    all: ['sessions'] as const,
    list: (query: SessionListQuery = {}) => ['sessions', 'list', query] as const,
    detail: (id: string) => ['sessions', 'detail', id] as const,
    context: (id: string, query: SessionContextQuery = {}) =>
      ['sessions', 'context', id, query] as const,
  },
  projects: {
    all: ['projects'] as const,
    list: () => ['projects', 'list'] as const,
  },
  agent: {
    state: (id: string) => ['agent', 'state', id] as const,
  },
} as const;

export function useSessionsQuery(query: SessionListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.sessions.list(query),
    queryFn: () => listSessions(getApiClient(), query),
  });
}

export function useSessionDetailQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(id),
    queryFn: () => getSessionDetail(getApiClient(), id),
  });
}

/** 历史上下文（`rebuild.ts` 的事实来源；`turnsFromMessages` 蒸出同形状 Turn[]） */
export function useSessionContextQuery(
  id: string,
  query: SessionContextQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.sessions.context(id, query),
    queryFn: () => getSessionContext(getApiClient(), id, query),
    enabled: options.enabled ?? true,
  });
}

export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: () => listProjects(getApiClient()),
  });
}

/** GET /api/agent/:id 轻查（不进命令 FIFO；系统提示词面板懒加载也用这条） */
export function useAgentRunningStateQuery(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.agent.state(id),
    queryFn: () => getRunningState(getApiClient(), id),
    enabled: options.enabled ?? true,
    refetchInterval: options.enabled === false ? false : 5000,
  });
}
