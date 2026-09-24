import type { PushService } from '@ice-ai/core';
import { type CommandError, PushSubscribeRequestSchema } from '@ice-ai/protocol';
import type { Hono } from 'hono';
import { firstIssueMessage } from '../envelope';

/**
 * 推送路由（docs/02 §7；G2-13）。
 *
 * 两条端点都**不需要** `web-push` 在场：`/config` 会如实回 `enabled:false`，
 * 前端据此隐藏开关；`/subscribe` 照常落盘（订阅是客户端侧的能力声明，与
 * 服务端有没有投递能力无关——先收着，装上依赖就能用）。
 */
export interface PushRouteDeps {
  pushService: PushService;
}

export function registerPushRoutes(app: Hono, deps: PushRouteDeps): void {
  const { pushService } = deps;

  app.get('/api/push/config', async (c) => c.json(await pushService.config()));

  app.post('/api/push/subscribe', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = PushSubscribeRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const created = pushService.subscribe(parsed.data);
    return c.json({ success: true, created });
  });
}
