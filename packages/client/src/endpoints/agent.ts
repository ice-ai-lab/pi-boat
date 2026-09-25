import type {
  AgentCommand,
  AgentRunningState,
  AgentState,
  BranchResult,
  ClearQueueResult,
  CommandData,
  CompactionResult,
  ModelRef,
  NavigateTreeResult,
  NewSessionRequest,
  SessionStatsInfo,
  SetToolsResult,
  SlashCommandInfo,
  ToolInfo,
  ToolPreset,
} from '@ice-ai/protocol';
import { getJson, http, postCommand } from '../http';

/**
 * agent 运行时域端点（docs/02 §4 / §6.1）。
 * 路由字面量归 client 持有（protocol 不导出路径常量，docs/02 §3「不养期货」）。
 */

/** POST /api/agent/new —— 新建会话；成功信封带 sessionId/model 扩展字段（docs/02 §4.1） */
export async function newAgentSession(
  body: NewSessionRequest,
): Promise<{ sessionId: string; model: ModelRef | null }> {
  const res = await http.post<{
    success: true;
    data: null;
    sessionId: string;
    model: ModelRef | null;
  }>('/agent/new', body);
  return { sessionId: res.data.sessionId, model: res.data.model };
}

/** SSE 事件流地址（EventSource 用；浏览器同源，无需凭据） */
export function agentEventsUrl(sessionId: string): string {
  return `/api/agent/${encodeURIComponent(sessionId)}/events`;
}

/** POST /api/agent/:id —— 发送任意命令（24 条，AgentCommand 判别联合） */
export function sendAgentCommand<K extends AgentCommand['type']>(
  sessionId: string,
  command: Extract<AgentCommand, { type: K }>,
): Promise<CommandData<K>> {
  return postCommand<CommandData<K>>(`/agent/${encodeURIComponent(sessionId)}`, command);
}

/** POST /api/agent/:id/resume —— 冷会话恢复（ADR-0013：显式拉起，SSE 才不会 404） */
export async function resumeAgentSession(sessionId: string): Promise<void> {
  await postCommand<null>(`/agent/${encodeURIComponent(sessionId)}/resume`);
}

/** POST /api/agent/:id/lease —— 续 lease（推迟 idle 回收，G2-12）；renewed=false 表示会话已不在注册表 */
export async function renewAgentLease(sessionId: string): Promise<{ renewed: boolean }> {
  return postCommand<{ renewed: boolean }>(`/agent/${encodeURIComponent(sessionId)}/lease`);
}

/** GET /api/agent/:id —— 状态轻查（不进命令 FIFO；run 期间轮询用它，docs/02 §6.1） */
export function getAgentRunningState(sessionId: string): Promise<AgentRunningState> {
  return getJson<AgentRunningState>(`/agent/${encodeURIComponent(sessionId)}`);
}

// ---------------------------------------------------------------------------
// F5 命令族：斜杠命令 / 工具 / 压缩 / 命名 / 分支 / 扩展 UI 应答
// ---------------------------------------------------------------------------

/** get_commands —— 斜杠命令清单（扩展 / prompt 模板 / skill 三类来源） */
export function getAgentCommands(sessionId: string): Promise<SlashCommandInfo[]> {
  return sendAgentCommand(sessionId, { type: 'get_commands' }).then((result) => result.commands);
}

/** get_tools —— 工具清单（`active` 由服务端按当前激活工具集标注） */
export function getAgentTools(sessionId: string): Promise<ToolInfo[]> {
  return sendAgentCommand(sessionId, { type: 'get_tools' });
}

/** set_tools —— 预设切换（运行中走 switch；冷会话重建 runtime） */
export function setAgentTools(sessionId: string, preset: ToolPreset): Promise<SetToolsResult> {
  return sendAgentCommand(sessionId, { type: 'set_tools', preset });
}

/** get_session_stats —— token / cost / 性能统计（冷会话 perf 为 undefined） */
export function getAgentStats(sessionId: string): Promise<SessionStatsInfo> {
  return sendAgentCommand(sessionId, { type: 'get_session_stats' });
}

/** compact —— 手动压缩上下文（customInstructions 可给压缩提示） */
export function compactAgent(
  sessionId: string,
  customInstructions?: string,
): Promise<CompactionResult> {
  return sendAgentCommand(
    sessionId,
    customInstructions === undefined
      ? { type: 'compact' }
      : { type: 'compact', customInstructions },
  );
}

export function abortAgentCompaction(sessionId: string): Promise<null> {
  return sendAgentCommand(sessionId, { type: 'abort_compaction' });
}

/** set_session_name —— 运行中会话改名（历史会话走 PATCH /api/sessions/:id） */
export function setAgentSessionName(sessionId: string, name: string): Promise<null> {
  return sendAgentCommand(sessionId, { type: 'set_session_name', name });
}

/** steer —— 插队消息（当前轮内尽快处理）；follow_up —— 收尾后追问 */
export function steerAgent(sessionId: string, message: string): Promise<null> {
  return sendAgentCommand(sessionId, { type: 'steer', message });
}

export function followUpAgent(sessionId: string, message: string): Promise<null> {
  return sendAgentCommand(sessionId, { type: 'follow_up', message });
}

export function clearAgentQueue(sessionId: string): Promise<ClearQueueResult> {
  return sendAgentCommand(sessionId, { type: 'clear_queue' });
}

/** navigate_tree —— 在同一会话文件内切换叶节点（id 不变） */
export function navigateAgentTree(
  sessionId: string,
  targetId: string,
  options: { summarize?: boolean; label?: string } = {},
): Promise<NavigateTreeResult> {
  return sendAgentCommand(sessionId, {
    type: 'navigate_tree',
    targetId,
    ...(options.summarize === undefined ? {} : { summarize: options.summarize }),
    ...(options.label === undefined ? {} : { label: options.label }),
  });
}

/** fork —— **破坏性原地替换**：返回新 sessionId 后旧 id 立即失效（docs/01 §8-1） */
export function forkAgentSession(sessionId: string, entryId: string): Promise<BranchResult> {
  return sendAgentCommand(sessionId, { type: 'fork', entryId });
}

export function forkAgentBranch(sessionId: string, entryId: string): Promise<BranchResult> {
  return sendAgentCommand(sessionId, { type: 'fork_branch', entryId });
}

export function cloneAgentSession(sessionId: string, leafId?: string): Promise<BranchResult> {
  return sendAgentCommand(
    sessionId,
    leafId === undefined ? { type: 'clone' } : { type: 'clone', leafId },
  );
}

/** extension_ui_response —— 应答扩展 UI 的阻塞型请求（ADR-0012） */
export function respondAgentExtensionUi(
  sessionId: string,
  id: string,
  response: { value?: string; confirmed?: boolean; cancelled?: true },
): Promise<null> {
  return sendAgentCommand(sessionId, { type: 'extension_ui_response', id, ...response });
}

/** GET /api/agent/:id —— 轻查（不进 FIFO）；running 时拿完整 AgentState（含 systemPrompt） */
export async function getAgentStateLight(sessionId: string): Promise<AgentState | null> {
  const state = await getAgentRunningState(sessionId);
  return state.running ? state.state : null;
}
