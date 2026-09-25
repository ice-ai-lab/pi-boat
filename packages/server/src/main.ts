#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import {
  AgentSessionService,
  ConfigService,
  LivenessRegistry,
  ProjectReadService,
  ProjectResolver,
  ResourceService,
  SessionReadService,
  SystemService,
} from '@ice-ai/core';
import { PORTS } from '@ice-ai/protocol';
import { createAgentServer } from './server';
import { activeStreamCount, closeAllAgentEventStreams } from './sse';

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
const configService = new ConfigService();
// 路径闸门与只读服务共用同一 resolver：cwd/validate 与 worktrees 的项目键必须
// 与会话列表的分组键一致（ADR-0008），否则前端按 projectKey 过滤会漏
const systemService = new SystemService({ resolver });

// apps/web/dist：src 与 dist 同深度（packages/server/<dir> → 仓库根的 apps/web/dist）
const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../..', 'apps/web/dist');

// agentDir 由 core 自己解析（server 不得 import pi SDK，AGENTS 依赖铁律）
const resourceService = new ResourceService();
// idle 回收：判据 = 没有观看者（lease 过期且无 SSE 订阅）且没有在跑（B7 / G2-12）
const liveness = new LivenessRegistry({
  agentService,
  subscriberCount: (id) => activeStreamCount(id),
  onReap: (id) => agentService.disposeSession(id, 'idle'),
});
liveness.start();

const app = createAgentServer({
  agentService,
  readService,
  projectService,
  configService,
  systemService,
  resourceService,
  liveness,
  staticRoot: existsSync(webDist) ? webDist : undefined,
});

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  // stdout 就绪信号（Electron 健康检查依赖，docs/01 §5.2.1）
  console.log(`[piboat-server] listening on http://${info.address}:${info.port}`);
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
  liveness.stop();
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
