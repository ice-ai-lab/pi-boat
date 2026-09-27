import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import {
  createAgentSessionServices,
  DefaultPackageManager,
  getAgentDir,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  type ResolvedPaths,
  type ResolvedResource,
  type SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type {
  PluginActionRequest,
  PluginPackageInfo,
  PluginResourceCounts,
  PluginResourceInfo,
  PluginsResponse,
  ProjectTrustResponse,
  ResourceDiagnostic,
  SkillCheckResponse,
  SkillInfo,
  SkillInstallRequest,
  SkillPatchRequest,
  SkillSearchResponse,
  SkillsResponse,
  SkillUpdateResult,
  ToolSettingsResponse,
} from '@ice-ai/protocol';
import { InvalidScopeEditError } from '../config/config-service';
import { globalSettingsPath, updateSettingsObject } from './settings-file';

/**
 * 资源域服务（docs/02 §6.9）：skills / plugins / 工具设置 / 项目信任。
 *
 * 三层数据源，按"谁拥有它"分开：
 * 1. **文件**：SKILL.md、扩展目录（读 `createAgentSessionServices` 的 resourceLoader 结果）
 * 2. **settings.json**：skill 开关、包来源列表、工具设置（经 SettingsManager 写）
 * 3. **信任存储**：`~/.pi/agent/trust.json`（ProjectTrustStore）
 *
 * 一条关键语义：`?cwd` 决定**项目级资源是否加载**——未信任的项目，其
 * `.pi/skills` 与 `.pi/extensions` 不会被 loader 读入。所以本服务必须同时回报
 * `requiresTrust` 与 `projectResourcesLoaded`，否则前端会以为"这个项目什么都没装"。
 *
 * 联网纪律：`searchSkills` / `installSkill` / `checkSkillUpdates` / `pluginAction(install|update)`
 * / `checkPluginUpdates` 会联网（npm registry）；其余只读本地。
 */

const REGISTRY_TIMEOUT_MS = 20_000;
const REGISTRY_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';

interface Ctx {
  settingsManager: SettingsManager;
  agentDir: string;
  cwd: string;
  /** 项目级资源是否被信任（未信任时 loader 不读项目资源） */
  projectResourcesLoaded: boolean;
}

export class ResourceService {
  private readonly agentDir = getAgentDir();
  private readonly trustStore = new ProjectTrustStore(this.agentDir);

  // ------------------------------------------------------------------
  // 项目信任
  // ------------------------------------------------------------------

  trust(cwd: string): ProjectTrustResponse {
    // 没有"需要信任的资源"时，信任与否对加载结果没有影响——如实回报 requiresTrust=false，
    // 前端据此隐藏无意义的确认弹窗
    const requiresTrust = hasTrustRequiringProjectResources(cwd);
    return { requiresTrust, trusted: this.trustStore.get(cwd) === true };
  }

  /**
   * 建立/撤销信任。
   *
   * 两种拒绝（server 映射 409）：
   * - `no-trusted-resources`：这个项目根本没有需要信任的东西，接受信任是误导
   * - `session-active`：**有活跃会话时不许改信任**——已经加载的项目资源不能中途撤下，
   *   换信任要重开会话（由调用方保证传 `hasActiveSession`）
   */
  setTrust(
    cwd: string,
    trusted: boolean,
    hasActiveSession: boolean,
  ): { response: ProjectTrustResponse } | { rejection: 'no-trusted-resources' | 'session-active' } {
    if (hasActiveSession) return { rejection: 'session-active' };
    if (trusted && !hasTrustRequiringProjectResources(cwd)) {
      return { rejection: 'no-trusted-resources' };
    }
    this.trustStore.set(cwd, trusted);
    return { response: this.trust(cwd) };
  }

  // ------------------------------------------------------------------
  // skills
  // ------------------------------------------------------------------

  async skills(cwd: string): Promise<SkillsResponse> {
    const ctx = await this.createCtx(cwd);
    return this.collectSkills(ctx);
  }

  private async collectSkills(ctx: Ctx): Promise<SkillsResponse> {
    const services = await createAgentSessionServices({
      cwd: ctx.cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });
    const loaded = services.resourceLoader.getSkills();
    const skills: SkillInfo[] = loaded.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      filePath: skill.filePath,
      baseDir: skill.baseDir,
      source: skill.sourceInfo.path,
      scope: skill.sourceInfo.scope,
      disableModelInvocation: skill.disableModelInvocation,
    }));
    return {
      skills,
      diagnostics: loaded.diagnostics.map((diagnostic) => ({
        type: diagnostic.type,
        message: diagnostic.message,
      })),
      projectResourcesLoaded: ctx.projectResourcesLoaded,
    };
  }

  /**
   * 切换某个 skill 的「禁止模型自动调用」。
   *
   * 这个开关**不是** settings 字段，而是 SKILL.md 的 YAML frontmatter
   * （`disable-model-invocation: true`，见 SDK `SkillFrontmatter`）。所以本操作
   * 会改动用户手写的 SKILL.md——因此只做**逐行定点替换**，不重新序列化 YAML：
   * 其余字段的格式（注释、引号、顺序）原样保留。
   *
   * 关键坑（写错会产出打不开的文件）：这个键必须**按存在性判定**，不能按真值。
   * 已经写着 `disable-model-invocation: false` 的文件若再插一行，就成了 YAML 重复键，
   * 整个文件解析失败、skill 被加载器丢掉——用户看到的是"改了个开关，技能没了"。
   */
  async patchSkill(input: SkillPatchRequest): Promise<SkillsResponse> {
    const cwd = input.cwd ?? process.cwd();
    const ctx = await this.createCtx(cwd);
    const current = await this.collectSkills(ctx);
    const skill = current.skills.find((entry) => entry.name === input.name);
    if (skill === undefined) {
      throw new InvalidScopeEditError(`Unknown skill: ${input.name}`);
    }
    const original = readFileSync(skill.filePath, 'utf8');
    const patched = setDisableModelInvocation(original, input.disableModelInvocation);
    if (patched !== original) writeFileSync(skill.filePath, patched, 'utf8');
    return this.collectSkills(ctx);
  }

  // ------------------------------------------------------------------
  // plugins（扩展包）
  // ------------------------------------------------------------------

  async plugins(cwd: string): Promise<PluginsResponse> {
    const ctx = await this.createCtx(cwd);
    return this.collectPlugins(ctx);
  }

  private async collectPlugins(ctx: Ctx): Promise<PluginsResponse> {
    const services = await createAgentSessionServices({
      cwd: ctx.cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });
    const skills = services.resourceLoader.getSkills();
    const manager = new DefaultPackageManager({
      cwd: ctx.cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });

    // resolve() 给出每个资源的来源（哪个包 / 顶层独立扩展）与启用态——
    // 「状态 / 已解析资源」两块展示全靠它；缺包（配置了没装上）时跳过并记诊断
    const diagnostics: ResourceDiagnostic[] = [];
    let resolved: ResolvedPaths = { extensions: [], skills: [], prompts: [], themes: [] };
    try {
      resolved = await manager.resolve(async (source) => {
        diagnostics.push({
          type: 'warning',
          message: `Package ${source} is configured but not installed yet.`,
        });
        return 'skip';
      });
    } catch (error) {
      diagnostics.push({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const collected = collectResources(resolved);

    const disabledByPackage = getDisabledPackages(ctx.settingsManager);
    const packages: PluginPackageInfo[] = manager.listConfiguredPackages().map((entry) => {
      const scope = entry.scope === 'project' ? 'project' : 'user';
      const key = packageKey(entry.source, scope);
      const disabled = disabledByPackage.get(key) ?? false;
      const counts = collected.countsByPackage.get(key) ?? emptyCounts();
      const resources = collected.resourcesByPackage.get(key) ?? [];
      const resourceCount = counts.extensions + counts.skills + counts.prompts + counts.themes;
      const metadata = readPackageMetadata(entry.installedPath);
      if (entry.installedPath === undefined) {
        diagnostics.push({
          type: 'warning',
          message: `Configured package ${entry.source} was not found on disk.`,
        });
      }
      return {
        source: entry.source,
        displayName: displayNameOf(entry.source),
        scope,
        type: sourceType(entry.source),
        ...(entry.installedPath !== undefined ? { installedPath: entry.installedPath } : {}),
        filtered: entry.filtered,
        enabled: !disabled,
        ...(metadata.packageName !== undefined ? { packageName: metadata.packageName } : {}),
        ...(metadata.version !== undefined ? { version: metadata.version } : {}),
        ...(getConfiguredVersion(entry.source) !== undefined
          ? { configuredVersion: getConfiguredVersion(entry.source) }
          : {}),
        ...(metadata.description !== undefined ? { description: metadata.description } : {}),
        counts,
        resources,
        status: disabled
          ? 'disabled'
          : resourceCount > 0
            ? 'loaded'
            : entry.installedPath !== undefined
              ? 'installed'
              : 'missing',
      } satisfies PluginPackageInfo;
    });

    // resolve() 的 errors 里有加载失败的独立扩展文件，转成诊断
    return {
      packages,
      standaloneExtensions: collected.standaloneExtensions,
      totals: {
        ...collected.totals,
        packages: packages.length,
      },
      diagnostics: [
        ...diagnostics,
        ...skills.diagnostics.map((diagnostic) => ({
          type: diagnostic.type,
          message: diagnostic.message,
        })),
      ],
      projectResourcesLoaded: ctx.projectResourcesLoaded,
    };
  }

  /**
   * 包操作（install / remove / update / disable / enable）。
   *
   * `disable` 与 `remove` 的区别：前者**只从 settings 的来源列表移除**（磁盘副本留着，
   * 再次 enable 不必重新下载），后者连磁盘一起删。这个区别必须保留——用户点
   * "暂时关掉这个插件"不该触发一次网络往返。
   */
  async pluginAction(input: PluginActionRequest): Promise<PluginsResponse> {
    const ctx = await this.createCtx(input.cwd);
    const manager = new DefaultPackageManager({
      cwd: ctx.cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });
    const local = input.scope === 'project';

    switch (input.action) {
      case 'install': {
        if (input.source === undefined) {
          throw new InvalidScopeEditError('install requires a source');
        }
        await manager.installAndPersist(input.source, { local });
        break;
      }
      case 'remove': {
        const source = this.requireSource(input.source);
        await manager.removeAndPersist(source, { local });
        break;
      }
      case 'update': {
        await manager.update(input.source);
        break;
      }
      case 'disable': {
        // 保留来源、清空资源过滤器：侧栏行不消失，开关可随时开回（与 remove 的
        // 「连磁盘一起删」是两回事；旧的「摘来源」语义会让行直接蒸发，误以为被删了）
        if (
          !setPackageDisabled(
            ctx.settingsManager,
            this.requireSource(input.source),
            input.scope === 'project' ? 'project' : 'user',
            true,
          )
        ) {
          break;
        }
        await ctx.settingsManager.flush();
        break;
      }
      case 'enable': {
        if (
          !setPackageDisabled(
            ctx.settingsManager,
            this.requireSource(input.source),
            input.scope === 'project' ? 'project' : 'user',
            false,
          )
        ) {
          // settings 里没有这个来源（旧版语义留下的缺口）：补上
          manager.addSourceToSettings(this.requireSource(input.source), { local });
        }
        await ctx.settingsManager.flush();
        break;
      }
    }
    return this.collectPlugins(ctx);
  }

  private requireSource(source: string | undefined): string {
    if (source === undefined) throw new InvalidScopeEditError('This action requires a source');
    return source;
  }

  /** 更新检查：SDK 的 `checkForAvailableUpdates()` 已经做了 registry 对比 */
  async checkPluginUpdates(cwd: string): Promise<SkillCheckResponse> {
    const ctx = await this.createCtx(cwd);
    const manager = new DefaultPackageManager({
      cwd: ctx.cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });
    try {
      const updates = await manager.checkForAvailableUpdates();
      const pending = new Map(updates.map((update) => [update.source, update]));
      const configured = manager.listConfiguredPackages();
      return {
        results: configured.map((entry) => {
          const update = pending.get(entry.source);
          const current = readPackageMetadata(entry.installedPath).version;
          return {
            package: entry.source,
            state: update !== undefined ? 'update-available' : 'up-to-date',
            ...(current !== undefined ? { currentVersion: current } : {}),
          } satisfies SkillUpdateResult;
        }),
      };
    } catch (error) {
      return {
        results: [],
        ...(error instanceof Error ? { error: error.message } : {}),
      } as SkillCheckResponse & { error: string };
    }
  }

  // ------------------------------------------------------------------
  // skills 的联网三件（search / install / check+update）
  // ------------------------------------------------------------------

  /** npm registry 搜索（服务端代理：浏览器不直连外网，避免 CORS 与来源泄漏） */
  async searchSkills(query: string, limit = 20): Promise<SkillSearchResponse> {
    if (isOffline()) return { results: [], error: 'offline' };
    try {
      const url = `${REGISTRY_SEARCH_URL}?text=${encodeURIComponent(query)}&size=${limit}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
      if (!response.ok) {
        return { results: [], error: `HTTP ${response.status} ${response.statusText}` };
      }
      const body = (await response.json()) as {
        objects?: Array<{
          package?: { name?: string; description?: string; links?: { npm?: string } };
          downloads?: { weekly?: number };
          score?: { detail?: { popularity?: number } };
        }>;
      };
      const results = (body.objects ?? [])
        .map((entry) => {
          const name = entry.package?.name;
          if (typeof name !== 'string') return null;
          return {
            package: name,
            description: entry.package?.description,
            installs: entry.downloads?.weekly ?? null,
            url: entry.package?.links?.npm ?? `https://www.npmjs.com/package/${name}`,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      return { results };
    } catch (error) {
      return { results: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** 装一个 skill 包（走 SDK 的包管理器：它负责 npm/git 来源识别与落盘） */
  async installSkill(input: SkillInstallRequest): Promise<SkillsResponse> {
    const cwd = input.cwd ?? process.cwd();
    const ctx = await this.createCtx(cwd);
    const manager = new DefaultPackageManager({
      cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });
    try {
      await manager.installAndPersist(input.package, { local: input.scope === 'project' });
    } catch (error) {
      throw new SkillInstallError(error instanceof Error ? error.message : String(error));
    }
    return this.collectSkills(ctx);
  }

  /**
   * 检查 skill 包的更新。
   * 版本对比走 registry 的 dist-tags.latest（不做 semver 区间解算——这里只回答
   * "有没有更新的稳定版"，而 `latest` 就是那个答案）。
   */
  async checkSkillUpdates(cwd: string): Promise<SkillCheckResponse> {
    const ctx = await this.createCtx(cwd);
    const manager = new DefaultPackageManager({
      cwd: ctx.cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });
    const configured = manager.listConfiguredPackages();
    const results: SkillUpdateResult[] = [];
    for (const entry of configured) {
      const type = sourceType(entry.source);
      if (type !== 'npm') {
        // git / local 来源没有 registry 版本概念——如实回 unsupported，
        // 不当成 up-to-date（那会让用户以为"检查过了，没问题"）
        results.push({ package: entry.source, state: 'unsupported' });
        continue;
      }
      const current = readPackageMetadata(entry.installedPath).version;
      const latest = await this.latestRegistryVersion(entry.source);
      if (latest === null) {
        results.push({
          package: entry.source,
          state: 'error',
          ...(current !== undefined ? { currentVersion: current } : {}),
          error: 'registry-unreachable',
        });
        continue;
      }
      const state = current === undefined || current === latest ? 'up-to-date' : 'update-available';
      results.push({
        package: entry.source,
        state: current === undefined ? 'up-to-date' : state,
        ...(current !== undefined ? { currentVersion: current } : {}),
        latestVersion: latest,
      });
    }
    return { results };
  }

  /** 更新（缺省全部）：走 SDK，失败按包回报而不是整体失败 */
  async updateSkills(cwd: string, packageName?: string): Promise<SkillCheckResponse> {
    const ctx = await this.createCtx(cwd);
    const manager = new DefaultPackageManager({
      cwd: ctx.cwd,
      agentDir: ctx.agentDir,
      settingsManager: ctx.settingsManager,
    });
    try {
      await manager.update(packageName);
    } catch (error) {
      return {
        results: [
          {
            package: packageName ?? '(all)',
            state: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
    return this.checkSkillUpdates(cwd);
  }

  private async latestRegistryVersion(packageName: string): Promise<string | null> {
    if (isOffline()) return null;
    try {
      const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS) });
      if (!response.ok) return null;
      const body = (await response.json()) as { 'dist-tags'?: { latest?: string } };
      return body['dist-tags']?.latest ?? null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // 工具设置
  // ------------------------------------------------------------------

  /**
   * PowerShell 开关的**推导**（不是独立字段）。
   *
   * pi 用一个概念表达"用哪种 shell"：`defaultTools` 里装的是 `bash` 还是
   * `powershell`。所以这里由工具名单反推，而不是自己发明一个
   * `powershellEnabled` 字段——后者会与 `defaultTools` 各说各话（改了一个
   * 另一个还是旧的，用户看到"开关是开的但跑的还是 bash"）。
   */
  toolSettings(cwd: string): Promise<ToolSettingsResponse> {
    return this.readToolSettings(cwd);
  }

  private async readToolSettings(cwd: string): Promise<ToolSettingsResponse> {
    const ctx = await this.createCtx(cwd);
    return {
      isWindows: process.platform === 'win32',
      powerShellEnabled: isPowerShellEnabled(ctx.settingsManager.getDefaultTools()),
    };
  }

  async updateToolSettings(cwd: string, powerShellEnabled: boolean): Promise<ToolSettingsResponse> {
    const ctx = await this.createCtx(cwd);
    const current = ctx.settingsManager.getDefaultTools() ?? DEFAULT_TOOLS;
    const next = replaceShellTool(current, powerShellEnabled);
    // `defaultTools` 没有 setter，只能自己改文件（带锁 + 原子替换，见 settings-file.ts）
    updateSettingsObject(globalSettingsPath(ctx.agentDir), (settings) => ({
      ...settings,
      defaultTools: next,
    }));
    return this.readToolSettings(cwd);
  }

  // ------------------------------------------------------------------
  // 内部
  // ------------------------------------------------------------------

  private async createCtx(cwd: string): Promise<Ctx> {
    const services = await createAgentSessionServices({ cwd, agentDir: this.agentDir });
    const requiresTrust = hasTrustRequiringProjectResources(cwd);
    return {
      settingsManager: services.settingsManager,
      agentDir: this.agentDir,
      cwd,
      // 没有需要信任的资源时，项目资源本来就会被加载
      projectResourcesLoaded: !requiresTrust || this.trustStore.get(cwd) === true,
    };
  }
}

/** 安装失败（registry / git 报错）→ server 映射 400 而不是 500 */
export class SkillInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillInstallError';
  }
}

// ---------------------------------------------------------------------------
// settings.json 的读写（skill 开关 / 工具开关）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SKILL.md frontmatter 的定点编辑
// ---------------------------------------------------------------------------

const DISABLE_KEY = 'disable-model-invocation';

/** 该 skill 是否用 PowerShell（`defaultTools` 里有 powershell 且没有 bash） */
export function isPowerShellEnabled(
  defaultTools: readonly string[] | undefined,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return (
    platform === 'win32' &&
    defaultTools?.includes('powershell') === true &&
    !defaultTools.includes('bash')
  );
}

/** 把工具名单里的 shell 换成要用的那个（bash ↔ powershell），其余不动 */
export function replaceShellTool(toolNames: readonly string[], usePowerShell: boolean): string[] {
  const shell = usePowerShell ? 'powershell' : 'bash';
  const result: string[] = [];
  for (const name of toolNames) {
    const next = SHELL_TOOLS.has(name) ? shell : name;
    if (!result.includes(next)) result.push(next);
  }
  return result;
}

const DEFAULT_TOOLS = ['read', 'bash', 'edit', 'write'];
const SHELL_TOOLS: ReadonlySet<string> = new Set(['bash', 'powershell']);

/**
 * 切换 SKILL.md 的 `disable-model-invocation`，只改这一行。
 *
 * 用**存在性**而不是真值判定（见 patchSkill 注释里的坑）：文件里已经有这个键
 * （哪怕是 `false`）就在原地改值，没有才插入。
 */
export function setDisableModelInvocation(content: string, disable: boolean): string {
  const block = findFrontmatterBlock(content);
  if (block === null) {
    // 没有 frontmatter：造一个（用户没写过 YAML 头，正文一行都不能动）
    return disable ? `---\n${DISABLE_KEY}: true\n---\n${content}` : content;
  }
  const head = content.slice(0, block.bodyStart);
  const body = content.slice(block.bodyStart, block.bodyEnd);
  const tail = content.slice(block.bodyEnd);

  // ⚠️ 检测与替换都**只在 frontmatter 块内**做：正文里写一行同名的文档说明
  // 是完全正常的事，扫全文会把它当成配置项改掉（实测过）
  const keyLine = new RegExp(
    `^([ \\t]*)(?:${DISABLE_KEY}|"${DISABLE_KEY}"|'${DISABLE_KEY}')[ \\t]*:.*$`,
    'm',
  );
  if (keyLine.test(body)) {
    const replaced = body.replace(
      keyLine,
      (_match, indent: string) => `${indent}${DISABLE_KEY}: ${disable ? 'true' : 'false'}`,
    );
    return `${head}${replaced}${tail}`;
  }
  // 无此键且要关 ⇒ 无需改动（不制造无谓的文件写入）
  if (!disable) return content;
  // 插在块末尾：用户原有字段的顺序与位置不变
  const line = `${DISABLE_KEY}: true`;
  const separator = body.endsWith('\n') || body === '' ? '' : '\n';
  return `${head}${body}${separator}${line}\n${tail}`;
}

interface FrontmatterBlock {
  /** 块内内容的起点（开围栏那一行之后） */
  bodyStart: number;
  /** 块内内容的终点（闭围栏那一行之前） */
  bodyEnd: number;
}

/** 定位 SKILL.md 的 frontmatter 块；没有（或没闭合）返回 null */
function findFrontmatterBlock(content: string): FrontmatterBlock | null {
  const opening = /^\uFEFF?---[ \t]*(\r\n|\n|\r)/.exec(content);
  if (opening === null) return null;
  const rest = content.slice(opening[0].length);
  // 闭围栏：行首的 `---`（pi 的解析器同样取第一个）
  const closing = /(^|\r\n|\n|\r)---/.exec(rest);
  const leading = closing?.[1];
  if (closing === null || leading === undefined) return null;
  return {
    bodyStart: opening[0].length,
    bodyEnd: opening[0].length + closing.index + leading.length,
  };
}

// ---------------------------------------------------------------------------
// 包来源的形状判定
// ---------------------------------------------------------------------------

/** `@scope/pkg@1.2.3` / `github:user/repo` / `/abs/path` → 三类来源 */
export function sourceType(source: string): 'npm' | 'git' | 'local' {
  if (source.startsWith('/') || source.startsWith('.') || source.startsWith('~')) return 'local';
  if (
    source.startsWith('git:') ||
    source.startsWith('git+') ||
    source.startsWith('github:') ||
    source.includes('github.com') ||
    source.endsWith('.git')
  ) {
    return 'git';
  }
  return 'npm';
}

function displayNameOf(source: string): string {
  // `@scope/pkg@1.2.3` → `@scope/pkg`；git URL → 末段
  const atIndex = source.lastIndexOf('@');
  if (atIndex > 0) return source.slice(0, atIndex);
  const slash = source.lastIndexOf('/');
  return slash === -1 ? source : source.slice(slash + 1).replace(/\.git$/, '');
}

// ---------------------------------------------------------------------------
// 插件清单：资源归包 / 禁用表 / 包元数据
// ---------------------------------------------------------------------------

function emptyCounts(): PluginResourceCounts {
  return { extensions: 0, skills: 0, prompts: 0, themes: 0 };
}

function packageKey(source: string, scope: 'user' | 'project'): string {
  return `${scope}\0${source}`;
}

/** settings 里 packages 条目的「禁用」判定：四类资源过滤器全空 = 禁用 */
function isDisabledPackageEntry(entry: unknown): boolean {
  if (typeof entry === 'string') return false;
  if (typeof entry !== 'object' || entry === null) return false;
  const record = entry as Record<string, unknown>;
  return (
    Array.isArray(record.extensions) &&
    record.extensions.length === 0 &&
    Array.isArray(record.skills) &&
    record.skills.length === 0 &&
    Array.isArray(record.prompts) &&
    record.prompts.length === 0 &&
    Array.isArray(record.themes) &&
    record.themes.length === 0
  );
}

function getDisabledPackages(settingsManager: SettingsManager): Map<string, boolean> {
  const disabled = new Map<string, boolean>();
  const globalPackages: unknown = settingsManager.getGlobalSettings().packages;
  if (Array.isArray(globalPackages)) {
    for (const entry of globalPackages) {
      const source =
        typeof entry === 'string' ? entry : String((entry as { source?: unknown })?.source ?? '');
      disabled.set(packageKey(source, 'user'), isDisabledPackageEntry(entry));
    }
  }
  const projectPackages: unknown = settingsManager.getProjectSettings().packages;
  if (Array.isArray(projectPackages)) {
    for (const entry of projectPackages) {
      const source =
        typeof entry === 'string' ? entry : String((entry as { source?: unknown })?.source ?? '');
      disabled.set(packageKey(source, 'project'), isDisabledPackageEntry(entry));
    }
  }
  return disabled;
}

/** 把某个来源的四类资源过滤器清空（禁用）或还原为纯来源串（启用）；返回是否有改动 */
function setPackageDisabled(
  settingsManager: SettingsManager,
  source: string,
  scope: 'user' | 'project',
  disabled: boolean,
): boolean {
  type PackageEntry = Record<string, unknown> & { source: string };
  const current = (
    scope === 'project'
      ? settingsManager.getProjectSettings().packages
      : settingsManager.getGlobalSettings().packages
  ) as unknown;
  if (!Array.isArray(current)) return false;
  let changed = false;
  const next = current.map((entry): unknown => {
    const entrySource =
      typeof entry === 'string' ? entry : String((entry as { source?: unknown })?.source ?? '');
    if (entrySource !== source) return entry;
    changed = true;
    if (!disabled) return source;
    const base: PackageEntry =
      typeof entry === 'string' ? { source: entry } : { ...(entry as PackageEntry) };
    return { ...base, extensions: [], skills: [], prompts: [], themes: [] };
  });
  if (!changed) return false;
  const list = next as Parameters<SettingsManager['setPackages']>[0];
  if (scope === 'project') settingsManager.setProjectPackages(list);
  else settingsManager.setPackages(list);
  return true;
}

function resourceKindOf(kind: keyof PluginResourceCounts): PluginResourceInfo['kind'] {
  return kind === 'extensions' ? 'extension' : (kind.slice(0, -1) as PluginResourceInfo['kind']);
}

/** 展示名：SKILL.md 取目录名；index.ts 取父目录名；其余去扩展名 */
function getResourceName(path: string, kind: PluginResourceInfo['kind']): string {
  const file = basename(path);
  const ext = extname(file);
  if (kind === 'skill' && file.toLowerCase() === 'skill.md') return basename(dirname(path));
  if ((kind === 'extension' || kind === 'theme' || kind === 'prompt') && ext !== '') {
    if (kind === 'extension' && /^index\.(ts|js)$/.test(file)) return basename(dirname(path));
    return file.slice(0, -ext.length);
  }
  return file;
}

function getRelativePath(resource: ResolvedResource): string {
  const baseDir = resource.metadata.baseDir;
  if (baseDir === undefined) return resource.path;
  const rel = relative(baseDir, resource.path);
  // 归一到正斜杠：API 输出跨平台稳定（Node 的 relative 在 Windows 回反斜杠）
  return rel !== '' && !rel.startsWith('..') ? rel.split(sep).join('/') : resource.path;
}

function toResourceInfo(
  resource: ResolvedResource,
  kind: PluginResourceInfo['kind'],
): PluginResourceInfo {
  return {
    kind,
    name: getResourceName(resource.path, kind),
    path: resource.path,
    relativePath: getRelativePath(resource),
  };
}

function collectResources(resolved: ResolvedPaths): {
  countsByPackage: Map<string, PluginResourceCounts>;
  resourcesByPackage: Map<string, PluginResourceInfo[]>;
  standaloneExtensions: PluginsResponse['standaloneExtensions'];
  totals: PluginResourceCounts;
} {
  const countsByPackage = new Map<string, PluginResourceCounts>();
  const resourcesByPackage = new Map<string, PluginResourceInfo[]>();
  const totals = emptyCounts();
  const collect = (resource: ResolvedResource, kind: keyof PluginResourceCounts) => {
    if (!resource.enabled || resource.metadata.origin !== 'package') return;
    const scope = resource.metadata.scope === 'project' ? 'project' : 'user';
    const key = packageKey(resource.metadata.source, scope);
    const counts = countsByPackage.get(key) ?? emptyCounts();
    counts[kind] += 1;
    totals[kind] += 1;
    countsByPackage.set(key, counts);
    const resources = resourcesByPackage.get(key) ?? [];
    resources.push(toResourceInfo(resource, resourceKindOf(kind)));
    resourcesByPackage.set(key, resources);
  };
  for (const resource of resolved.extensions) collect(resource, 'extensions');
  for (const resource of resolved.skills) collect(resource, 'skills');
  for (const resource of resolved.prompts) collect(resource, 'prompts');
  for (const resource of resolved.themes) collect(resource, 'themes');
  // 顶层独立扩展（不在任何包里）：单独一列，启用数计入 totals
  const standaloneExtensions = resolved.extensions
    .filter((resource) => resource.metadata.origin === 'top-level')
    .map((resource): PluginsResponse['standaloneExtensions'][number] => ({
      ...toResourceInfo(resource, 'extension'),
      kind: 'extension' as const,
      scope: resource.metadata.scope,
      enabled: resource.enabled,
    }));
  totals.extensions += standaloneExtensions.filter((extension) => extension.enabled).length;
  return { countsByPackage, resourcesByPackage, standaloneExtensions, totals };
}

/** 来源声明里带的版本（`npm:pkg@1.2.3` 的 1.2.3；git URL 同理） */
function getConfiguredVersion(source: string): string | undefined {
  const npmSpec = source.startsWith('npm:') ? source.slice(4) : undefined;
  if (npmSpec !== undefined) {
    const lastAt = npmSpec.lastIndexOf('@');
    const packageNameEnd = npmSpec.startsWith('@') ? npmSpec.indexOf('/', 1) : 0;
    if (lastAt > packageNameEnd) return npmSpec.slice(lastAt + 1) || undefined;
    return undefined;
  }
  if (source.startsWith('git:') || /^[a-z]+:\/\//.test(source)) {
    const lastAt = source.lastIndexOf('@');
    const lastSlash = source.lastIndexOf('/');
    const lastColon = source.lastIndexOf(':');
    if (lastAt > Math.max(lastSlash, lastColon)) return source.slice(lastAt + 1) || undefined;
  }
  return undefined;
}

/** 读磁盘上已装包的 package.json 元数据（同步读：调用点已在 await 链上，文件很小） */
function readPackageMetadata(installedPath: string | undefined): {
  packageName?: string;
  version?: string;
  description?: string;
} {
  if (installedPath === undefined) return {};
  try {
    const content = readFileSync(join(installedPath, 'package.json'), 'utf8');
    const parsed = JSON.parse(content) as {
      name?: unknown;
      version?: unknown;
      description?: unknown;
    };
    return {
      ...(typeof parsed.name === 'string' ? { packageName: parsed.name } : {}),
      ...(typeof parsed.version === 'string' ? { version: parsed.version } : {}),
      ...(typeof parsed.description === 'string' ? { description: parsed.description } : {}),
    };
  } catch {
    return {};
  }
}

/** 离线开关（与模型域共用同一语义：`PI_OFFLINE` 非空且非假值） */
function isOffline(): boolean {
  const value = process.env.PI_OFFLINE;
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}
