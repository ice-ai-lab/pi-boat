import {
  CLIENT_VERSION,
  getDefaultCwd,
  getHome,
  getRecentProjects,
  validateCwd,
  workspaceKeyOf,
} from '@ice-ai/client';
import {
  useCreateWorktreeMutation,
  useDeleteSessionMutation,
  useGitStatusQuery,
  useRemoveWorktreeMutation,
  useRenameSessionMutation,
  useSessionsQuery,
  useWorktreesQuery,
} from '@ice-ai/client/react';
import type { SessionInfo } from '@ice-ai/protocol';
import { Sidebar, type SidebarProject, type SidebarWorktreeState } from '@ice-ai/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { insertMention } from '../services/mention-bus';
import { useResizablePanel } from '../services/use-resizable-panel';
import { type FileExplorerHandle, FileExplorerPane } from './file-explorer-pane';

/**
 * SidebarPane（T2 重排）：侧栏数据装配——项目/工作区选择、会话列表、未读与运行指示、
 * 自定义目录选择、worktree 管理与 EXPLORER 区。
 * 结构与动作口径逐条按设计规范 `SessionSidebar`；展示全部交给 `@ice-ai/ui` 的 `Sidebar`。
 */
export interface SidebarPaneProps {
  activeSessionId: string | null;
  onSelectSession(sessionId: string): void;
  /** 新建会话：带上项目/工作区 cwd（null = 用上次记忆的 cwd） */
  onNewSession(cwd: string | null): void;
  /** 当前项目根变化（文件树与查看器需要同一基准） */
  onProjectRootChange(root: string | null): void;
}

const UNREAD_SESSIONS_STORAGE_KEY = 'piboat:unread-session-ids';
const LAST_CUSTOM_CWD_STORAGE_KEY = 'piboat:last-custom-cwd';
const EXPLORER_OPEN_STORAGE_KEY = 'piboat:explorer-open';
const SESSION_PANE_DEFAULT_HEIGHT = 320;
const SESSION_PANE_MIN_HEIGHT = 80;
const SESSION_PANE_MAX_HEIGHT = 1600;

function loadString(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function saveString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 存储不可用是尽力而为
  }
}

function loadUnreadSessionIds(): Set<string> {
  try {
    const raw = window.localStorage.getItem(UNREAD_SESSIONS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === 'string'))
      : new Set();
  } catch {
    return new Set();
  }
}

function saveUnreadSessionIds(ids: ReadonlySet<string>): void {
  try {
    if (ids.size === 0) window.localStorage.removeItem(UNREAD_SESSIONS_STORAGE_KEY);
    else window.localStorage.setItem(UNREAD_SESSIONS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // 忽略配额 / 隐私模式错误
  }
}

function loadExplorerOpen(): boolean {
  try {
    return window.localStorage.getItem(EXPLORER_OPEN_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function SidebarPane({
  activeSessionId,
  onSelectSession,
  onNewSession,
  onProjectRootChange,
}: SidebarPaneProps) {
  const sessionsQuery = useSessionsQuery();
  const renameMutation = useRenameSessionMutation();
  const deleteMutation = useDeleteSessionMutation();
  const createWorktreeMutation = useCreateWorktreeMutation();
  const removeWorktreeMutation = useRemoveWorktreeMutation();

  const allSessions = sessionsQuery.data?.sessions ?? [];
  const runningSessionIds = useMemo(
    () => new Set(sessionsQuery.data?.runningSessionIds ?? []),
    [sessionsQuery.data],
  );
  const projects = useMemo(() => getRecentProjects(allSessions), [allSessions]);

  /** 当前生效 cwd（项目根 / worktree / 自定义目录） */
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState('');
  const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(() =>
    loadUnreadSessionIds(),
  );
  const [lastCustomCwd, setLastCustomCwd] = useState(() => loadString(LAST_CUSTOM_CWD_STORAGE_KEY));
  const [explorerOpen, setExplorerOpen] = useState(loadExplorerOpen);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [explorerRefreshDone, setExplorerRefreshDone] = useState(false);
  const [changesCollapsed, setChangesCollapsed] = useState(true);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  const fileExplorerRef = useRef<FileExplorerHandle>(null);
  const explorerRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRunningSessionIdsRef = useRef<Set<string>>(new Set());

  // —— 目录数据（家目录 / 上次自定义路径） ——
  useEffect(() => {
    void getHome()
      .then((data) => setHomeDir(data.home))
      .catch(() => setHomeDir(''));
  }, []);

  // —— 选中 cwd 同步：活动会话的 cwd 优先（设计规范 `lastSyncedCwdPropRef` 语义） ——
  const lastSyncedSessionCwdRef = useRef<string | null>(null);
  useEffect(() => {
    const active = allSessions.find((session) => session.id === activeSessionId);
    if (active === undefined || active.cwd.length === 0) return;
    if (active.cwd === lastSyncedSessionCwdRef.current) return;
    lastSyncedSessionCwdRef.current = active.cwd;
    setSelectedCwd(active.cwd);
  }, [allSessions, activeSessionId]);

  // 首屏：无活动会话时默认第一个项目
  useEffect(() => {
    const first = projects[0];
    if (selectedCwd !== null || first === undefined) return;
    setSelectedCwd(first.root);
  }, [projects, selectedCwd]);

  // —— worktree 数据 ——
  const worktreesQuery = useWorktreesQuery(selectedCwd);
  const worktreeState: SidebarWorktreeState | null = useMemo(() => {
    const data = worktreesQuery.data;
    if (data === undefined) return null;
    return {
      projectKey: data.projectKey,
      isGit: data.isGit,
      isTopLevel: data.isTopLevel,
      currentWorktreePath: data.currentWorktreePath,
      // B 的 worktree 列表用 bare 标记主检出；主检出 = 路径等于仓库根
      worktrees: data.worktrees.map((worktree) => ({
        path: worktree.path,
        branch: worktree.branch,
        isMain: worktree.path === data.projectRoot,
      })),
    };
  }, [worktreesQuery.data]);

  // —— 项目身份（与设计规范 `projectFor` 同口径：worktree → 会话 → cwd 兜底） ——
  const selectedProject: SidebarProject | null = useMemo(() => {
    if (selectedCwd === null) return null;
    if (worktreeState !== null) {
      const belongs = worktreeState.worktrees.some((worktree) => worktree.path === selectedCwd);
      if (belongs || worktreesQuery.data?.currentWorktreePath === selectedCwd) {
        return {
          key: worktreeState.projectKey,
          root: worktreesQuery.data?.projectRoot ?? selectedCwd,
        };
      }
    }
    const match = allSessions.find(
      (session) =>
        session.cwd === selectedCwd || (session.projectRoot ?? session.cwd) === selectedCwd,
    );
    return match !== undefined
      ? { key: workspaceKeyOf(match), root: match.projectRoot ?? match.cwd }
      : { key: selectedCwd, root: selectedCwd };
  }, [selectedCwd, worktreeState, worktreesQuery.data, allSessions]);

  const projectSessions = useMemo(() => {
    if (selectedProject === null) return allSessions;
    return allSessions.filter((session) => workspaceKeyOf(session) === selectedProject.key);
  }, [allSessions, selectedProject]);

  // —— 项目根回传（文件树/查看器共用；真实根优先） ——
  const projectRoot = resolvedRoot ?? selectedProject?.root ?? null;
  const rootChangeRef = useRef(onProjectRootChange);
  rootChangeRef.current = onProjectRootChange;
  useEffect(() => {
    rootChangeRef.current(projectRoot);
    // 目录读受 allowed-roots 约束（ADR-0013）：首屏默认项目/会话恢复的 cwd 也要显式授权一次，
    // 否则文件树与右栏会拿到 403（设计规范在初始项目选择与自定义路径两处都做 validateCwd）
    if (projectRoot !== null) void validateCwd(projectRoot).catch(() => null);
  }, [projectRoot]);

  // —— 项目活动徽标（运行 / 未读计数，按稳定 projectKey 聚合） ——
  const projectActivity = useMemo(() => {
    const activity = new Map<string, { running: number; unread: number }>();
    for (const session of allSessions) {
      const key = workspaceKeyOf(session);
      const entry = activity.get(key) ?? { running: 0, unread: 0 };
      if (runningSessionIds.has(session.id)) entry.running += 1;
      if (unreadSessionIds.has(session.id)) entry.unread += 1;
      activity.set(key, entry);
    }
    return activity;
  }, [allSessions, runningSessionIds, unreadSessionIds]);

  // —— 未读标记：后台完成的会话（非当前选中）记未读；打开即清除 ——
  useEffect(() => {
    const previous = previousRunningSessionIdsRef.current;
    const completedInBackground = [...previous].filter(
      (id) => !runningSessionIds.has(id) && id !== activeSessionId,
    );
    const newlyRunning = [...runningSessionIds].filter((id) => !previous.has(id));
    if (completedInBackground.length > 0 || newlyRunning.length > 0) {
      setUnreadSessionIds((prev) => {
        const next = new Set(prev);
        for (const id of runningSessionIds) next.delete(id);
        for (const id of completedInBackground) next.add(id);
        return next;
      });
    }
    previousRunningSessionIdsRef.current = runningSessionIds;
  }, [runningSessionIds, activeSessionId]);

  useEffect(() => {
    saveUnreadSessionIds(unreadSessionIds);
  }, [unreadSessionIds]);

  useEffect(() => {
    if (activeSessionId === null) return;
    setUnreadSessionIds((prev) => {
      if (!prev.has(activeSessionId)) return prev;
      const next = new Set(prev);
      next.delete(activeSessionId);
      return next;
    });
  }, [activeSessionId]);

  // —— 会话/EXPLORER 之间的竖向拖拽（设计规范 `sidebar-section-resize-handle`） ——
  const sessionPaneHeightRef = useRef(SESSION_PANE_DEFAULT_HEIGHT);
  const sessionPaneResizer = useResizablePanel({
    ariaLabel: '调整会话列表与文件浏览器高度',
    axis: 'vertical',
    cssVariable: '--sidebar-session-pane-height',
    defaultWidth: SESSION_PANE_DEFAULT_HEIGHT,
    getMaxWidth: () => SESSION_PANE_MAX_HEIGHT,
    growthDirection: 'down',
    maxWidth: SESSION_PANE_MAX_HEIGHT,
    minWidth: SESSION_PANE_MIN_HEIGHT,
    storageKey: 'piboat:sidebar-session-pane-height',
    widthRef: sessionPaneHeightRef,
  });

  // —— 变更文件数量（EXPLORER 头部图标可见性） ——
  const gitStatus = useGitStatusQuery(projectRoot);
  const changesCount = gitStatus.data?.files.length ?? 0;

  // —— 动作 ——
  const commitCustomPath = useCallback(async (path: string): Promise<string | null> => {
    try {
      const validated = await validateCwd(path);
      setLastCustomCwd(validated.cwd);
      saveString(LAST_CUSTOM_CWD_STORAGE_KEY, validated.cwd);
      setSelectedCwd(validated.cwd);
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  }, []);

  const useDefaultDirectory = useCallback(async (): Promise<string | null> => {
    try {
      const created = await getDefaultCwd();
      setSelectedCwd(created.cwd);
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : String(caught);
    }
  }, []);

  const createWorktree = useCallback(
    async (branch: string): Promise<string | null> => {
      if (selectedProject === null) return '未选择项目';
      try {
        const created = await createWorktreeMutation.mutateAsync({
          cwd: selectedProject.root,
          branch,
        });
        setSelectedCwd(created.path);
        return null;
      } catch (caught) {
        return caught instanceof Error ? caught.message : String(caught);
      }
    },
    [selectedProject, createWorktreeMutation],
  );

  const removeWorktree = useCallback(
    async (path: string, force: boolean): Promise<{ error?: string; dirty?: boolean } | null> => {
      if (selectedProject === null) return { error: '未选择项目' };
      try {
        await removeWorktreeMutation.mutateAsync({ cwd: selectedProject.root, path, force });
        if (selectedCwd === path) setSelectedCwd(selectedProject.root);
        return null;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return message.toLowerCase().includes('409') || message.toLowerCase().includes('dirty')
          ? { dirty: true }
          : { error: message };
      }
    },
    [selectedProject, selectedCwd, removeWorktreeMutation],
  );

  const renameSession = useCallback(
    async (id: string, name: string) => {
      await renameMutation.mutateAsync({ sessionId: id, name });
    },
    [renameMutation],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync(id);
    },
    [deleteMutation],
  );

  const toggleExplorer = useCallback((open: boolean) => {
    setExplorerOpen(open);
    saveString(EXPLORER_OPEN_STORAGE_KEY, String(open));
  }, []);

  const refreshExplorer = useCallback(() => {
    setExplorerRefreshKey((key) => key + 1);
    setExplorerRefreshDone(true);
    if (explorerRefreshTimerRef.current !== null) clearTimeout(explorerRefreshTimerRef.current);
    explorerRefreshTimerRef.current = setTimeout(() => setExplorerRefreshDone(false), 2000);
  }, []);

  return (
    <Sidebar
      sessions={projectSessions}
      loading={sessionsQuery.isLoading}
      error={sessionsQuery.error === null ? null : sessionsQuery.error.message}
      selectedSessionId={activeSessionId}
      runningSessionIds={runningSessionIds}
      unreadSessionIds={unreadSessionIds}
      selectedCwd={selectedCwd}
      selectedProject={selectedProject}
      projects={projects.map((project) => ({ key: project.key, root: project.root }))}
      projectActivity={projectActivity}
      homeDir={homeDir}
      versionLabel={CLIENT_VERSION}
      worktreeState={worktreeState}
      worktreeLoading={worktreesQuery.isLoading}
      showExplorer={selectedCwd !== null}
      explorerOpen={explorerOpen}
      onToggleExplorer={toggleExplorer}
      sessionPaneRef={sessionPaneResizer.panelRef}
      resizeHandleSlot={
        <div
          {...sessionPaneResizer.separatorProps}
          className={`sidebar-section-resize-handle${sessionPaneResizer.isResizing ? ' is-resizing' : ''}`}
          data-resize-handle="sidebar-sections"
          title="调整会话列表与文件浏览器高度：拖拽或上下键（双击复位）"
          style={{
            position: 'relative',
            zIndex: 20,
            width: '100%',
            height: 12,
            margin: '-6px 0',
            flex: '0 0 12px',
            cursor: 'row-resize',
            touchAction: 'none',
          }}
        />
      }
      explorerSlot={
        <div
          className="scrollbar-subtle"
          style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
        >
          <FileExplorerPane
            ref={fileExplorerRef}
            root={projectRoot}
            fileSearchOpen={fileSearchOpen}
            onFileSearchOpenChange={setFileSearchOpen}
            changesCollapsed={changesCollapsed}
            refreshKey={explorerRefreshKey}
            onResolvedRoot={setResolvedRoot}
            onAtMention={(relativePath, isDir) => insertMention(relativePath, isDir)}
            onUploadBusyChange={setUploadBusy}
            onError={() => {}}
            onNotice={() => {}}
          />
        </div>
      }
      changesCount={changesCount}
      changesCollapsed={changesCollapsed}
      onToggleChanges={() => setChangesCollapsed((collapsed) => !collapsed)}
      fileSearchOpen={fileSearchOpen}
      onToggleFileSearch={setFileSearchOpen}
      uploadBusy={uploadBusy}
      onUpload={() => fileExplorerRef.current?.openUploadPicker()}
      onRefreshExplorer={refreshExplorer}
      explorerRefreshDone={explorerRefreshDone}
      onSelectSession={(session: SessionInfo) => {
        if (session.cwd.length > 0) setSelectedCwd(session.cwd);
        onSelectSession(session.id);
      }}
      onNewSession={() => onNewSession(selectedCwd)}
      onSelectProjectRoot={(root) => {
        setSelectedCwd(root);
        void validateCwd(root).catch(() => null);
      }}
      onUseDefaultDirectory={useDefaultDirectory}
      onCommitCustomPath={commitCustomPath}
      onSelectWorktree={(path) => setSelectedCwd(path)}
      onCreateWorktree={createWorktree}
      onRemoveWorktree={removeWorktree}
      onRenameSession={renameSession}
      onDeleteSession={deleteSession}
      onSessionsChanged={() => void sessionsQuery.refetch()}
      lastCustomCwd={lastCustomCwd}
    />
  );
}
