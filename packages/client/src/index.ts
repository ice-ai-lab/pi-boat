/**
 * @ice-ai/client —— 框架无关核心（docs/05 §1 边界 1：本入口不得 import React）。
 * React 绑定在 './react' 子导出。
 */

export {
  abortAgentCompaction,
  agentEventsUrl,
  clearAgentQueue,
  cloneAgentSession,
  compactAgent,
  followUpAgent,
  forkAgentBranch,
  forkAgentSession,
  getAgentCommands,
  getAgentRunningState,
  getAgentStateLight,
  getAgentStats,
  getAgentTools,
  navigateAgentTree,
  newAgentSession,
  renewAgentLease,
  respondAgentExtensionUi,
  resumeAgentSession,
  sendAgentCommand,
  setAgentSessionName,
  setAgentTools,
  steerAgent,
} from './endpoints/agent';
export {
  checkUploadConflicts,
  type FileByteType,
  fileByteUrl,
  getFileIndex,
  getFileMeta,
  listDirectory,
  readFileText,
  type UploadResult,
  uploadFiles,
  validateCwd,
} from './endpoints/files';
export {
  discoverModels,
  getEnabledModels,
  getModelCatalog,
  getModels,
  getModelsConfig,
  putModelsConfig,
  refreshModels,
  testModel,
  updateEnabledModels,
} from './endpoints/models';
export {
  checkPluginUpdates,
  checkSkillUpdates,
  getPlugins,
  getProjectTrust,
  getSkills,
  getToolsSettings,
  installSkill,
  patchSkill,
  pluginAction,
  putProjectTrust,
  putToolsSettings,
  searchSkills,
  updateSkills,
} from './endpoints/resources';
export {
  autoNameSession,
  getSessionContext,
  getSessionDetail,
  sessionExportUrl,
} from './endpoints/sessions';
export { browseCwd, getDefaultCwd, getHome } from './endpoints/system';
export {
  createWorktree,
  deleteSession,
  getGitDiff,
  getGitStatus,
  listProjects,
  listSessions,
  listWorktrees,
  removeWorktree,
  renameSession,
  searchSessions,
} from './endpoints/workspace';
export {
  AT_RESULT_LIMIT,
  type AtInsertion,
  type AtQueryMatch,
  applyAtInsertion,
  buildAtInsertText,
  buildEntriesFromFiles,
  extractAtQuery,
  type FileIndexEntry,
  filterFileEntries,
  scoreEntry,
} from './files/file-fuzzy';
export {
  encodeFilePathForApi,
  getFileDirectory,
  getFileName,
  getRelativeFilePath,
  joinFilePath,
  normalizeFilePathSlashes,
  pathBreadcrumbs,
} from './files/file-paths';
export {
  type DocumentPreviewKind,
  documentPreviewKind,
  formatFileSize,
  getFileExt,
  getImageMime,
  getLanguageFromPath,
  IMAGE_PREVIEW_MAX_BYTES,
  isDocxPath,
  isImagePath,
  isProbablyTextPath,
  TEXT_PREVIEW_MAX_BYTES,
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
export {
  type DiffRow,
  hasChanges,
  type ParsedDiff,
  parseToolDiff,
  parseUnifiedDiff,
} from './files/unified-diff';
export { ApiError, getJson, http, postCommand } from './http';
export {
  EMPTY_CURSOR,
  type HistoryCursor,
  historyNext,
  historyPrev,
  INPUT_HISTORY_LIMIT,
  pushHistory,
} from './input/input-history';
export {
  applySlashInsertion,
  extractSlashQuery,
  filterSlashCommands,
  parseSlashSubmission,
  type SlashQueryMatch,
  slashSourceLabel,
} from './input/slash-commands';
export {
  clampPanelWidth,
  getDefaultRightPanelWidth,
  getRightPanelMaxWidth,
  getSidebarMaxWidth,
  MOBILE_MAX_WIDTH,
  RIGHT_PANEL_FALLBACK_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SPLIT_PANEL_MIN_WIDTH,
} from './layout/panel-layout';
export { AgentEventConnection, parseWireEvent } from './stream/agent-event-connection';
export { AgentStream, disposeAgentStream, getAgentStream } from './stream/agent-stream';
export { applyToolResult, assistantFinalText, fold, userText } from './stream/fold';
export { groupTrail } from './stream/group-trail';
export { rebuildChatState, rebuildTurns } from './stream/rebuild';
export { formatDuration, resultText, toolTitle } from './stream/tool-display';
export {
  type ChatState,
  emptyChatState,
  type GroupedTrailItem,
  isLiveTail,
  type ProcessGroupData,
  type SystemRow,
  type ThinkingRow,
  type ToolRow,
  type TrailItem,
  type Turn,
} from './stream/view-model';
export { CLIENT_VERSION } from './version';
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
  isThinkingExpandedByDefault,
  readStoredChatAppearance,
  setThinkingExpandedByDefault,
  THINKING_EXPANDED_EVENT,
  THINKING_EXPANDED_STORAGE_KEY,
} from './view-models/chat-appearance';
export {
  CHAT_SCROLL_REATTACH_TOLERANCE,
  CHAT_SCROLL_TAIL_TOLERANCE,
  captureScrollDistance,
  getLiveFollowAttached,
  getNextVisibleCount,
  getVisibleRenderWindow,
  isScrollAtTail,
  restoreScrollTop,
  shouldShowScrollToLatest,
  VISIBLE_PAGE_SIZE,
} from './view-models/chat-lazy-load';
export {
  activeRange,
  buildMinimapBars,
  type MinimapBar,
  scrollTopForBar,
  turnTone,
} from './view-models/minimap';
export {
  configProviderNames,
  enabledScopeLabel,
  groupModelsByProvider,
  isLastEnabledModel,
  type ProviderGroup,
  parseModelsConfigDraft,
  toggleHint,
} from './view-models/models';
export {
  filterSessions,
  formatRelativeTime,
  getProjectActivity,
  getRecentProjects,
  groupSessionsByProject,
  type RecentProject,
  sessionDisplayTitle,
  sessionsForProject,
  workspaceKeyOf,
} from './view-models/session-list';
export {
  getScrollTopForIndex,
  getSessionListHeight,
  getSessionListIndices,
  SESSION_LIST_ITEM_HEIGHT,
  SESSION_LIST_OVERSCAN,
} from './view-models/session-list-window';
export {
  contextPercent,
  formatCost,
  formatDurationMs,
  formatTokens,
  type StatsSummary,
  summarizeStats,
} from './view-models/session-stats';
export {
  applyTheme,
  isDarkTheme,
  isThemePreference,
  type ResolvedTheme,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_OPTIONS,
  type ThemePreference,
  themeLabel,
} from './view-models/theme';
export {
  allWrittenFiles,
  extractTurnWrittenFiles,
  shortPath,
  type WrittenFileGroup,
} from './view-models/turn-written-files';
