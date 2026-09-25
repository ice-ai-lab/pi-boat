/**
 * @ice-ai/client/react —— React 绑定子入口（docs/05 §7）。
 * F1（对话 MVP）填充：AgentStream 的 useSyncExternalStore 订阅、use-agent-session 编排、
 * TanStack Query hooks + queryKeys 工厂。
 * 铁律：主入口（../index.ts）不得 import React（docs/05 §1 边界 1——主入口要在
 * Electron 主进程 / Node / vitest 里跑）；本入口不引入任何 DOM 渲染逻辑。
 */
export {};
