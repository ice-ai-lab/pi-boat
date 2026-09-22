#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import {
  AgentSessionService,
  ProjectReadService,
  ProjectResolver,
  SessionReadService,
} from '@ice-ai/core';
import { PORTS } from '@ice-ai/protocol';
import { createAgentServer } from './server';
import { closeAllAgentEventStreams } from './sse';

/**
 * 启动序列（docs/04 §2）：读配置 → 实例化 core → 组装路由 → listen。
 * 环境变量：PORT 覆盖端口。安全层无凭据参数（Host/Origin/Sec-Fetch-Site 三闸常开，ADR-0007）。
 */
const port = Number(process.env.PORT ?? PORTS.server);

const agentService = new AgentSessionService();
// 同一 resolver 实例传给两个只读服务：列表 enrich 与项目清单的 projectKey 按构造一致
// （ADR-0008：前端分组与 ?projectKey 过滤不错位）
const resolver = new ProjectResolver();
const readService = new SessionReadService({
  isRunning: (id) => agentService.isRunning(id),
  resolver,
});
const projectService = new ProjectReadService({ resolver });

// apps/web/dist：src 与 dist 同深度（packages/server/<dir> → 仓库根的 apps/web/dist）
const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../..', 'apps/web/dist');

const app = createAgentServer({
  agentService,
  readService,
  projectService,
  staticRoot: existsSync(webDist) ? webDist : undefined,
});

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  // stdout 就绪信号（Electron 健康检查依赖，docs/01 §5.2.1）
  console.log(`[piboat-server] listening on http://${info.address}:${info.port}`);
});

/**
 * 启动失败要能读懂（2026-09-22）：`serve()` 抛出的 EADDRINUSE 默认只给一段
 * "Unhandled 'error' event" 堆栈，而 dev 期最容易踩的就是**上一轮残留的进程还占着端口**
 * （turbo/tsx 被杀时不保证子进程退出：tsx 自己会打 “Previous process hasn't exited yet”）。
 * 那一堆堆栈会被包在启动日志里、看起来像随机报错，所以这里换成一条能照着做的提示。
 */
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[piboat-server] 端口 ${port} 已被占用：多半还有一个 piboat-server / tsx watch 在跑。\n` +
        `  查看占用者：lsof -nP -iTCP:${port} -sTCP:LISTEN\n` +
        `  处理：kill 掉该进程，或用 PORT=<其他端口> 启动。`,
    );
  } else {
    console.error(`[piboat-server] 启动失败：${error.message}`);
  }
  process.exit(1);
});

/**
 * 优雅退出（docs/04 §2）：SIGINT/SIGTERM → disposeAll（core 广播 session_shutdown，
 * 尽力冲刷）→ 硬断全部 SSE（§5.4：graceful close 可能被响应管道吞掉，socket 保持
 * ESTABLISHED、server.close() 永不完成、进程变僵尸）→ 进程退出。
 */
const SHUTDOWN_FLUSH_MS = 100;
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[piboat-server] ${signal} received, shutting down…`);
  agentService.disposeAll('server_shutdown');
  // 给 session_shutdown 帧一个冲刷窗口，再硬断剩余流
  setTimeout(() => {
    closeAllAgentEventStreams();
    server.close(() => process.exit(0));
    // server.close 可能因残留句柄挂起：兜底退出
    setTimeout(() => process.exit(0), 2000);
  }, SHUTDOWN_FLUSH_MS);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
