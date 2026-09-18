import { type HealthResponse, PORTS } from '@pi-boat/protocol';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

/** 开发期 CORS 白名单只放行 web dev server（docs/01-overview.md §5.2.2） */
const DEV_WEB_ORIGIN = `http://localhost:${PORTS.web}`;

export function createAgentServer() {
  const app = new Hono();

  app.use('/api/*', cors({ origin: [DEV_WEB_ORIGIN] }));

  app.get('/api/health', (c) => {
    const body: HealthResponse = { ok: true, name: 'piboat-server' };
    return c.json(body);
  });

  // M1：/api/sessions · /api/agent/:id（命令）· /api/agent/:id/events（SSE）…
  return app;
}
