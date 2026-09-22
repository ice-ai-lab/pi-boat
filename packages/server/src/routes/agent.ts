import type { AgentSessionService } from '@ice-ai/core';
import {
  type AgentCommand,
  AgentCommandSchema,
  type CommandError,
  type CommandOk,
  NewSessionRequestSchema,
  type RunningSessionsResponse,
} from '@ice-ai/protocol';
import type { Hono } from 'hono';
import { firstIssueMessage, mapCoreError } from '../envelope';
import { createAgentEventStream, SSE_HEADERS } from '../sse';

/**
 * agent 运行时域路由（docs/04 §3 M1 路由总表上半）。
 * 注册顺序敏感：字面量段（new / running）必须在参数段（/:id）之前。
 */

/** M1 命令子集的 type 字面量（未知 type → 400，区别于 404，docs/04 §4.2）；
 *  Set<string>：入参是未校验的原始 body，不能拿字面量联合当守卫 */
const COMMAND_TYPES = new Set<string>(
  AgentCommandSchema.options.map((option) => option.shape.type.value),
);

export interface AgentRouteDeps {
  agentService: AgentSessionService;
}

export function registerAgentRoutes(app: Hono, deps: AgentRouteDeps): void {
  const { agentService } = deps;

  // POST /api/agent/new —— 新建会话（docs/02 §4.1）：NewSessionOk 扩展信封；
  // 首条消息被拒时会话保留、错误上抛（core 语义，docs/03）
  app.post('/api/agent/new', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = NewSessionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      return c.json(await agentService.create(parsed.data));
    } catch (error) {
      const { status, body } = mapCoreError(error);
      return c.json(body, status);
    }
  });

  // GET /api/agent/running —— 可见 Tab 池轻量轮询（先于 /:id 注册）
  app.get('/api/agent/running', (c) => {
    const body: RunningSessionsResponse = {
      registryVersion: agentService.registryVersion,
      runningSessionIds: agentService.runningSessionIds(),
      // M1 恒 []：轮询刷新期间的重复通知抑制是前端多 Tab 语义，M2 再接
      completionNotificationSuppressedSessionIds: [],
    };
    return c.json(body);
  });

  // GET /api/agent/:id —— 单会话状态轻查：直读注册表、不进命令 FIFO
  // （get_state 命令会与运行中的 prompt 串行排队，轮询实时状态必须走本端点，docs/02 §6.1）
  app.get('/api/agent/:id', (c) => c.json(agentService.getRunningState(c.req.param('id'))));

  // POST /api/agent/:id —— 命令通道（AgentCommand 判别联合 → CommandEnvelope）
  app.post('/api/agent/:id', async (c) => {
    const id = c.req.param('id');
    const raw = await c.req.json().catch(() => null);
    if (
      raw === null ||
      typeof raw !== 'object' ||
      typeof (raw as { type?: unknown }).type !== 'string' ||
      !COMMAND_TYPES.has((raw as { type: string }).type)
    ) {
      return c.json<CommandError>({ error: 'Unknown or missing command type' }, 400);
    }
    const parsed = AgentCommandSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      // 显式联合 T：parsed.data 是整个判别联合，Extract<T> 分配后即原联合
      const data = await agentService.send<AgentCommand['type']>(id, parsed.data);
      return c.json<CommandOk<unknown>>({ success: true, data });
    } catch (error) {
      const { status, body } = mapCoreError(error);
      return c.json(body, status);
    }
  });

  // GET /api/agent/:id/events —— SSE 事件流（sse.ts 六关流路径）
  app.get('/api/agent/:id/events', (c) => {
    const id = c.req.param('id');
    // 关闭条件 3：冷会话不自动拉起（恢复语义归 M2，不照抄 pi-web startRpcSession）
    if (!agentService.isRunning(id)) {
      return c.json<CommandError>({ error: `Session not found: ${id}` }, 404);
    }
    // Last-Event-ID：M1 降级忽略（sse.ts 头注）——重连 = connected + 快照整体重建
    const stream = createAgentEventStream(c.req.raw, id, agentService);
    return new Response(stream, { headers: SSE_HEADERS });
  });
}
