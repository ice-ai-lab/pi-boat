import { stat } from 'node:fs/promises';
import {
  type ConfigService,
  InvalidScopeEditError,
  LastModelRejectionError,
  ModelsConfigReadError,
  ProjectShadowedError,
  UserInputError,
} from '@ice-ai/core';
import {
  ApiKeySetRequestSchema,
  type CommandError,
  ModelsCatalogQuerySchema,
  ModelsConfigDiscoverRequestSchema,
  ModelsConfigTestRequestSchema,
  ModelsConfigUpdateSchema,
  ModelsDefaultsUpdateSchema,
  ModelsEnabledUpdateSchema,
  ModelsQuerySchema,
  ModelsRefreshRequestSchema,
  ProviderUsageRequestSchema,
} from '@ice-ai/protocol';
import type { Hono } from 'hono';
import { firstIssueMessage } from '../envelope';

/**
 * 模型域路由（docs/02 §6.4；决策 ADR-0011）。
 *
 * 联网纪律：只有 discover / test / catalog / refresh 会联网——它们都是**用户显式
 * 点击**才到达的路径。其余端点（models / models-config / models/enabled）一律本地读。
 *
 * 新增路由检查清单（docs/04 §6）逐条对照：
 * ① 触碰文件系统 → models.json 与 auth.json 都在 `~/.pi/agent`（本服务自己的
 *    配置目录，不在 allowed-roots 的讨论范围内——那份清单管的是**用户的工程目录**）
 * ② 错误响应不泄漏路径 → ModelsConfigReadError 的 message 含路径，**不回传原文**，
 *    只回一句固定说明（真实原因进服务端日志）
 * ③ 新增 Origin / Sec-Fetch 例外 → 无
 * ④ 有副作用的 GET → 无（写 key 用 PUT，删 key 用 DELETE，查用量用 POST）
 *
 * 联网：discover / test / catalog / refresh / usage——都是**用户显式点击**才到达；
 * auth-providers 与 api-key 读写只碰本地（auth.json）。
 */

export interface ModelRouteDeps {
  configService: ConfigService;
}

export function registerModelRoutes(app: Hono, deps: ModelRouteDeps): void {
  const { configService } = deps;

  /** cwd 参数校验：必须存在且为目录（与 agent/new 同口径，docs/02 §4.1） */
  async function resolveCwd(raw: string | undefined): Promise<string | { error: string }> {
    const cwd = raw ?? process.cwd();
    try {
      if (!(await stat(cwd)).isDirectory()) return { error: `Not a directory: ${cwd}` };
    } catch {
      return { error: `Directory does not exist: ${cwd}` };
    }
    return cwd;
  }

  // GET /api/models?cwd —— 可见模型与思考档位（只读快照）
  app.get('/api/models', async (c) => {
    const parsed = ModelsQuerySchema.safeParse({ cwd: c.req.query('cwd') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const cwd = await resolveCwd(parsed.data.cwd);
    if (typeof cwd !== 'string') return c.json<CommandError>(cwd, 400);
    try {
      return c.json(await configService.models(cwd));
    } catch (error) {
      // 模型源崩了不该让面板 500：回一份空的 + error（前端据此显示诊断）
      console.error('[server] model load failed:', error);
      return c.json({
        models: {},
        modelList: [],
        defaultModel: null,
        defaultThinkingLevel: 'medium',
        thinkingLevelDefaults: {},
        thinkingLevels: {},
        thinkingLevelMaps: {},
        error: 'Failed to load model configuration',
      });
    }
  });

  // GET /api/models-config —— models.json 原文（宽容解析后的对象）
  app.get('/api/models-config', (c) => {
    try {
      return c.json(configService.readConfig());
    } catch (error) {
      if (error instanceof ModelsConfigReadError) {
        console.error('[server] models.json read failed:', error.message);
        return c.json<CommandError>(
          { error: 'models.json exists but could not be parsed; refusing to touch it' },
          422,
        );
      }
      throw error;
    }
  });

  // PUT /api/models-config —— 整份覆盖（面板保存）
  app.put('/api/models-config', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ModelsConfigUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      const { modelsPath } = configService.writeConfig(parsed.data.config);
      return c.json({ success: true, modelsPath });
    } catch (error) {
      if (error instanceof ModelsConfigReadError) {
        console.error('[server] refusing to overwrite unreadable models.json:', error.message);
        return c.json<CommandError>(
          { error: 'models.json could not be read; refusing to overwrite it' },
          422,
        );
      }
      throw error;
    }
  });

  // POST /api/models-config/discover —— 按 provider 的 /models 端点发现模型（联网）
  app.post('/api/models-config/discover', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ModelsConfigDiscoverRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await configService.discover(parsed.data));
  });

  // POST /api/models-config/test —— 真实补全请求测连通（联网）
  app.post('/api/models-config/test', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ModelsConfigTestRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await configService.testModel(parsed.data));
  });

  // GET /api/models-config/catalog?q —— models.dev 目录（服务端代理 + 1h 缓存）
  app.get('/api/models-config/catalog', async (c) => {
    const parsed = ModelsCatalogQuerySchema.safeParse({ q: c.req.query('q') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await configService.catalog(parsed.data.q));
  });

  // GET /api/models/auth-providers —— 可用 API Key 登录的 provider 清单（本地读）
  app.get('/api/models/auth-providers', async (c) => {
    return c.json(await configService.authProviders(c.req.query('cwd')));
  });

  // PUT /api/models/api-key —— 保存 API Key（写入 auth.json；不触发目录刷新）
  app.put('/api/models/api-key', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ApiKeySetRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    try {
      return c.json(await configService.setApiKey(parsed.data.provider, parsed.data.apiKey));
    } catch (error) {
      if (error instanceof UserInputError) {
        return c.json<CommandError>({ error: error.message }, 400);
      }
      throw error;
    }
  });

  // DELETE /api/models/api-key?provider= —— 只删 API Key 凭据；OAuth 凭据 409
  app.delete('/api/models/api-key', async (c) => {
    const provider = c.req.query('provider');
    if (provider === undefined || provider === '') {
      return c.json<CommandError>({ error: 'Missing provider' }, 400);
    }
    return c.json(await configService.removeApiKey(provider));
  });

  // POST /api/models/usage —— 查 provider 用量/余额（联网；白名单 provider）
  app.post('/api/models/usage', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ProviderUsageRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await configService.providerUsage(parsed.data.providerId));
  });

  // GET /api/models/enabled?cwd —— 可见范围（只读；项目 shadow 时 canWrite:false）
  app.get('/api/models/enabled', async (c) => {
    const parsed = ModelsQuerySchema.safeParse({ cwd: c.req.query('cwd') });
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const cwd = await resolveCwd(parsed.data.cwd);
    if (typeof cwd !== 'string') return c.json<CommandError>(cwd, 400);
    return c.json(await configService.enabled(cwd));
  });

  // PUT /api/models/enabled —— 最小编辑开关（ADR-0011①，只剩 toggle；ADR-0027）
  app.put('/api/models/enabled', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ModelsEnabledUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const { cwd: rawCwd, ...update } = parsed.data;
    const cwd = await resolveCwd(rawCwd);
    if (typeof cwd !== 'string') return c.json<CommandError>(cwd, 400);
    try {
      return c.json(await configService.updateEnabled(cwd, update));
    } catch (error) {
      if (error instanceof LastModelRejectionError) {
        // 409：请求本身没错，但结果会与用户意图相反（空列表 = 全开）
        return c.json({ error: error.message, reason: 'last-model' }, 409);
      }
      if (error instanceof ProjectShadowedError) {
        return c.json({ error: error.message, reason: 'project-shadow' }, 409);
      }
      if (error instanceof InvalidScopeEditError || error instanceof UserInputError) {
        return c.json<CommandError>({ error: error.message }, 400);
      }
      throw error;
    }
  });

  // PUT /api/models/defaults —— 全局默认模型 + 默认思考强度（写全局 settings.json，ADR-0032）
  // 检查清单：① settings.json 在 ~/.pi/agent（本服务自己的配置目录）；② 错误只提
  // provider/modelId，不提路径；③ 无新增 Origin 例外；④ 副作用走 PUT 非 GET
  app.put('/api/models/defaults', async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ModelsDefaultsUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    const { cwd: rawCwd, ...update } = parsed.data;
    const cwd = await resolveCwd(rawCwd);
    if (typeof cwd !== 'string') return c.json<CommandError>(cwd, 400);
    try {
      return c.json(await configService.updateDefaults(cwd, update));
    } catch (error) {
      if (error instanceof UserInputError || error instanceof InvalidScopeEditError) {
        return c.json<CommandError>({ error: error.message }, 400);
      }
      throw error;
    }
  });

  // POST /api/models/refresh —— 按需拉远端目录（联网；离线时明确回 reason:'offline'）
  app.post('/api/models/refresh', async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = ModelsRefreshRequestSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return c.json<CommandError>({ error: firstIssueMessage(parsed.error.issues) }, 400);
    }
    return c.json(await configService.refresh(parsed.data));
  });
}
