/**
 * @ice-ai/client —— 框架无关核心（docs/05 §1 边界 1：本入口不得 import React）。
 * React 绑定在 './react' 子导出。
 */

export { sendAgentCommand } from './endpoints/agent';
export {
  fileByteUrl,
  getFileIndex,
  getFileMeta,
  listDirectory,
  readFileText,
  uploadFiles,
  validateCwd,
} from './endpoints/files';
export { queryProviderUsage } from './endpoints/models';

export { browseCwd, getDefaultCwd, getHome, pickDirectory } from './endpoints/system';
export {
  getGitDiff,
  searchSessions,
} from './endpoints/workspace';
export {
  applyAtInsertion,
  buildEntriesFromFiles,
  extractAtQuery,
  filterFileEntries,
} from './files/file-fuzzy';
export {
  getFileName,
  getRelativeFilePath,
} from './files/file-paths';
export {
  documentPreviewKind,
  formatFileSize,
  getLanguageFromPath,
  isDocxPath,
  isImagePath,
} from './files/file-types';
export {
  activateFileTab,
  activeFileTab,
  closeFileTab,
  EMPTY_FILE_TABS,
  type FileDisplayMode,
  type FileTab,
  type FileTabsState,
  openFileTab,
  resolveInitialDisplayMode,
  setTabDisplayMode,
  toggleTabWrap,
} from './files/file-viewer-state';
export { parseUnifiedDiff } from './files/unified-diff';

export { pushHistory } from './input/input-history';
export {
  applySlashInsertion,
  extractSlashQuery,
  filterSlashCommands,
  parseSlashSubmission,
  slashSourceLabel,
} from './input/slash-commands';
export {
  clampPanelWidth,
  getDefaultRightPanelWidth,
  getRightPanelMaxWidth,
  getSidebarMaxWidth,
  RIGHT_PANEL_FALLBACK_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './layout/panel-layout';

export { groupTrail } from './stream/group-trail';

export { formatDuration } from './stream/tool-display';
export type {
  ChatState,
  ProcessGroupData,
  TextRow,
  ThinkingRow,
  ToolRow,
  TrailItem,
  Turn,
} from './stream/view-model';
export {
  applyChatAppearance,
  CHAT_CONTENT_FONT_SIZE_DEFAULT,
  CHAT_CONTENT_FONT_SIZE_MAX,
  CHAT_CONTENT_FONT_SIZE_MIN,
  CHAT_CONTENT_FONT_SIZE_STORAGE_KEY,
  CHAT_CONTENT_WIDTH_DEFAULT,
  CHAT_CONTENT_WIDTH_MAX,
  CHAT_CONTENT_WIDTH_MIN,
  CHAT_CONTENT_WIDTH_STORAGE_KEY,
  type ChatAppearance,
  clampChatContentFontSize,
  clampChatContentWidth,
  DEFAULT_CHAT_APPEARANCE,
  readStoredChatAppearance,
  resolveChatContentWidth,
} from './view-models/chat-appearance';
export {
  captureScrollDistance,
  getLiveFollowAttached,
  restoreScrollTop,
  shouldShowScrollToLatest,
} from './view-models/chat-lazy-load';
export { parseModelsConfigDraft } from './view-models/models';
export {
  formatRelativeTime,
  getProjectActivity,
  projectKeyForCwd,
} from './view-models/session-list';
export {
  buildSessionListRows,
  getSessionListVisibleRows,
  groupSessionsByDay,
  SESSION_LIST_HEIGHTS_DESKTOP,
  SESSION_LIST_HEIGHTS_NARROW,
  SESSION_LIST_OVERSCAN,
  type SessionListHeights,
} from './view-models/session-list-window';

export {
  applyTheme,
  isDarkTheme,
  isThemePreference,
  type ResolvedTheme,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_OPTIONS,
  type ThemePreference,
} from './view-models/theme';
export {
  extractTurnWrittenFiles,
  shortPath,
} from './view-models/turn-written-files';
