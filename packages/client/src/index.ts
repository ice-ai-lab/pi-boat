import { PROTOCOL_VERSION } from '@ice-ai/protocol';

/**
 * @ice-ai/client —— 前端与 server 之间唯一的落地层（docs/05-client-design.md）。
 *
 * 三条边界（docs/05 §1）：
 * 1. 与 React 解耦：本入口**不得 import React**（Electron 主进程 / Node / vitest 都要能跑）；
 *    React 绑定在 `@ice-ai/client/react`。
 * 2. 不碰 SDK：只依赖 `protocol`（AGENTS.md 依赖铁律）。
 * 3. 不建缓存真相：只持有事件流的当前值；历史事实归 `.jsonl` + REST。
 */

export const CLIENT_VERSION = `0.0.0 (protocol v${PROTOCOL_VERSION})`;

export {
  agentEventsUrl,
  getRunningSessions,
  getRunningState,
  newSession,
  sendCommand,
} from './endpoints/agent';
export { listProjects, primaryCwd } from './endpoints/projects';
export {
  deleteSession,
  getSessionContext,
  getSessionDetail,
  getSessionState,
  listSessions,
  renameSession,
  searchSessions,
} from './endpoints/sessions';
export {
  ApiClient,
  type ApiClientOptions,
  ApiError,
  createApiClient,
  NetworkError,
  ResponseSchemaError,
} from './http';
export {
  AgentStream,
  type AgentStreamListener,
  type AgentStreamOptions,
} from './stream/agent-stream';
export {
  AgentEventSource,
  type AgentEventSourceOptions,
  type EventSourceFactory,
  type EventSourceLike,
  parseFrame,
} from './stream/event-source';
export {
  assistantKey,
  type ChatView,
  createChatView,
  EMPTY_USAGE,
  extractDiff,
  extractText,
  foldEvent,
  groupTrail,
  ingestAssistantMessage,
  ingestToolResult,
  mergeTurns,
  type ProcessGroupData,
  patchToolRow,
  type SystemRow,
  sumUsage,
  type TextRow,
  type ThinkingRow,
  type ToolRow,
  type TrailItem,
  type TrailRow,
  type Turn,
  toolTitle,
} from './stream/fold';
export { turnsFromEntries, turnsFromMessages } from './stream/rebuild';
