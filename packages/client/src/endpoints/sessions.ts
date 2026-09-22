import {
  commandOkSchema,
  SESSION_SEARCH_PATH,
  SESSIONS_PATH,
  type SessionContext,
  type SessionContextQuery,
  SessionContextSchema,
  type SessionDeleteResponse,
  SessionDeleteResponseSchema,
  type SessionDetailResponse,
  SessionDetailResponseSchema,
  type SessionInfo,
  SessionInfoSchema,
  type SessionListQuery,
  type SessionListResponse,
  SessionListResponseSchema,
  type SessionRenameRequest,
  SessionRenameRequestSchema,
  type SessionSearchResponse,
  SessionSearchResponseSchema,
  type SessionStateResponse,
  SessionStateResponseSchema,
  sessionContextPath,
  sessionPath,
  sessionStatePath,
} from '@ice-ai/protocol';
import type { ApiClient } from '../http';

/**
 * 会话浏览域的端点封装（docs/05 §2）：列表 / 搜索 / 详情 / 上下文分页 / 改名 / 删除。
 * 列表按 `projectKey` 过滤与 `listFingerprint` 失效见 ADR-0008（Query 的失效键）。
 */

export function listSessions(
  client: ApiClient,
  query: SessionListQuery = {},
): Promise<SessionListResponse> {
  return client.request(
    { method: 'GET', url: SESSIONS_PATH, params: query },
    SessionListResponseSchema,
  );
}

export function searchSessions(client: ApiClient, q: string): Promise<SessionSearchResponse> {
  return client.request(
    { method: 'GET', url: SESSION_SEARCH_PATH, params: { q } },
    SessionSearchResponseSchema,
  );
}

export function getSessionDetail(client: ApiClient, id: string): Promise<SessionDetailResponse> {
  return client.request({ method: 'GET', url: sessionPath(id) }, SessionDetailResponseSchema);
}

/** GET /api/sessions/:id/context —— 历史分页（rebuild.ts 的事实来源） */
export function getSessionContext(
  client: ApiClient,
  id: string,
  query: SessionContextQuery = {},
): Promise<SessionContext> {
  return client.request(
    { method: 'GET', url: sessionContextPath(id), params: query },
    SessionContextSchema,
  );
}

/** GET /api/sessions/:id/state —— 文件不存在时 404（区别于轻查的 {running:false}） */
export function getSessionState(client: ApiClient, id: string): Promise<SessionStateResponse> {
  return client.request({ method: 'GET', url: sessionStatePath(id) }, SessionStateResponseSchema);
}

/** PATCH /api/sessions/:id —— 改名（运行中 409；改运行中会话走 M2 的 set_session_name 命令） */
export function renameSession(
  client: ApiClient,
  id: string,
  body: SessionRenameRequest,
): Promise<SessionInfo> {
  const parsed = SessionRenameRequestSchema.parse(body);
  return client
    .request(
      { method: 'PATCH', url: sessionPath(id), data: parsed },
      commandOkSchema(SessionInfoSchema),
    )
    .then((ok) => ok.data);
}

/** DELETE /api/sessions/:id —— 级联删除 subagent 子会话，返回受影响 id */
export function deleteSession(client: ApiClient, id: string): Promise<SessionDeleteResponse> {
  return client.request({ method: 'DELETE', url: sessionPath(id) }, SessionDeleteResponseSchema);
}
