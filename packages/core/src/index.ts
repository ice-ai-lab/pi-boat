/**
 * @pi-boat/core —— Agent 业务核心，全仓唯一允许依赖 pi-coding-agent SDK 的包。
 * 传输无关：不得引入任何 HTTP 概念（为 Electron 进程内直连留路，docs/01 §3.1）。
 *
 * M1 计划模块（docs/01-overview.md §3.1）：
 *   - AgentSessionService  会话注册表 / 生命周期 / 事件总线 / fork·branch
 *   - SessionReadService   基于 SessionManager 的只读浏览
 *   - SystemService        allowed-roots / 文件树 / PTY / git worktree
 *   - ConfigService        models.json / providers / skills / plugins
 *   - toClientAgentEvent() SDK 事件 → wire 事件投影（防腐层）
 */
export const CORE_READY = true;
