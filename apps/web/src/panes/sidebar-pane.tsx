import {
  getDefaultCwd,
  getHome,
  getProjectActivity,
  projectKeyForCwd,
  validateCwd,
} from '@ice-ai/client';
import {
  useCwdProjectQuery,
  useDeleteSessionMutation,
  useGitStatusQuery,
  useProjectsQuery,
  useRenameSessionMutation,
  useSessionsQuery,
} from '@ice-ai/client/react';
import type { ProjectInfo, SessionInfo } from '@ice-ai/protocol';
import { Sidebar, type SidebarProject } from '@ice-ai/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '../layout/health';
import { insertMention } from '../services/mention-bus';
import { useResizablePanel } from '../services/use-resizable-panel';
import { type FileExplorerHandle, FileExplorerPane } from './file-explorer-pane';

/**
 * SidebarPane（T2 重排）：侧栏数据装配——项目/工作区选择、会话列表、未读与运行指示、
 * 自定义目录选择与 EXPLORER 区。不做分支展示与切换（分支只按会话行自己的 worktree 标记呈现）。
 * 结构与动作口径逐条按设计规范 `SessionSidebar`；展示全部交给 `@ice-ai/ui` 的 `Sidebar`。
 */
export interface SidebarPaneProps {
  activeSessionId: string | null;
  /**
   * 活动会话的 cwd（由中栏上抬）：会话列表按项目取数后，侧栏手里没有全量列表，
   * 无法再从中反推「当前会话属于哪个项目」，于是用真正打开了会话的地方作为来源。
   * 深链（`?s=`）刷页时也靠它把侧栏定位到正确的项目。
   */
  activeSessionCwd: string | null;
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
  activeSessionCwd,
  onSelectSession,
  onNewSession,
  onProjectRootChange,
}: SidebarPaneProps) {
  const projectsQuery = useProjectsQuery();
  const renameMutation = useRenameSessionMutation();
  const deleteMutation = useDeleteSessionMutation();

  // 项目清单来自 /api/projects（ADR-0008）：目录元数据扫描 + 每目录一次首行头，
  // 不解析会话正文也不依赖会话列表（含未落盘内存会话的 cwd）
  const projects: ProjectInfo[] = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data],
  );

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
  /** 上一轮“在跑的会话”快照：id → cwd（cwd 用来把「跑完了」归到项目上） */
  const previousRunningRef = useRef<Map<string, string>>(new Map());
  /** 见过的会话 → 项目键：unread 只在会话结束那一刻归位，那时它还在 runningSessions 里 */
  const [sessionProjects, setSessionProjects] = useState<ReadonlyMap<string, string>>(new Map());

  // —— 目录数据（家目录 / 上次自定义路径） ——
  useEffect(() => {
    void getHome()
      .then((data) => setHomeDir(data.home))
      .catch(() => setHomeDir(''));
  }, []);

  // —— 选中 cwd 同步：活动会话的 cwd 优先（设计规范 `lastSyncedCwdPropRef` 语义） ——
  // cwd 由中栏（真正打开会话的地方）上抬，不查会话列表：列表按项目取数后，
  // 用 `?s=` 深链进来时会话不在手里的列表里（刷页时侧栏会跳回第一个项目）
  const lastSyncedSessionCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeSessionCwd === null || activeSessionCwd.length === 0) return;
    if (activeSessionCwd === lastSyncedSessionCwdRef.current) return;
    lastSyncedSessionCwdRef.current = activeSessionCwd;
    setSelectedCwd(activeSessionCwd);
  }, [activeSessionCwd]);

  // 首屏：无活动会话时默认第一个项目
  useEffect(() => {
    const first = projects[0];
    if (selectedCwd !== null || first === undefined) return;
    setSelectedCwd(first.projectRoot);
  }, [projects, selectedCwd]);

  // —— 项目身份（权威来源：cwd/validate 的 git 归一点，worktree/子目录都归到项目根，与 `?projectKey=` 过滤同源） ——
  const cwdProjectQuery = useCwdProjectQuery(selectedCwd);
  const selectedProject: SidebarProject | null = useMemo(() => {
    if (selectedCwd === null) return null;
    const validated = cwdProjectQuery.data;
    if (validated?.success === true && validated.cwd === selectedCwd) {
      return { key: validated.projectKey, root: validated.projectRoot };
    }
    // 清单里的目录（含 worktree 与子目录）也能反查（含未落盘内存会话的 cwd）
    const match = projects.find(
      (project) => project.projectRoot === selectedCwd || project.cwds.includes(selectedCwd),
    );
    return match !== undefined
      ? { key: match.projectKey, root: match.projectRoot }
      : { key: selectedCwd, root: selectedCwd };
  }, [selectedCwd, cwdProjectQuery.data, projects]);

  // —— 会话列表：按项目取数（服务端 `?projectKey=` 把过滤下推到扫描层，ADR-0008） ——
  const sessionsQuery = useSessionsQuery(selectedProject?.key ?? null);
  const allSessions = sessionsQuery.data?.sessions ?? [];
  const runningSessions = sessionsQuery.data?.runningSessions ?? [];
  const runningSessionIds = useMemo(
    () => new Set(runningSessions.map((session) => session.id)),
    [runningSessions],
  );

  const projectSessions = allSessions;

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

  // —— 会话 → 项目归属索引：unread 在会话结束那一刻只能靠它归位（服务端随列表
  // 下发的 runningSessions 带 cwd；已加载的项目列表直接归当前项目） ——
  useEffect(() => {
    setSessionProjects((previous) => {
      const next = new Map(previous);
      let changed = false;
      for (const session of runningSessions) {
        const key = projectKeyForCwd(projects, session.cwd);
        if (key !== null && next.get(session.id) !== key) {
          next.set(session.id, key);
          changed = true;
        }
      }
      if (selectedProject !== null) {
        for (const session of allSessions) {
          if (next.get(session.id) !== selectedProject.key) {
            next.set(session.id, selectedProject.key);
            changed = true;
          }
        }
      }
      return changed ? next : previous;
    });
  }, [runningSessions, projects, allSessions, selectedProject]);

  // —— 项目活动徽标（运行 / 未读计数，按稳定 projectKey 聚合） ——
  const projectActivity = useMemo(
    () =>
      getProjectActivity({
        projects,
        running: runningSessions,
        unread: unreadSessionIds,
        sessionProjects,
      }),
    [projects, runningSessions, unreadSessionIds, sessionProjects],
  );

  // —— 未读标记：后台完成的会话（非当前选中）记未读；打开即清除 ——
  useEffect(() => {
    const previous = previousRunningRef.current;
    const completedInBackground = [...previous.keys()].filter(
      (id) => !runningSessionIds.has(id) && id !== activeSessionId,
    );
    const newlyRunning = runningSessions.filter((session) => !previous.has(session.id));
    if (completedInBackground.length > 0 || newlyRunning.length > 0) {
      setUnreadSessionIds((prev) => {
        const next = new Set(prev);
        for (const id of runningSessionIds) next.delete(id);
        for (const id of completedInBackground) next.add(id);
        return next;
      });
    }
    previousRunningRef.current = new Map(
      runningSessions.map((session) => [session.id, session.cwd]),
    );
  }, [runningSessions, runningSessionIds, activeSessionId]);

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
      projects={projects.map((project) => ({
        key: project.projectKey,
        root: project.projectRoot,
      }))}
      projectActivity={projectActivity}
      homeDir={homeDir}
      versionLabel={APP_VERSION}
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
      onRenameSession={renameSession}
      onDeleteSession={deleteSession}
      onSessionsChanged={() => void sessionsQuery.refetch()}
      lastCustomCwd={lastCustomCwd}
    />
  );
}
