/**
 * @ice-ai/server —— HTTP/SSE 服务，组装 core（路由即 protocol 的实现层）。
 * M0 骨架：健康检查 + CORS 白名单 + 127.0.0.1 绑定。
 * M1 计划：/api/sessions、/api/agent/:id 命令通道、/api/agent/:id/events SSE 事件流、
 * 静态托管 web 构建产物（docs/01-overview.md §3.1、§5.2、§10）。
 */
export { createAgentServer } from './server.js';
