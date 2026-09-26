import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type {
  AgentSessionService,
  ConfigService,
  LivenessRegistry,
  ProjectReadService,
  ResourceService,
  SessionReadService,
  SystemService,
} from '@ice-ai/core';
import { PI_VERSION } from '@ice-ai/core';
import type { HealthResponse } from '@ice-ai/protocol';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { registerAgentRoutes } from './routes/agent';
import { registerModelRoutes } from './routes/models';
import { registerProjectRoutes } from './routes/projects';
import { registerResourceRoutes } from './routes/resources';
import { registerSessionRoutes } from './routes/sessions';
import { registerSystemRoutes } from './routes/system';
import { DEV_WEB_ORIGINS, securityMiddleware } from './security';

/**
 * DI 装配（docs/04 §2）：core 服务由 main 构造传入，路由层不直接 new
 * （测试可注入 fake）。安全层三道闸常开，无凭据参数（ADR-0007）。
 */
export interface AgentServerDeps {
  agentService: AgentSessionService;
  readService: SessionReadService;
  projectService: ProjectReadService;
  configService: ConfigService;
  systemService: SystemService;
  resourceService: ResourceService;
  /** liveness lease 注册表（缺省不接线：测试可省） */
  liveness?: LivenessRegistry;
  /** 生产静态托管目录（apps/web/dist 的绝对路径）；缺省不托管（dev 页面来自 vite 9528） */
  staticRoot?: string;
}

export function createAgentServer(deps: AgentServerDeps): Hono {
  const app = new Hono();

  // cors 在前：被安全层拒绝的响应（403）也带白名单 CORS 头，dev 前端可读错误体。
  // 白名单与 security.ts 的 Origin 校验同源（单一来源，docs/01 §5.2.2）
  app.use('/api/*', cors({ origin: DEV_WEB_ORIGINS }));
  app.use('/api/*', securityMiddleware());

  app.get('/api/health', (c) => {
    const body: HealthResponse = { ok: true, name: 'piboat-server', piVersion: PI_VERSION };
    return c.json(body);
  });

  registerAgentRoutes(app, { agentService: deps.agentService, liveness: deps.liveness });
  registerSessionRoutes(app, { agentService: deps.agentService, readService: deps.readService });
  registerProjectRoutes(app, { projectService: deps.projectService });
  registerModelRoutes(app, { configService: deps.configService });
  registerSystemRoutes(app, { systemService: deps.systemService, readService: deps.readService });
  registerResourceRoutes(app, {
    resourceService: deps.resourceService,
    agentService: deps.agentService,
    readService: deps.readService,
  });

  // 静态托管（docs/04 §7 生产形态）：apps/web/dist + SPA fallback，单进程即完整产品。
  // serveStatic 的 root 按 join(root, path) 解析，绝对路径可直接用
  if (deps.staticRoot !== undefined) {
    app.use('*', serveStatic({ root: deps.staticRoot }));
    // SPA fallback：静态文件未命中且非 /api 的 GET 回 index.html（客户端路由）
    const indexHtml = readFileSync(join(deps.staticRoot, 'index.html'));
    app.get('*', (c) => c.body(indexHtml, 200, { 'Content-Type': 'text/html; charset=utf-8' }));
  }
  return app;
}
