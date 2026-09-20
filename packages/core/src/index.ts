/**
 * @ice-ai/core —— Agent 业务核心，全仓唯一允许依赖 pi-coding-agent SDK 的包。
 *
 * 为什么存在：pi SDK 是单会话、进程内的库——没有多会话寻址与生命周期管理、
 * 没有可序列化的事件契约、没有断线重连/多端观看语义。core 在 SDK 之上补齐
 * 这三层，并以传输无关的服务接口暴露（不引入任何 HTTP 概念，为 Electron
 * 进程内直连留路，docs/01 §3.1）。
 *
 * 相对 SDK 新增的能力：
 * - 多会话注册表与生命周期（create/dispose/listVersion 轻量轮询）
 * - SDK 事件/消息 → wire JSON 投影（防腐层：SDK 字段变动不出 core）
 * - 会话级单调 seq + late join 快照时序（断线重连与多端观看，docs/01 §5.4）
 * - 统一命令通道（AgentCommand 判别联合分发 + 同会话 FIFO 串行 + 类型化错误）
 * - .jsonl 只读浏览（列表/详情/分页/搜索/改名，与 pi CLI 天然互见）
 *
 * M1 已落地模块（docs/01-overview.md §3.1 / docs/02 §11）：
 *   - events/to-wire-agent-event  SDK 事件 → wire 事件投影（防腐层）
 *   - events/wire-message           SDK 消息 → wire 消息投影（readonly 剥离）
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
  PromptRejectedError,
  SessionNotFoundError,
} from './agent/agent-session-service';
export {
  type WireAgentEventListener,
  SessionRegistryEntry,
} from './agent/session-entry';
export {
  type WireAgentEventPayload,
  toWireAgentEvent,
  toWireAgentEventPayload,
} from './events/to-wire-agent-event';
export {
  computeStats,
  type SessionReadOptions,
  SessionReadService,
} from './read/session-read-service';
