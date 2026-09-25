/**
 * 文件页签状态（纯函数 reducer；A 类移植自 pi-web lib/file-viewer-state.ts +
 * components/file-tab-state.ts 的语义）。状态归 apps/web，本文件只给不可变操作。
 */
export type FileDisplayMode = 'source' | 'preview' | 'diff';

export interface FileTab {
  /** 绝对路径（唯一键） */
  path: string;
  displayMode: FileDisplayMode;
  wrapLines: boolean;
}

export interface FileTabsState {
  tabs: FileTab[];
  activePath: string | null;
}

export const EMPTY_FILE_TABS: FileTabsState = { tabs: [], activePath: null };

/** 打开（已开则激活；同一路径不重复开） */
export function openFileTab(
  state: FileTabsState,
  path: string,
  displayMode: FileDisplayMode = 'source',
): FileTabsState {
  const existing = state.tabs.find((tab) => tab.path === path);
  if (existing !== undefined) {
    return { tabs: state.tabs, activePath: path };
  }
  return {
    tabs: [...state.tabs, { path, displayMode, wrapLines: false }],
    activePath: path,
  };
}

/** 关闭（关了活动页则激活其右邻，否则左邻） */
export function closeFileTab(state: FileTabsState, path: string): FileTabsState {
  const index = state.tabs.findIndex((tab) => tab.path === path);
  if (index === -1) return state;
  const tabs = state.tabs.filter((tab) => tab.path !== path);
  if (state.activePath !== path) return { tabs, activePath: state.activePath };
  const next = tabs[index] ?? tabs[index - 1] ?? null;
  return { tabs, activePath: next?.path ?? null };
}

export function activateFileTab(state: FileTabsState, path: string): FileTabsState {
  if (!state.tabs.some((tab) => tab.path === path)) return state;
  return { tabs: state.tabs, activePath: path };
}

/** 更新活动页的展示模式（diff 模式仅对有 git 改动的文件开放） */
export function setTabDisplayMode(
  state: FileTabsState,
  path: string,
  displayMode: FileDisplayMode,
): FileTabsState {
  return {
    tabs: state.tabs.map((tab) => (tab.path === path ? { ...tab, displayMode } : tab)),
    activePath: state.activePath,
  };
}

export function toggleTabWrap(state: FileTabsState, path: string): FileTabsState {
  return {
    tabs: state.tabs.map((tab) =>
      tab.path === path ? { ...tab, wrapLines: !tab.wrapLines } : tab,
    ),
    activePath: state.activePath,
  };
}

export function activeFileTab(state: FileTabsState): FileTab | null {
  if (state.activePath === null) return null;
  return state.tabs.find((tab) => tab.path === state.activePath) ?? null;
}

/** 初始展示模式：图片 → preview；有 git 改动且要求 diff → diff；其余 source */
export function resolveInitialDisplayMode(options: {
  isImage: boolean;
  preferDiff?: boolean;
}): FileDisplayMode {
  if (options.preferDiff === true) return 'diff';
  if (options.isImage) return 'preview';
  return 'source';
}
