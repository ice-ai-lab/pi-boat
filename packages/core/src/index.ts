/**
 * @ice-ai/core —— Agent 业务核心，全仓唯一允许依赖 pi-coding-agent SDK 的包。
 * 传输无关：不得引入任何 HTTP 概念（为 Electron 进程内直连留路，docs/01 §3.1）。
 *
 * M1 已落地模块（docs/01-overview.md §3.1 / docs/02 §11）：
 *   - events/to-client-agent-event  SDK 事件 → wire 事件投影（防腐层）
 *   - agent/SessionRegistryEntry    会话注册表单元：委托订阅 / seq / 快照跟踪
 *   - agent/AgentSessionService     命令分发 + 新建会话 + late-join 事件总线
 *   - read/SessionReadService       .jsonl 只读浏览：列表/详情/分页/改名
 *
 * 待落地（按里程碑）：
 *   - M2：分支/压缩/模型组命令（fork 原地替换语义，§8-1）、扩展 UI 通道、
 *     set_tools 冷会话重建路径、ConfigService
 *   - M3：SystemService（文件树/git worktree）、idle 回收与 lease
 */

export {
  AgentSessionService,
  type CreateSessionFn,
  type NewSessionInput,
  PromptRejectedError,
  SessionNotFoundError,
} from './agent/agent-session-service';
export {
  type ClientAgentEventListener,
  SessionRegistryEntry,
  type WireEventInput,
} from './agent/session-entry';
export {
  isDroppedEvent,
  projectAgentSessionEvent,
  toClientAgentEvent,
} from './events/to-client-agent-event';
export {
  computeStats,
  type SessionReadOptions,
  SessionReadService,
} from './read/session-read-service';
