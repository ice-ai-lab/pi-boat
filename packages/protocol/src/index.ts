/**
 * @ice-ai/protocol —— 前后端唯一契约：REST 请求/响应类型、事件 wire 格式
 * （WireAgentEvent）与领域类型。领域形状复用 SDK 公开导出（ADR-0017），
 * Zod 只用于 HTTP 入参校验；零业务逻辑。
 * 详见 docs/01-overview.md §3.1、实施清单 docs/02-protocol-inventory.md。
 */

export * from './commands/agent-command';
export * from './constants';
export * from './domain/index';
export * from './envelope';
export * from './events/wire-agent-event';
export * from './rest/agent';
export * from './rest/files';
export * from './rest/git';
export * from './rest/misc';
export * from './rest/models';
export * from './rest/projects';
export * from './rest/resources';
export * from './rest/sessions';
// 注：终端（PTY/TerminalEvent，docs/02 §5.3/§6.8）暂不支持，已从协议移除（2026-01 决策）
