import { filterSessions, getRecentProjects, validateCwd, workspaceKeyOf } from '@ice-ai/client';
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
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getLastCwd } from '../services/workspace-memory';
import { FileExplorerPane } from './file-explorer-pane';

/**
 * SidebarPane（F2）：侧栏数据装配——会话列表（轮询）/ 项目分组 / 搜索 /
 * worktree 切换 / 重命名删除。选择会话写 URL（?s=），由 ChatPane 负责打开。
 */
export interface SidebarPaneProps {
  activeSessionId: string | null;
  onSelectSession(sessionId: string): void;
  /** 新建会话：带上项目/工作区 cwd（null = 用上次记忆的 cwd） */
  onNewSession(cwd: string | null): void;
  /** 当前项目根变化（文件树与查看器需要同一基准） */
  onProjectRootChange(root: string | null): void;
}

/** 侧栏两个页签：会话 / 文件（docs/06 §4.3） */
type SidebarTab = 'sessions' | 'files';

export function SidebarPane({
  activeSessionId,
  onSelectSession,
  onNewSession,
  onProjectRootChange,
}: SidebarPaneProps) {
  const sessionsQuery = useSessionsQuery();
  const [searchQuery, setSearchQuery] = useState('');
  const searchResult = useSessionSearchQuery(searchQuery);
  const renameMutation = useRenameSessionMutation();
  const deleteMutation = useDeleteSessionMutation();
  const createWorktreeMutation = useCreateWorktreeMutation();
  const removeWorktreeMutation = useRemoveWorktreeMutation();
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const [tab, setTab] = useState<SidebarTab>('sessions');
  /** 用户显式选中的项目（无活动会话时用它；有活动会话则以会话所属项目为准） */
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  /** 服务端解析出的项目真实根（符号链接场景与 projectRoot 不同） */
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);

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
    if (selectedProjectKey !== null && projects.some((p) => p.key === selectedProjectKey)) {
      return selectedProjectKey;
    }
    return projects[0]?.key ?? null;
  }, [allSessions, activeSessionId, projects, selectedProjectKey]);

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

  // 项目根回传：文件树/查看器与侧栏共用同一基准（cwd 可能是子目录，root 才是仓库根）。
  // 回调放 ref，效果只依赖项目根 —— 避免父层传内联 lambda 时的重复上报与依赖争议。
  const projectRoot = activeProject?.root ?? null;
  const rootChangeRef = useRef(onProjectRootChange);
  rootChangeRef.current = onProjectRootChange;
  useEffect(() => {
    setResolvedRoot(null);
    rootChangeRef.current(projectRoot);
    // 首屏默认项目的根也要可读（否则文件页签一片 403）
    if (projectRoot !== null) void validateCwd(projectRoot).catch(() => null);
  }, [projectRoot]);

  // 真实根就绪后改报它（右栏与左侧文件树共用同一基准）
  useEffect(() => {
    if (resolvedRoot !== null) rootChangeRef.current(resolvedRoot);
  }, [resolvedRoot]);

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
      <div
        style={{
          // L17：品牌行自带 12px 上边距，Sidebar 头部不再叠加顶部内边距
          padding: '12px 10px 0',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            marginRight: 'auto',
            // L16：pi-web 品牌字标 = mono / 15px / 700 / letterSpacing -0.01em（无 emoji）
            fontFamily: 'var(--font-mono)',
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}
        >
          PiBoat
        </span>
        {(['sessions', 'files'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={tab === candidate}
            onClick={() => setTab(candidate)}
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: tab === candidate ? 'var(--bg-selected)' : 'transparent',
              color: tab === candidate ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {candidate === 'sessions' ? '会话' : '文件'}
          </button>
        ))}
      </div>
      <Sidebar
        sessions={projectSessions}
        projects={projects}
        activeProjectKey={effectiveProjectKey}
        runningSessionIds={runningSessionIds}
        activeSessionId={activeSessionId}
        worktrees={worktreesQuery.data?.worktrees ?? []}
        currentWorktreePath={worktreesQuery.data?.currentWorktreePath ?? null}
        worktreeBusy={createWorktreeMutation.isPending || removeWorktreeMutation.isPending}
        searching={tab === 'sessions' && searchQuery.trim().length > 0}
        onSelectProject={(projectKey) => {
          const project = projects.find((candidate) => candidate.key === projectKey);
          if (project === undefined) return;
          setSelectedProjectKey(projectKey);
          // 授权项目根：文件树/查看器读文件受 allowed-roots 约束（用户点选 = 显式选择）
          void validateCwd(project.root).catch(() => null);
          onNewSession(project.cwd);
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
        searchSlot={
          tab === 'sessions' ? <SessionSearch onQueryChange={setSearchQuery} /> : undefined
        }
        content={
          tab === 'files' ? (
            <FileExplorerPane
              root={projectRoot}
              onResolvedRoot={setResolvedRoot}
              onError={(message) => pushToast(message, 'error')}
              onNotice={(message) => pushToast(message)}
            />
          ) : undefined
        }
      />
      <ToastHost items={toasts} />
    </>
  );
}
