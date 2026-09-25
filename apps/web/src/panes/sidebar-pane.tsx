import { filterSessions, getRecentProjects, workspaceKeyOf } from '@ice-ai/client';
import {
  useCreateWorktreeMutation,
  useDeleteSessionMutation,
  useRemoveWorktreeMutation,
  useRenameSessionMutation,
  useSessionSearchQuery,
  useSessionsQuery,
  useWorktreesQuery,
} from '@ice-ai/client/react';
import type { ToastItem } from '@ice-ai/ui';
import { SessionSearch, Sidebar, ToastHost, toastQueueReducer } from '@ice-ai/ui';
import { useCallback, useMemo, useReducer, useState } from 'react';
import { getLastCwd } from '../services/workspace-memory';

/**
 * SidebarPane（F2）：侧栏数据装配——会话列表（轮询）/ 项目分组 / 搜索 /
 * worktree 切换 / 重命名删除。选择会话写 URL（?s=），由 ChatPane 负责打开。
 */
export interface SidebarPaneProps {
  activeSessionId: string | null;
  onSelectSession(sessionId: string): void;
  /** 新建会话：带上项目/工作区 cwd（null = 用上次记忆的 cwd） */
  onNewSession(cwd: string | null): void;
}

export function SidebarPane({ activeSessionId, onSelectSession, onNewSession }: SidebarPaneProps) {
  const sessionsQuery = useSessionsQuery();
  const [searchQuery, setSearchQuery] = useState('');
  const searchResult = useSessionSearchQuery(searchQuery);
  const renameMutation = useRenameSessionMutation();
  const deleteMutation = useDeleteSessionMutation();
  const createWorktreeMutation = useCreateWorktreeMutation();
  const removeWorktreeMutation = useRemoveWorktreeMutation();
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);

  const allSessions = sessionsQuery.data?.sessions ?? [];
  const runningSessionIds = useMemo(
    () => new Set(sessionsQuery.data?.runningSessionIds ?? []),
    [sessionsQuery.data],
  );
  const projects = useMemo(() => getRecentProjects(allSessions), [allSessions]);

  // 当前项目：活动会话所属项目 → 有会话的第一个项目
  const activeProjectKey = useMemo(() => {
    const active = allSessions.find((session) => session.id === activeSessionId);
    if (active !== undefined) return workspaceKeyOf(active);
    return projects[0]?.key ?? null;
  }, [allSessions, activeSessionId, projects]);

  const effectiveProjectKey = activeProjectKey;
  const projectSessions = useMemo(() => {
    if (searchQuery.trim().length > 0) {
      return searchResult.data?.sessions ?? filterSessions(allSessions, searchQuery);
    }
    if (effectiveProjectKey === null) return allSessions;
    return allSessions.filter((session) => workspaceKeyOf(session) === effectiveProjectKey);
  }, [allSessions, effectiveProjectKey, searchQuery, searchResult.data]);

  const activeProject = projects.find((project) => project.key === effectiveProjectKey);
  // worktree 列表按当前项目代表 cwd 拉取（服务端按仓库归并）
  const worktreesQuery = useWorktreesQuery(activeProject?.cwd ?? null);

  const handleRename = useCallback(
    (sessionId: string, name: string) => {
      renameMutation.mutate(
        { sessionId, name },
        { onError: (error) => pushToast(`重命名失败：${error.message}`, 'error') },
      );
    },
    [renameMutation, pushToast],
  );

  const handleDelete = useCallback(
    (sessionId: string) => {
      deleteMutation.mutate(sessionId, {
        onSuccess: () => pushToast('会话已删除'),
        onError: (error) => pushToast(`删除失败：${error.message}`, 'error'),
      });
    },
    [deleteMutation, pushToast],
  );

  return (
    <>
      <Sidebar
        sessions={projectSessions}
        projects={projects}
        activeProjectKey={effectiveProjectKey}
        runningSessionIds={runningSessionIds}
        activeSessionId={activeSessionId}
        worktrees={worktreesQuery.data?.worktrees ?? []}
        currentWorktreePath={worktreesQuery.data?.currentWorktreePath ?? null}
        worktreeBusy={createWorktreeMutation.isPending || removeWorktreeMutation.isPending}
        searching={searchQuery.trim().length > 0}
        onSelectProject={(projectKey) => {
          const project = projects.find((candidate) => candidate.key === projectKey);
          if (project !== undefined) onNewSession(project.cwd);
        }}
        onSelectWorktree={(path) => onNewSession(path)}
        onCreateWorktree={(branch) => {
          if (activeProject === undefined) return;
          createWorktreeMutation.mutate(
            { cwd: activeProject.cwd, branch },
            {
              onSuccess: (created) => {
                pushToast(`worktree 已创建：${created.branch}`);
                onNewSession(created.path);
              },
              onError: (error) => pushToast(`创建 worktree 失败：${error.message}`, 'error'),
            },
          );
        }}
        onRemoveWorktree={(path) => {
          if (activeProject === undefined) return;
          removeWorktreeMutation.mutate(
            { cwd: activeProject.cwd, path },
            {
              onSuccess: () => pushToast('worktree 已删除'),
              onError: (error) =>
                pushToast(
                  error.message.includes('409') || error.message.includes('dirty')
                    ? '该 worktree 有未提交改动，已拒绝删除'
                    : `删除 worktree 失败：${error.message}`,
                  'error',
                ),
            },
          );
        }}
        onSelectSession={onSelectSession}
        onRenameSession={handleRename}
        onDeleteSession={handleDelete}
        onNewSession={() => onNewSession(activeProject?.cwd ?? getLastCwd() ?? null)}
        searchSlot={<SessionSearch onQueryChange={setSearchQuery} />}
      />
      <ToastHost items={toasts} />
    </>
  );
}
