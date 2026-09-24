import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_DIR_NAME,
  createAgentSessionServices,
  getAgentDir,
  type ModelRuntime,
  type SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type {
  CatalogModel,
  DiscoveredModel,
  ModelsConfigDiscoverRequest,
  ModelsConfigTestRequest,
  ModelsConfigTestResponse,
  ModelsEnabledResponse,
  ModelsEnabledUpdate,
  ModelsRefreshRequest,
  ModelsRefreshResponse,
  ModelsResponse,
  ProviderDraft,
} from '@ice-ai/protocol';
import type { SdkModel } from '../agent/sdk-types';
import {
  LastModelRejectionError,
  modelKey,
  prunePatterns,
  resolveVisibleModels,
  resyncPatterns,
  toggleModelInPatterns,
} from './model-scope';
import { modelsConfigPath, readModelsConfig, writeModelsConfig } from './models-config-store';

/**
 * 模型域服务（docs/02 §6.4；决策 ADR-0011）。
 *
 * 与 AgentSessionService 的分工：这里只做**模型目录 / 配置 / 可见范围**，
 * 不碰会话 runtime。每次调用现建一次 `createAgentSessionServices`（拿到
 * `modelRuntime` + `settingsManager`），因为模型与凭据随时可能被别的进程改动，
 * 缓存一份长期 runtime 会让面板显示过期信息。
 *
 * 联网纪律（ADR-0011③）：只有 `discover` / `testModel` / `catalog` / `refresh`
 * 四个方法会联网，其余全是本地读取。
 */

/** 上下文窗口未知时给目录项的占位（前端只用来排序/显示） */
const CATALOG_TTL_MS = 60 * 60_000;
const MODELS_DEV_URL = 'https://models.dev/api.json';
const NETWORK_TIMEOUT_MS = 20_000;

/** 思考档位全序（与 pi-ai 的 EXTENDED_THINKING_LEVELS 一致） */
const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

/**
 * 某模型支持的思考档位。
 *
 * 与 pi-ai 的 `getSupportedThinkingLevels()` 同一算法（那份在 pi-ai 里，
 * pi-coding-agent 未转出；这里重写一份而不是为此新增一个依赖）：
 * - 不推理的模型只有 `off`
 * - 其余档位看 `thinkingLevelMap`：`null` = 显式不支持；`xhigh`/`max` 必须显式映射才可用
 */
function supportedThinkingLevels(model: SdkModel): string[] {
  if (!model.reasoning) return ['off'];
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    if (level === 'xhigh' || level === 'max') return mapped !== undefined;
    return true;
  });
}

export interface ConfigServiceOptions {
  /** `~/.pi/agent` 覆盖（测试） */
  agentDir?: string;
  /** 项目资源目录名（默认取 SDK 的 CONFIG_DIR_NAME，通常是 `.pi`） */
  projectConfigDirName?: string;
}

interface RuntimeHandle {
  modelRuntime: ModelRuntime;
  settingsManager: SettingsManager;
  diagnostics: string[];
}

export class ConfigService {
  private readonly agentDir: string;
  private readonly projectConfigDirName: string;
  private catalogCache: { at: number; models: CatalogModel[] } | null = null;
  /** 并发刷新合并：同一 provider 的两个标签页不该同时拉同一份目录（ADR-0011③） */
  private refreshInFlight: Promise<ModelsRefreshResponse> | null = null;

  constructor(options: ConfigServiceOptions = {}) {
    this.agentDir = options.agentDir ?? getAgentDir();
    this.projectConfigDirName = options.projectConfigDirName ?? CONFIG_DIR_NAME;
  }

  // ------------------------------------------------------------------
  // GET /api/models
  // ------------------------------------------------------------------

  async models(cwd: string): Promise<ModelsResponse> {
    const handle = await this.createHandle(cwd);
    const { modelRuntime, settingsManager } = handle;
    const patterns = settingsManager.getEnabledModels();
    const scope = await resolveVisibleModels(modelRuntime, patterns);

    const nameMap: Record<string, string> = {};
    const thinkingLevels: Record<string, string[]> = {};
    const thinkingLevelMaps: Record<string, Record<string, string | null>> = {};
    const modelList = scope.visible
      .map((scoped) => {
        const model = scoped.model;
        const key = modelKey(model);
        nameMap[key] = model.name;
        thinkingLevels[key] = supportedThinkingLevels(model);
        const map = model.thinkingLevelMap;
        if (map !== undefined) {
          thinkingLevelMaps[key] = Object.fromEntries(
            Object.entries(map).map(([level, value]) => [level, value ?? null]),
          );
        }
        return {
          id: model.id,
          name: model.name,
          provider: model.provider,
          input: [...model.input],
        };
      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
          a.provider.localeCompare(b.provider) ||
          a.id.localeCompare(b.id),
      );

    const defaultProvider = settingsManager.getDefaultProvider();
    const defaultModelId = settingsManager.getDefaultModel();
    const firstVisible = scope.visible[0]?.model;
    // 默认模型：设置里的显式默认优先，否则回落到可见列表首个（与 CLI 的初选一致）
    const defaultModel =
      defaultProvider !== undefined && defaultModelId !== undefined
        ? { provider: defaultProvider, modelId: defaultModelId }
        : firstVisible !== undefined
          ? { provider: firstVisible.provider, modelId: firstVisible.id }
          : null;
    const defaultThinkingLevel =
      (defaultModel !== null
        ? (scope.thinkingLevelPins[`${defaultModel.provider}:${defaultModel.modelId}`] ??
          settingsManager.getModelThinkingLevel(defaultModel.provider, defaultModel.modelId))
        : undefined) ??
      settingsManager.getDefaultThinkingLevel() ??
      'medium';

    const runtimeError = modelRuntime.getError();
    return {
      models: nameMap,
      modelList,
      defaultModel,
      defaultThinkingLevel: defaultThinkingLevel as ModelsResponse['defaultThinkingLevel'],
      thinkingLevels,
      thinkingLevelMaps,
      thinkingLevelPins: scope.thinkingLevelPins,
      ...(scope.warnings.length > 0 ? { modelScopeWarnings: scope.warnings } : {}),
      ...(runtimeError !== undefined
        ? { error: runtimeError }
        : handle.diagnostics.length > 0
          ? { error: handle.diagnostics.join('; ') }
          : {}),
    };
  }

  // ------------------------------------------------------------------
  // models.json 原文读写
  // ------------------------------------------------------------------

  readConfig(): { modelsPath: string; config: Record<string, unknown> } {
    const path = modelsConfigPath(this.agentDir);
    return { modelsPath: path, config: readModelsConfig(path) };
  }

  writeConfig(config: Record<string, unknown>): { modelsPath: string } {
    const path = modelsConfigPath(this.agentDir);
    writeModelsConfig(config, path);
    return { modelsPath: path };
  }

  // ------------------------------------------------------------------
  // 可见范围（ADR-0011）
  // ------------------------------------------------------------------

  async enabled(cwd: string): Promise<ModelsEnabledResponse> {
    const handle = await this.createHandle(cwd);
    const { modelRuntime, settingsManager } = handle;
    const projectPatterns = settingsManager.getProjectSettings().enabledModels;
    const globalPatterns = settingsManager.getGlobalSettings().enabledModels;
    // 项目级字段存在时**整体替换**全局值（不是合并）⇒ 面板只读并显示实际生效的文件
    const shadowed = projectPatterns !== undefined;
    const patterns = shadowed ? projectPatterns : (globalPatterns ?? []);
    const scope = await resolveVisibleModels(
      modelRuntime,
      patterns.length === 0 ? undefined : patterns,
    );

    return {
      patterns: [...patterns],
      models: scope.visible.map((scoped) => ({
        id: scoped.model.id,
        name: scoped.model.name,
        provider: scoped.model.provider,
        input: [...scoped.model.input],
      })),
      scope: shadowed ? 'project' : 'global',
      settingsPath: shadowed
        ? join(cwd, this.projectConfigDirName, 'settings.json')
        : join(this.agentDir, 'settings.json'),
      canWrite: !shadowed,
      warnings: scope.warnings,
    };
  }

  /**
   * 应用一次可见范围修改（ADR-0011①）。
   *
   * 三种 op 都走**最小编辑**：只重写被切换的那一个 provider 的片段，其余 pattern
   * （含匹配不到的项、`:level` 后缀）原样保留。
   *
   * ⚠️ 用 `getModels()`（完整目录）而不是 `getAvailable()` 来枚举 provider 的模型：
   * 后者只看**当前鉴权通过**的 provider，据此判断"是否全覆盖"会把缺凭据的模型
   * 误判为"不需要"（ADR-0011 的实证坑 2）。
   */
  async updateEnabled(cwd: string, input: ModelsEnabledUpdate): Promise<ModelsEnabledResponse> {
    const current = await this.enabled(cwd);
    if (!current.canWrite) {
      throw new ProjectShadowedError(
        `Model scope is defined by ${current.settingsPath}; edit that file instead`,
      );
    }

    if (input.op === 'prune' || input.op === 'resync') {
      const handle = await this.createHandle(cwd);
      const all = handle.modelRuntime.getModels();
      const next =
        input.op === 'prune'
          ? prunePatterns(current.patterns, current.warnings)
          : resyncPatterns(current.patterns, current.warnings, all);
      await this.persistEnabled(handle.settingsManager, next);
      return this.enabled(cwd);
    }

    if (
      input.providerId === undefined ||
      input.modelId === undefined ||
      input.enabled === undefined
    ) {
      throw new InvalidScopeEditError('toggle requires providerId, modelId and enabled');
    }

    const handle = await this.createHandle(cwd);
    const scope = await resolveVisibleModels(
      handle.modelRuntime,
      current.patterns.length === 0 ? undefined : current.patterns,
    );
    const providerModelIds = handle.modelRuntime
      .getModels(input.providerId)
      .map((model) => model.id);
    let next: string[];
    try {
      next = toggleModelInPatterns({
        patterns: current.patterns,
        providerId: input.providerId,
        modelId: input.modelId,
        enabled: input.enabled,
        providerModelIds,
        visible: scope.visible,
      });
    } catch (error) {
      if (error instanceof LastModelRejectionError) throw error;
      throw error;
    }
    await this.persistEnabled(handle.settingsManager, next);
    return this.enabled(cwd);
  }

  private async persistEnabled(
    settingsManager: SettingsManager,
    patterns: readonly string[],
  ): Promise<void> {
    // 写入走 SettingsManager（自己的锁 + 原子落盘），空列表归一化为"不限制"
    settingsManager.setEnabledModels(patterns.length === 0 ? undefined : [...patterns]);
    await settingsManager.flush();
    const errors = settingsManager.drainErrors();
    if (errors.length > 0) {
      throw new InvalidScopeEditError(
        `Failed to write settings: ${describeSettingsError(errors[0])}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // 目录刷新（ADR-0011③：只有用户点按钮才联网）
  // ------------------------------------------------------------------

  async refresh(input: ModelsRefreshRequest = {}): Promise<ModelsRefreshResponse> {
    if (isOffline()) {
      return { ok: false, changed: false, reason: 'offline' };
    }
    // 并发合并：两个标签页同按不该拉同一份目录两次
    if (this.refreshInFlight !== null) return this.refreshInFlight;

    const run = (async (): Promise<ModelsRefreshResponse> => {
      const handle = await this.createHandle(process.cwd());
      const before = snapshotCatalog(handle.modelRuntime);
      const providers = input.provider !== undefined ? [input.provider] : undefined;
      let result: { errors: ReadonlyMap<string, Error>; aborted: boolean };
      try {
        result = await handle.modelRuntime.refresh({
          ...(providers !== undefined ? { providers } : {}),
          allowNetwork: true,
          ...(input.force === true ? { force: true } : {}),
          signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
        });
      } catch (error) {
        return {
          ok: false,
          changed: false,
          reason: 'error',
          errors: { refresh: error instanceof Error ? error.message : String(error) },
        };
      }
      const after = snapshotCatalog(handle.modelRuntime);
      const errors: Record<string, string> = {};
      for (const [provider, error] of result.errors) errors[provider] = error.message;
      // 变更检测比 id/name，不比存储字节：每次 revalidate 都会重写 checkedAt/etag
      const changed = before !== after;
      const refreshable = handle.modelRuntime
        .getProviders()
        .filter((provider) => input.provider === undefined || provider.id === input.provider);
      return {
        ok: Object.keys(errors).length === 0,
        changed,
        ...(refreshable.length === 0 ? { reason: 'no-refreshable-provider' as const } : {}),
        ...(Object.keys(errors).length > 0 ? { errors } : {}),
      };
    })();

    this.refreshInFlight = run;
    try {
      return await run;
    } finally {
      this.refreshInFlight = null;
    }
  }

  // ------------------------------------------------------------------
  // discover / test / catalog（三个联网诊断端点）
  // ------------------------------------------------------------------

  /** 按 provider 的 `/models` 端点发现模型列表（20s 超时） */
  async discover(
    input: ModelsConfigDiscoverRequest,
  ): Promise<{ models: DiscoveredModel[]; error?: string }> {
    const url = `${input.provider.baseUrl.replace(/\/+$/, '')}/models`;
    try {
      const response = await fetch(url, {
        headers: input.provider.apiKey !== undefined ? authHeaders(input.provider) : {},
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { models: [], error: `HTTP ${response.status} ${response.statusText}` };
      }
      const body: unknown = await response.json();
      return { models: parseDiscoveredModels(body) };
    } catch (error) {
      return { models: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 真实补全请求测连通（20s 超时）。
   *
   * 为什么要落一份**临时 models.json** 而不是直接注册 provider：`registerProvider`
   * 需要 pi 内部的 `ProviderConfigInput` 形状，而面板给的是一份 models.json 草稿；
   * 走一次真实的加载器既能复用同一套解析（apiKey 的 `$ENV` / `!cmd` 展开等），
   * 也避免我们维护一份会漂移的第二形状。
   */
  async testModel(input: ModelsConfigTestRequest): Promise<ModelsConfigTestResponse> {
    const dir = await mkdtemp(join(tmpdir(), 'piboat-model-test-'));
    const startedAt = Date.now();
    try {
      await writeFile(
        join(dir, 'models.json'),
        JSON.stringify({
          providers: {
            [input.providerName]: {
              baseUrl: input.provider.baseUrl,
              api: input.provider.api,
              ...(input.provider.apiKey !== undefined ? { apiKey: input.provider.apiKey } : {}),
              models: [
                {
                  id: input.model.id,
                  name: input.model.id,
                  reasoning: false,
                  input: ['text'],
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                  contextWindow: 32_768,
                  maxTokens: 1_024,
                },
              ],
            },
          },
        }),
        'utf8',
      );
      const services = await createAgentSessionServices({ cwd: dir, agentDir: dir });
      const model = services.modelRuntime.getModel(input.providerName, input.model.id);
      if (model === undefined) {
        return { ok: false, error: 'Model was not registered from the draft configuration' };
      }
      const message = await services.modelRuntime.completeSimple(
        model,
        {
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Reply with the single word: ok' }],
              timestamp: Date.now(),
            },
          ],
        } as never,
        { signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) },
      );
      const text = message.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
        .trim();
      return { ok: true, latencyMs: Date.now() - startedAt, text: text.slice(0, 200) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** models.dev 目录（服务端代理 + 1h 缓存；浏览器不直连外网） */
  async catalog(q?: string): Promise<{ models: CatalogModel[]; error?: string }> {
    const cached = this.catalogCache;
    if (cached !== null && Date.now() - cached.at < CATALOG_TTL_MS) {
      return { models: filterCatalog(cached.models, q) };
    }
    if (isOffline()) {
      return cached !== null
        ? { models: filterCatalog(cached.models, q), error: 'offline' }
        : { models: [], error: 'offline' };
    }
    try {
      const response = await fetch(MODELS_DEV_URL, {
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
      if (!response.ok) {
        return { models: [], error: `HTTP ${response.status} ${response.statusText}` };
      }
      const models = parseModelsDevCatalog(await response.json());
      this.catalogCache = { at: Date.now(), models };
      return { models: filterCatalog(models, q) };
    } catch (error) {
      // 目录挂掉不该让面板空白：有旧缓存就发旧的 + 错误标记
      if (cached !== null) {
        return {
          models: filterCatalog(cached.models, q),
          error: error instanceof Error ? error.message : String(error),
        };
      }
      return { models: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ------------------------------------------------------------------
  // 内部
  // ------------------------------------------------------------------

  private async createHandle(cwd: string): Promise<RuntimeHandle> {
    const services = await createAgentSessionServices({ cwd, agentDir: this.agentDir });
    return {
      modelRuntime: services.modelRuntime,
      settingsManager: services.settingsManager,
      diagnostics: services.diagnostics.map((diagnostic) => diagnostic.message),
    };
  }
}

function describeSettingsError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'type' in error) {
    return String((error as { type: unknown }).type);
  }
  return String(error);
}

/** 项目级 shadow：面板只读（ADR-0011②） */
export class ProjectShadowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectShadowedError';
  }
}

/** 可见范围编辑的输入错误（server 映射 400） */
export class InvalidScopeEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScopeEditError';
  }
}

/** 离线判定：`PI_OFFLINE` 是本服务与 pi CLI 共用的离线开关，`force` 不得覆盖它 */
function isOffline(): boolean {
  const value = process.env.PI_OFFLINE;
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

/** 目录快照指纹：只比 id/name，不比存储字节（每次 revalidate 都会改 checkedAt） */
function snapshotCatalog(modelRuntime: ModelRuntime): string {
  return modelRuntime
    .getModels()
    .map((model) => `${model.provider}/${model.id}=${model.name}`)
    .sort()
    .join('\n');
}

function authHeaders(provider: ProviderDraft): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${provider.apiKey ?? ''}` };
  if (provider.api.includes('anthropic')) {
    headers['x-api-key'] = provider.apiKey ?? '';
    headers['anthropic-version'] = '2023-06-01';
    delete headers.Authorization;
  }
  return headers;
}

/** 兼容 OpenAI（`{data:[…]}`）与 Anthropic（`{data:[{id,display_name}]}`）两种列表形状 */
function parseDiscoveredModels(body: unknown): DiscoveredModel[] {
  if (typeof body !== 'object' || body === null) return [];
  const list =
    (body as { data?: unknown; models?: unknown }).data ?? (body as { models?: unknown }).models;
  if (!Array.isArray(list)) return [];
  const models: DiscoveredModel[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as { id?: unknown; name?: unknown; display_name?: unknown };
    if (typeof record.id !== 'string' || record.id.trim() === '') continue;
    const name =
      typeof record.name === 'string'
        ? record.name
        : typeof record.display_name === 'string'
          ? record.display_name
          : record.id;
    models.push({ id: record.id, name });
  }
  return models;
}

/** models.dev 的形状：`{[providerId]: {name, models: {[modelId]: {name, …}}}}` */
function parseModelsDevCatalog(body: unknown): CatalogModel[] {
  if (typeof body !== 'object' || body === null) return [];
  const models: CatalogModel[] = [];
  for (const [providerId, provider] of Object.entries(body as Record<string, unknown>)) {
    if (typeof provider !== 'object' || provider === null) continue;
    const providerName = (provider as { name?: unknown }).name;
    const providerModels = (provider as { models?: unknown }).models;
    if (typeof providerModels !== 'object' || providerModels === null) continue;
    for (const [modelId, model] of Object.entries(providerModels as Record<string, unknown>)) {
      const record =
        typeof model === 'object' && model !== null ? (model as Record<string, unknown>) : {};
      models.push({
        id: modelId,
        name: typeof record.name === 'string' ? record.name : modelId,
        provider: typeof providerName === 'string' ? providerName : providerId,
        ...(typeof record.contextWindow === 'number'
          ? { contextWindow: record.contextWindow }
          : {}),
        ...(typeof record.reasoning === 'boolean' ? { reasoning: record.reasoning } : {}),
      });
    }
  }
  return models;
}

function filterCatalog(models: CatalogModel[], q: string | undefined): CatalogModel[] {
  if (q === undefined || q.trim() === '') return models;
  const needle = q.toLowerCase();
  return models.filter(
    (model) =>
      model.id.toLowerCase().includes(needle) ||
      model.name.toLowerCase().includes(needle) ||
      model.provider.toLowerCase().includes(needle),
  );
}
