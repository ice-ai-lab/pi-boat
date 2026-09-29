import { existsSync } from 'node:fs';
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
import { createAgentServer } from './server';
import { activeStreamCount, closeAllAgentEventStreams } from './sse';

/**
 * 可复用的启动序列（docs/04 §2）：实例化 core → 组装路由 → listen → 优雅退出。
 *
 * 从 main.ts 提取，供两条入口共用：仓库内开发/生产用的 `piboat-server`（main.ts），
 * 以及 npm 分发包 `@ice-ai/pi-boat` 的 `piboat` CLI（它自带 web 静态产物，必须显式
 * 传入 staticRoot，不能靠仓库布局推导）。
 * 安全层无凭据参数（Host/Origin/Sec-Fetch-Site 三闸常开，ADR-0007）。
 */
export interface StartPiboatServerOptions {
  /** 监听端口（调用方决定默认值，通常取 protocol 的 PORTS.server） */
  port: number;
  /** 生产静态托管目录（含 index.html 的绝对路径）；缺省或不存在则不托管（dev 页面来自 vite） */
  staticRoot?: string;
  /** listen 就绪回调（CLI 借此打印地址 / 拉起浏览器；Electron 可作健康信号） */
  onReady?: (url: string) => void;
}

export interface PiboatServerHandle {
  /** 实际监听端口（port 传 0 时由系统分配） */
  port: number;
  /** 优雅关停（幂等）：disposeAll → 硬断 SSE → server.close */
  close: () => void;
}

/** 优雅退出时给 session_shutdown 帧的冲刷窗口（docs/04 §2） */
const SHUTDOWN_FLUSH_MS = 100;

export function startPiboatServer(options: StartPiboatServerOptions): PiboatServerHandle {
  const agentService = new AgentSessionService();
  // 同一 resolver 实例传给两个只读服务：列表 enrich 与项目清单的 projectKey 按构造一致
  // （ADR-0008：前端分组与 ?projectKey 过滤不错位）
  const resolver = new ProjectResolver();
  const readService = new SessionReadService({ resolver });
  const projectService = new ProjectReadService({ resolver });
  const configService = new ConfigService();
  // 路径闸门与只读服务共用同一 resolver：cwd/validate 与 worktrees 的项目键必须
  // 与会话列表的分组键一致（ADR-0008），否则前端按 projectKey 过滤会漏
  const systemService = new SystemService({ resolver });
  // agentDir 由 core 自己解析（server 不得 import pi SDK，AGENTS 依赖铁律）
  const resourceService = new ResourceService();
  // idle 回收：判据 = 没有观看者（lease 过期且无 SSE 订阅）且没有在跑（B7 / G2-12）
  const liveness = new LivenessRegistry({
    agentService,
    subscriberCount: (id) => activeStreamCount(id),
    onReap: (id) => agentService.disposeSession(id, 'idle'),
  });
  liveness.start();

  const staticRoot =
    options.staticRoot !== undefined && existsSync(options.staticRoot)
      ? options.staticRoot
      : undefined;

  const app = createAgentServer({
    agentService,
    readService,
    projectService,
    configService,
    systemService,
    resourceService,
    liveness,
    staticRoot,
  });

  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: options.port }, (info) => {
    const url = `http://${info.address}:${info.port}`;
    // stdout 就绪信号（Electron 健康检查依赖，docs/01 §5.2.1）
    console.log(`[piboat-server] listening on ${url}`);
    options.onReady?.(url);
  });

  // 端口占用等 listen 失败：打印人话再以非零码退出，不甩 Node 堆栈（CLI 首屏体验）
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[piboat] port ${options.port} is already in use (set --port to pick another)`);
    } else {
      console.error('[piboat] server failed to start:', error);
    }
    process.exit(1);
  });

  let shuttingDown = false;
  function close(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    liveness.stop();
    agentService.disposeAll('server_shutdown');
    // 给 session_shutdown 帧一个冲刷窗口，再硬断剩余流
    // （§5.4：graceful close 可能被响应管道吞掉，socket 保持 ESTABLISHED、
    //  server.close() 永不完成、进程变僵尸）
    setTimeout(() => {
      closeAllAgentEventStreams();
      server.close(() => process.exit(0));
      // server.close 可能因残留句柄挂起：兜底退出
      setTimeout(() => process.exit(0), 2000);
    }, SHUTDOWN_FLUSH_MS);
  }

  process.on('SIGINT', () => {
    console.log('[piboat-server] SIGINT received, shutting down…');
    close();
  });
  process.on('SIGTERM', () => {
    console.log('[piboat-server] SIGTERM received, shutting down…');
    close();
  });

  return { port: options.port, close };
}
