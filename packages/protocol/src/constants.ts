import { z } from 'zod';

/**
 * 协议形状版本号。REST 路由与 wire 事件的字段一旦定稿即是对前端的承诺，
 * 破坏性变更须 bump（docs/02 §1.3 铁律 5），并跑事件快照回归。
 * 非运行时协商机制：server 与 web 同源同发，形状不匹配在编译期由 TS 拦截；
 * 版本号用于审计 bump 纪律与诊断（如桌面端内置资产与服务端不同步）。
 */
export const PROTOCOL_VERSION = 1;

/**
 * 服务端口约定的单一来源，代码/文档一律引用此处。
 * server 可被 PORT 环境变量覆盖（docs/01 §5.2）。
 */
export const PORTS = {
  /** agent server：API/SSE，生产同端口托管 web 静态产物 */
  server: 9527,
  /** web dev server：仅开发期（vite dev），浏览器经 CORS 直连 server */
  web: 9528,
} as const;

/**
 * 思考档位枚举。
 * 须与 pi-coding-agent 0.85.x 的 ThinkingLevel 保持一致；SDK 升级时核对（AGENTS.md）。
 */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export const ThinkingLevelSchema = z.enum(THINKING_LEVELS);
export type ThinkingLevel = z.infer<typeof ThinkingLevelSchema>;

/**
 * 协议错误码，集中定义避免字符串散落。按需增长。
 * prompt_rejected：prompt 输入被拒（区别于运行失败），随 accepted:false 一并下发。
 */
export const ERROR_CODES = ['prompt_rejected'] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
