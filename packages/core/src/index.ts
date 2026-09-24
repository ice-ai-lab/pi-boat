/**
 * @ice-ai/core —— Agent 业务核心，全仓唯一允许依赖 pi-coding-agent SDK 的包。
 *
 * 为什么存在：pi SDK 是单会话、进程内的库——没有多会话寻址与生命周期管理、
 * 没有可序列化的事件契约、没有断线重连/多端观看语义。core 在 SDK 之上补齐
 * 这三层，并以传输无关的服务接口暴露（不引入任何 HTTP 概念，为 Electron
 * 进程内直连留路，docs/01 §3.1）。
 *
 * 相对 SDK 新增的能力：
 * - 多会话注册表与生命周期（create/dispose/registryVersion 轻量轮询）
 * - SDK 事件/消息 → wire JSON 投影（防腐层：SDK 字段变动不出 core）
 * - 会话级单调 seq + late join 快照时序（断线重连与多端观看，docs/01 §5.4）
 * - 统一命令通道（AgentCommand 判别联合分发 + 同会话 FIFO 串行 + 类型化错误）
 * - .jsonl 只读浏览（列表/详情/分页/搜索/改名，与 pi CLI 天然互见）
 *
 * 一期已落地模块（docs/03 §2 模块地图 / docs/07 §6 B1–B7）：
 *   - events/wire-event + wire-message   SDK 事件/消息 → wire 投影（防腐层）
 *   - agent/AgentSessionService + SessionRegistryEntry  注册表 / 命令分发 / runtime 替换
 *   - agent/ExtensionUiBridge            扩展 UI 双向通道（ADR-0012）
 *   - agent/LivenessRegistry + PushService  lease + idle 回收 + 完成通知投递
 *   - agent/session-tool-selection       工具预设持久化（custom 条目）
 *   - agent/exact-system-prompt          精确系统提示词覆写
 *   - read/SessionReadService            .jsonl 只读浏览：列表/搜索/详情/分页/导出/改名/删除/指纹
 *   - read/ProjectResolver + ProjectReadService  项目归一与清单（ADR-0008）
 *   - config/ConfigService + model-scope + models-config-store  模型域（ADR-0011）
 *   - resources/ResourceService          skills / plugins / 工具设置 / 项目信任
 *   - system/SystemService + PathGuard   文件系统 / git / worktree（allowed-roots 唯一实现）
 *
 * 下一步不在本包：前端（client / ui / web）尚未开工（docs/01 §7.1）。
 */

export {
  AgentSessionService,
  type AgentSessionServiceOptions,
  type CreateRuntimeFn,
  type CreateRuntimeInput,
  defaultCreateRuntime,
  PromptRejectedError,
  SessionBusyError,
  SessionNotFoundError,
  UserInputError,
} from './agent/agent-session-service';
export { createExactSystemPromptExtension } from './agent/exact-system-prompt';
export {
  DEFAULT_UI_TIMEOUT_MS,
  ExtensionUiBridge,
} from './agent/extension-ui-bridge';
export {
  buildCompletionNotification,
  DEFAULT_LEASE_TTL_MS,
  DEFAULT_REAP_INTERVAL_MS,
  type LivenessOptions,
  LivenessRegistry,
  PushService,
  type PushServiceOptions,
} from './agent/liveness';
export {
  SessionRegistryEntry,
  type WireAgentEventListener,
} from './agent/session-entry';
export {
  clearedToolSelection,
  readSessionToolSelection,
  TOOL_SELECTION_CUSTOM_TYPE,
  writeToolSelection,
} from './agent/session-tool-selection';
export {
  ConfigService,
  type ConfigServiceOptions,
  InvalidScopeEditError,
  ProjectShadowedError,
} from './config/config-service';
export {
  LastModelRejectionError,
  modelKey,
  parsePattern,
  prunePatterns,
  resolveVisibleModels,
  resyncPatterns,
  toggleModelInPatterns,
  type VisibleScope,
} from './config/model-scope';
export {
  ModelsConfigReadError,
  modelsConfigPath,
  normalizeModelsConfigCosts,
  readModelsConfig,
  writeModelsConfig,
} from './config/models-config-store';
export {
  toWireAgentEvent,
  toWireAgentEventPayload,
  type WireAgentEventPayload,
} from './events/wire-event';
export {
  type ProjectReadOptions,
  ProjectReadService,
} from './read/project-read-service';
export {
  type ProjectResolution,
  ProjectResolver,
  type ProjectResolverLike,
  projectKeyOf,
} from './read/project-resolver';
export {
  computeStats,
  type SessionListOptions,
  type SessionReadOptions,
  SessionReadService,
} from './read/session-read-service';
export {
  isPowerShellEnabled,
  ResourceService,
  type ResourceServiceOptions,
  replaceShellTool,
  SkillInstallError,
  setDisableModelInvocation,
  sourceType,
} from './resources/resource-service';
export {
  globalSettingsPath,
  projectSettingsPath,
  readSettingsObject,
  SettingsWriteError,
  updateSettingsObject,
} from './resources/settings-file';
export {
  displayPath,
  expandTilde,
  IGNORED_DIRECTORY_NAMES,
  isInsideRoot,
  isSensitivePath,
  type PathDecision,
  PathGuard,
  samePath,
} from './system/path-guard';
export {
  SystemAccessError,
  SystemService,
  type SystemServiceOptions,
  UserInputErrorLite,
} from './system/system-service';
