/**
 * @ice-ai/server —— HTTP/SSE 服务，组装 core（路由即 protocol 的实现层）。
 * M1 已落地（docs/04-server-design.md）：
 *   - server.ts      DI 装配（createAgentServer：双 core 服务注入 + CORS + 安全 + 静态托管）
 *   - security.ts    本机访问防护：Host / Origin / Sec-Fetch-Site 三闸常开（ADR-0007）
 *   - sse.ts         Agent 事件流 SSE 传输层（时序/帧/心跳/六关流路径/关停硬断注册表）
 *   - routes/agent   new / 命令通道 / 轻查 / running 轮询 / events（SSE）
 *   - routes/sessions 列表（projectKey/force）/搜索/详情/state/改名/级联删除/历史分页
 *   - routes/projects 项目清单（会话目录分组视图，ADR-0008）
 *   - main.ts        启动序列（core → 路由 → listen）+ SIGINT/SIGTERM 优雅退出
 * M2+：models/auth/files/git/resources 域、lease
 */

export { securityMiddleware } from './security';
export { type AgentServerDeps, createAgentServer } from './server';
export { closeAllAgentEventStreams } from './sse';
