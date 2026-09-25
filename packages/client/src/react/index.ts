/**
 * @ice-ai/client/react —— React 绑定子入口（docs/05 §7）。
 * 铁律：主入口（../index.ts）不得 import React（docs/05 §1 边界 1）。
 */

export {
  queryKeys,
  useCreateWorktreeMutation,
  useDeleteSessionMutation,
  useGitStatusQuery,
  useProjectsQuery,
  useRemoveWorktreeMutation,
  useRenameSessionMutation,
  useSessionSearchQuery,
  useSessionsQuery,
  useWorktreesQuery,
} from './queries';
export { type UseAgentSessionResult, useAgentSession } from './use-agent-session';
