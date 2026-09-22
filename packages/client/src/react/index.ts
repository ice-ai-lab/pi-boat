/**
 * `@ice-ai/client/react` —— React 绑定子导出（docs/05 §7）。
 * 主入口（`@ice-ai/client`）不得 import React；TanStack Query 只出现在这里。
 */

export { getApiClient, setApiClient } from './client';
export {
  queryKeys,
  useAgentRunningStateQuery,
  useProjectsQuery,
  useSessionContextQuery,
  useSessionDetailQuery,
  useSessionsQuery,
} from './queries';
export {
  type UseAgentSessionOptions,
  type UseAgentSessionResult,
  type UseAgentStreamResult,
  useAgentSession,
  useAgentStream,
} from './use-agent-session';
