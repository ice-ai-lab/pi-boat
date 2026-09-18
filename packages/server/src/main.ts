#!/usr/bin/env node
import { serve } from '@hono/node-server';

import { createAgentServer } from './server.js';

const DEFAULT_PORT = 30142;

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const app = createAgentServer();

serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  // stdout 就绪信号（Electron 健康检查依赖，docs/01 §5.2.1）
  console.log(`[piboat-server] listening on http://${info.address}:${info.port}`);
});
