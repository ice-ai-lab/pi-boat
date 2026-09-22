/**
 * @ice-ai/protocol —— 前后端唯一契约：REST 请求/响应类型、事件 wire 格式
 * （WireAgentEvent）与领域类型。纯类型 + Zod schema，零业务逻辑。
 * 详见 docs/01-overview.md §3.1、实施清单 docs/02-protocol-inventory.md。
 */

export * from './commands/agent-command';
export * from './constants';
export * from './domain/index';
export * from './envelope';
export * from './events/wire-agent-event';
export * from './rest/agent';
export * from './rest/misc';
export * from './rest/sessions';
// M2 追加：commands 分支/压缩/模型组 + rest/models + rest/auth
// M3 追加：rest/files + rest/git + rest/resources + lease/push
// 注：终端（PTY/TerminalEvent，docs/02 §5.3/§6.8）暂不支持，已从协议移除（2026-01 决策）
