/**
 * @ice-ai/protocol —— 前后端唯一契约：REST 请求/响应类型、事件 wire 格式
 * （ClientAgentEvent）与领域类型。纯类型 + Zod schema，零业务逻辑。
 * 详见 docs/01-overview.md §3.1、实施清单 docs/02-protocol-inventory.md。
 */
export * from './constants.js';
export * from './envelope.js';
export * from './rest/misc.js';
// 后续按 docs/02 §10 目录结构逐部追加：domain/* → commands → events → rest/*
