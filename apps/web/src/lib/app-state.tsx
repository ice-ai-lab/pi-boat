import { useProjectsQuery } from '@ice-ai/client/react';
import type { ProjectInfo } from '@ice-ai/protocol';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  clampRightbarWidth,
  clampSidebarWidth,
  readStoredRightbar,
  readStoredSidebar,
  readStoredTheme,
  SIDEBAR_DEFAULT_PX,
  storeRightbar,
  storeSidebar,
  storeTheme,
  type Theme,
} from './prefs';
import {
  findProjectByCwd,
  projectCwd,
  readStoredWorkspaceKey,
  resolveWorkspaceKey,
  storeWorkspaceKey,
} from './workspace';

/**
 * 应用级状态（唯一一处跨路由共享的 UI 状态，docs/06 §4.5：布局/装配留在 apps/web）。
 *
 * - **文件夹空间**：`GET /api/projects` 拉清单，默认选中最近一次对话所在的项目
 *   （`resolveWorkspaceKey`，见 lib/workspace.ts 头注释）。选择写进 localStorage。
 * - **侧栏**：折叠态与宽度（原型 `#sbCollapse` + `makeDrag("dragL")`，持久化见 docs/06 §8.5）。
 *
 * 刻意不引入 Zustand（docs/01 §4：M1 单状态源足够，M2 再按需）——这里只有两三个字段，
 * Context + localStorage 就够，且不新增依赖。
 */
export interface AppStateValue {
  projects: ProjectInfo[];
  projectsLoading: boolean;
  projectsError: unknown;
  /** 当前文件夹空间的 `projectKey`；null = 还没有任何项目（hero 用路径输入兜底） */
  workspaceKey: string | null;
  workspace: ProjectInfo | null;
  /** 当前空间的代表 cwd（hero 的路径输入初值） */
  cwd: string | null;
  selectWorkspace: (projectKey: string) => void;
  /** 提交自定义 cwd 后反哺空间选择；返回命中的 `projectKey`（未命中为 null） */
  adoptCwd: (cwd: string) => string | null;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarWidth: number;
  setSidebarWidth: (px: number) => void;
  /** 右侧栏（文件 dock，原型默认收起） */
  rightbarCollapsed: boolean;
  toggleRightbar: () => void;
  setRightbarCollapsed: (collapsed: boolean) => void;
  rightbarWidth: number;
  setRightbarWidth: (px: number) => void;
  /** 主题（原型 #themeBtn；M1 已启用，变量在 theme.css 里完整） */
  theme: Theme;
  toggleTheme: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data?.projects ?? [];

  const [workspaceKey, setWorkspaceKey] = useState<string | null>(readStoredWorkspaceKey);
  const sidebar = useRef(readStoredSidebar());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(sidebar.current.collapsed);
  const [sidebarWidth, setSidebarWidthState] = useState(sidebar.current.width);
  const rightbar = useRef(readStoredRightbar());
  const [rightbarCollapsed, setRightbarCollapsedState] = useState(rightbar.current.collapsed);
  const [rightbarWidth, setRightbarWidthState] = useState(rightbar.current.width);
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // 主题写进 <html data-theme>，token 块随之切换（原型 #themeBtn 同款）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /**
   * 首次拿到项目清单时确定默认空间：记住的选择还在就用它，否则选最近有活动的项目
   * （= 最近一次对话的文件夹空间）。跑一次即锁，后续刷新列表不覆盖用户的选择。
   */
  const resolved = useRef(false);
  useEffect(() => {
    if (resolved.current || projects.length === 0) return;
    resolved.current = true;
    const key = resolveWorkspaceKey(projects, readStoredWorkspaceKey());
    if (key === null) return;
    setWorkspaceKey(key);
    storeWorkspaceKey(key);
  }, [projects]);

  const selectWorkspace = useCallback((projectKey: string) => {
    setWorkspaceKey(projectKey);
    storeWorkspaceKey(projectKey);
  }, []);

  const adoptCwd = useCallback(
    (cwd: string) => {
      const project = findProjectByCwd(projects, cwd);
      if (project === null) return null;
      if (project.projectKey !== workspaceKey) selectWorkspace(project.projectKey);
      return project.projectKey;
    },
    [projects, workspaceKey, selectWorkspace],
  );

  const setSidebarWidth = useCallback((px: number) => {
    const width = clampSidebarWidth(px);
    setSidebarWidthState(width);
    sidebar.current = { collapsed: sidebar.current.collapsed, width };
    storeSidebar(sidebar.current);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      sidebar.current = { collapsed: next, width: sidebar.current.width };
      storeSidebar(sidebar.current);
      return next;
    });
  }, []);

  const setRightbarWidth = useCallback((px: number) => {
    const width = clampRightbarWidth(px);
    setRightbarWidthState(width);
    rightbar.current = { collapsed: rightbar.current.collapsed, width };
    storeRightbar(rightbar.current);
  }, []);

  const setRightbarCollapsed = useCallback((collapsed: boolean) => {
    setRightbarCollapsedState(collapsed);
    rightbar.current = { collapsed, width: rightbar.current.width };
    storeRightbar(rightbar.current);
  }, []);

  const toggleRightbar = useCallback(() => {
    setRightbarCollapsed(!rightbar.current.collapsed);
  }, [setRightbarCollapsed]);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      storeTheme(next);
      return next;
    });
  }, []);

  const value: AppStateValue = {
    projects,
    projectsLoading: projectsQuery.isPending,
    projectsError: projectsQuery.error,
    workspaceKey,
    workspace: projects.find((project) => project.projectKey === workspaceKey) ?? null,
    cwd: projectCwd(projects, workspaceKey),
    selectWorkspace,
    adoptCwd,
    sidebarCollapsed,
    toggleSidebar,
    sidebarWidth,
    setSidebarWidth,
    rightbarCollapsed,
    toggleRightbar,
    setRightbarCollapsed,
    rightbarWidth,
    setRightbarWidth,
    theme,
    toggleTheme,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (value === null) throw new Error('useAppState 必须在 AppStateProvider 内使用');
  return value;
}

/** 供窄屏门禁与测试引用：默认宽度（避免测试写死数字） */
export { SIDEBAR_DEFAULT_PX };
