/**
 * @ice-ai/client —— 框架无关核心（docs/05 §1 边界 1：本入口不得 import React）。
 * React 绑定在 './react' 子导出。
 */

export {
  agentEventsUrl,
  getAgentRunningState,
  newAgentSession,
  renewAgentLease,
  resumeAgentSession,
  sendAgentCommand,
} from './endpoints/agent';
export {
  getSessionContext,
  getSessionDetail,
} from './endpoints/sessions';
export {
  createWorktree,
  deleteSession,
  getGitStatus,
  listProjects,
  listSessions,
  listWorktrees,
  removeWorktree,
  renameSession,
  searchSessions,
} from './endpoints/workspace';
export { ApiError, getJson, http, postCommand } from './http';
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
