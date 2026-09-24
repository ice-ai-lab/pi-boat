import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildSessionContext,
  createAgentSessionServices,
  getPackageDir,
  type SessionInfo as SdkSessionInfo,
  type SessionEntry,
  SessionManager,
  sessionEntryToContextMessages,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentMessage,
  SessionContext,
  SessionContextQuery,
  SessionDetailResponse,
  SessionInfo,
  SessionStatsInfo,
  SessionTreeNode,
  ThinkingLevel,
} from '@ice-ai/protocol';
import { UserInputError } from '../agent/agent-session-service';
import { type SdkAgentMessage, toWireAgentMessage } from '../events/wire-message';
import type { SessionsDirScan } from './dir-scan';
import { resolveSessionsRoot, scanSessionsDir } from './dir-scan';
import type { ProjectResolverLike } from './project-resolver';
import { ProjectResolver } from './project-resolver';

/**
 * 只读会话浏览（docs/01 §3.1 SessionReadService，M1 子集：列表/详情/分页/改名）。
 *
 * 为什么需要：SDK 的 SessionManager 只有裸的 .jsonl 读取原语；浏览视图需要的
 * 分页截断、详情装配、统计摘要、运行态合并、改名写入都没有现成入口。
 *
 * 相对 SDK 新增：list / search / detail（tail 分页装配）、context（上下文窗口装配）、
 * rename、computeStats、delete（subagent 级联）。数据源是 pi 共享的 .jsonl 会话文件
 * （~/.pi/agent/sessions 及项目目录），与 pi CLI 天然互见。文件存储的 toolCall 本就是
 * {id, name, arguments} 形状，无需归一化；流式路径的双字段补齐在 core 投影层完成
 * （events/wire-event.ts）。
 *
 * 同域相邻模块（2026-09-22 按领域拆分）：dir-scan（目录元数据扫描 + 指纹，本服务的
 * 列表缓存键）、project-read-service（项目清单，ADR-0008 的分组视图）与
 * project-resolver（cwd 归一，enrich 用；须与 ProjectReadService 共享同一实例）。
 *
 * 性能分层（ADR-0008）：列表缓存键 = 会话目录指纹（每文件 size+mtime，成本 ~0.1ms，
 * dir-scan 计算）；指纹不匹配才跑全量 listAll。
 *
 * M1 不做：导出 HTML / auto-name（需 LLM）/ 搜索索引（M3）、deferMedia 占位符
 * （图片惰性加载的 wire 形状待 protocol 定稿后再接，目前历史图片全文直发）。
 */

export interface SessionReadOptions {
  /** 会话文件目录（缺省 = SDK 默认 ~/.pi/agent/sessions；测试注入临时目录） */
  sessionDir?: string;
  /** 会话根目录（其下每项目一子目录，列表扫描范围）；缺省 = sessionDir ?? SDK 默认 */
  sessionsRoot?: string;
  /** 运行中会话查询（详情合并运行时状态用），缺省恒 false */
  isRunning?: (sessionId: string) => boolean;
  /** 项目解析器（缓存 git 归一结果）；测试可注入以避开真实 git 子进程。
   *  传给 ProjectReadService 的必须是同一实例（projectKey 按构造一致，ADR-0008） */
  resolver?: ProjectResolverLike;
}

/** GET /api/sessions 的查询语义（rest/sessions 的 SessionListQuery） */
export interface SessionListOptions {
  /** 跳过后端列表缓存并清空项目解析缓存（?force=1） */
  force?: boolean;
  /** 只返回该项目的会话（ProjectInfo.projectKey） */
  projectKey?: string;
  /**
   * 快路径：跳过 `enrich()`（每 cwd 一次 git 解析）。返回项的 projectRoot/projectKey
   * 缺省——侧栏先用它把列表显示出来，分组随后由全量读补（ADR-0008）。
   */
  summary?: boolean;
  /** 运行时注册表里的内存会话（尚未落盘）；由 server 从 AgentSessionService 取 */
  transient?: SessionInfo[];
}

const DEFAULT_TAIL = 50;
const MAX_TAIL = 1000;
/** 正文搜索的候选上限（轻量字段未命中的部分按发件时间倒序取这么多） */
const BODY_SEARCH_MAX_CANDIDATES = 300;
/** 单文件正文扫描上限：超了说明这不是一条"会话"，读了也只是浪费 */
const BODY_SEARCH_MAX_FILE_BYTES = 8 * 1024 * 1024;
const AUTO_NAME_TIMEOUT_MS = 30_000;
const AUTO_NAME_MAX_LENGTH = 80;

/**
 * 子代理标记的 `customType`。
 *
 * 这是 `.jsonl` 里的实际磁盘值，不是命名偏好：会话文件与其他读同一目录的运行时
 * 共享，改字面量会让既有子代理会话不再被识别（级联删除、家族归组失效）。
 * 因此只在文档/注释里按常量名引用，字面量只在本行出现一次。
 */
const SUBAGENT_CUSTOM_TYPE = 'pi-web:subagent';

export class SessionReadService {
  private readonly sessionDir?: string;
  private readonly sessionsRoot: string;
  private readonly isRunning: (sessionId: string) => boolean;
  private readonly resolver: ProjectResolverLike;
  /** 列表缓存：指纹匹配才复用（会话增删/改名/写入都会改变指纹） */
  private listCache: { fingerprint: string; sessions: SessionInfo[] } | null = null;

  constructor(options: SessionReadOptions = {}) {
    this.sessionDir = options.sessionDir;
    this.sessionsRoot = resolveSessionsRoot(options);
    this.isRunning = options.isRunning ?? (() => false);
    this.resolver = options.resolver ?? new ProjectResolver();
  }

  // ------------------------------------------------------------------
  // 列表（GET /api/sessions，docs/02 §6.1）
  // ------------------------------------------------------------------

  async list(options: SessionListOptions = {}): Promise<SessionInfo[]> {
    if (options.force === true) this.invalidate();
    const scan = await scanSessionsDir(this.sessionsRoot);
    // 快路径不读也不写 enrich 缓存：缓存存的是**带分组**的样子，混着存会让下一次
    // 全量读拿到没有 projectKey 的条目，分组凭空消失
    let sessions =
      options.summary === true
        ? null
        : this.listCache?.fingerprint === scan.fingerprint
          ? this.listCache.sessions
          : null;
    if (sessions === null) {
      const raw = await this.listAllSessions(scan);
      sessions =
        options.summary === true
          ? raw.map((info) => this.toWireInfo(info))
          : await this.enrich(raw);
      if (options.summary !== true) this.listCache = { fingerprint: scan.fingerprint, sessions };
    }
    // 内存会话（transient）排在最前：刚 ensure_session 建的还没落盘，但客户端必须看得见
    const merged = mergeTransient(sessions, options.transient ?? []);
    return options.projectKey === undefined
      ? merged
      : merged.filter((session) => session.projectKey === options.projectKey);
  }

  /** 会话目录指纹（GET /api/sessions 的 listFingerprint）：回答“磁盘侧列表内容变了吗” */
  async listFingerprint(): Promise<string> {
    return (await scanSessionsDir(this.sessionsRoot)).fingerprint;
  }

  /**
   * 搜索：先按**轻量字段**（名字 / 首条消息）筛，剩下的再逐文件扫正文（G2-7）。
   *
   * 为什么要扫正文：用户记得住"那个讲过 rate limiter 的会话"，记不住它开头写了什么。
   * 但正文扫描必须**有界**：先按轻量字段 + 发件时间排序取前 N 个候选，避免整个
   * 会话库（可能几万条）全读一遍。
   */
  async search(q: string): Promise<SessionInfo[]> {
    const needle = q.toLowerCase();
    const all = await this.list();
    const byField = all.filter(
      (s) =>
        s.firstMessage.toLowerCase().includes(needle) ||
        (s.name?.toLowerCase().includes(needle) ?? false),
    );
    const hits = new Map(byField.map((session) => [session.id, session]));

    const candidates = all
      .filter((session) => !hits.has(session.id))
      .slice(0, BODY_SEARCH_MAX_CANDIDATES);
    for (const candidate of candidates) {
      if (await this.fileContains(candidate.path, needle)) hits.set(candidate.id, candidate);
    }
    return [...hits.values()];
  }

  /** 有界正文扫描：命中即停，不把整文件读进内存 */
  private async fileContains(path: string, needle: string): Promise<boolean> {
    try {
      const info = await stat(path);
      if (info.size > BODY_SEARCH_MAX_FILE_BYTES) return false;
      const content = await readFile(path, 'utf8');
      return content.toLowerCase().includes(needle);
    } catch {
      return false;
    }
  }

  /**
   * 会话文件指纹（G2-6）：详情视图缓存的失效判据。
   * 与列表指纹同构（size+mtime），但作用于单个文件；同样**无单调性**。
   */
  async revision(id: string): Promise<string | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    const file = manager.getSessionFile();
    if (file === undefined) return `memory:${manager.getEntries().length}`;
    return fileFingerprint(file);
  }

  /** 清空缓存（force 路径；项目解析缓存也一并清） */
  invalidate(): void {
    this.listCache = null;
    this.resolver.clear();
  }

  // ------------------------------------------------------------------
  // 详情（GET /api/sessions/:id，docs/02 §6.2）
  // ------------------------------------------------------------------

  async detail(id: string): Promise<SessionDetailResponse | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;

    const entries = manager.getEntries();
    const leafId = manager.getLeafId();
    const tree = manager.getTree() as SessionTreeNode[];
    const stats = computeStats(entries, manager.getSessionId(), manager.getSessionFile());
    const context = this.buildContext(entries, leafId, {});

    const filePath = manager.getSessionFile() ?? '';
    const info = this.infoFromManager(manager, entries);
    if (filePath !== '') info.revision = await fileFingerprint(filePath);
    return {
      sessionId: manager.getSessionId(),
      filePath,
      info,
      leafId,
      tree,
      context,
      stats,
      // 活跃时长需运行时埋点；冷会话置 0（协议字段为必填，语义上无运行记录）
      totalActiveMs: 0,
    };
  }

  // ------------------------------------------------------------------
  // 会话引用集合（文件域 allowed-roots 之外放行的依据，protocol rest/files 头注）
  // ------------------------------------------------------------------

  /**
   * 该会话**碰过的**文件路径：从 assistant 的 toolCall 参数里抽（read/write/edit/…）。
   *
   * 为什么只抽工具参数：那是"agent 真的访问了这个路径"的唯一可信来源——从
   * 工具结果的文本里 grep 路径会把模型随口提到的路径也算进来，等于把闸门开成
   * "凡是会话里出现过的字符串都可读"。
   */
  async referencedPaths(id: string): Promise<string[] | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    const paths = new Set<string>();
    for (const entry of manager.getEntries()) {
      if (entry.type !== 'message' || entry.message.role !== 'assistant') continue;
      for (const block of entry.message.content) {
        if (block.type !== 'toolCall') continue;
        collectPathArguments(block.arguments, paths);
      }
    }
    return [...paths];
  }

  // ------------------------------------------------------------------
  // 推理文本惰性读取（GET .../entries/:entryId/thinking）
  // ------------------------------------------------------------------

  /**
   * 单条 assistant 消息里某个 content block 的完整 thinking 文本。
   * 历史下发默认剥掉 thinking（体积大、多数时候折叠），需要时按 block 取原文。
   */
  async thinking(
    id: string,
    entryId: string,
    blockIndex: number,
  ): Promise<{ thinking: string } | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    const entry = manager.getEntry(entryId);
    if (entry?.type !== 'message' || entry.message.role !== 'assistant') return null;
    const block = entry.message.content[blockIndex];
    if (block?.type !== 'thinking') return null;
    return { thinking: block.thinking };
  }

  // ------------------------------------------------------------------
  // HTML 导出（GET /api/sessions/:id/export）
  // ------------------------------------------------------------------

  /**
   * 导出会话为自包含 HTML。
   *
   * 走 SDK 的 `exportFromFile()`——它**没有**从包根转出（SDK 只把 CLI 的
   * `--export` 入口留在内部），因此按绝对文件路径动态 import：这样绕开
   * package `exports` 映射，也不依赖 `dist` 的内部目录结构之外的任何东西。
   * 只用 `getPackageDir()`（那个是包根公开导出的）来定位。
   */
  async exportHtml(id: string): Promise<string | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    const source = manager.getSessionFile();
    if (source === undefined) return null;

    const dir = await mkdtemp(join(tmpdir(), 'piboat-export-'));
    const outputPath = join(dir, 'session.html');
    try {
      const modulePath = join(getPackageDir(), 'dist', 'core', 'export-html', 'index.js');
      const mod = (await import(pathToFileURL(modulePath).href)) as {
        exportFromFile: (inputPath: string, options?: { outputPath?: string }) => Promise<string>;
      };
      await mod.exportFromFile(source, { outputPath });
      return await readFile(outputPath, 'utf8');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // ------------------------------------------------------------------
  // auto-name（POST /api/sessions/:id/auto-name）
  // ------------------------------------------------------------------

  /**
   * 让模型给会话起个名字。
   *
   * 用**会话自己的前几条消息**做输入（不从磁盘重读全文，避免把整段历史塞进
   * 一次小请求）。模型取该 cwd 的默认模型；`persist` 为真时把结果写回会话文件
   * （追加一条 session_info，与 `PATCH /api/sessions/:id` 同一落盘路径）。
   */
  async autoName(
    id: string,
    options: { cwd?: string; persist?: boolean } = {},
  ): Promise<{ title: string } | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    const entries = manager.getEntries();
    const excerpt = autoNameExcerpt(entries);
    if (excerpt === '') throw new UserInputError('Session has no messages to summarize');

    const cwd = options.cwd ?? manager.getCwd();
    const services = await createAgentSessionServices({ cwd });
    const provider = services.settingsManager.getDefaultProvider();
    const modelId = services.settingsManager.getDefaultModel();
    const model =
      provider !== undefined && modelId !== undefined
        ? services.modelRuntime.getModel(provider, modelId)
        : (await services.modelRuntime.getAvailable())[0];
    if (model === undefined) {
      throw new UserInputError('No model available to generate a session name');
    }

    const message = await services.modelRuntime.completeSimple(
      model,
      {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Summarize this coding session as a short title (max 6 words, no quotes, ' +
                  'no trailing punctuation). Reply with the title only.\n\n' +
                  excerpt,
              },
            ],
            timestamp: Date.now(),
          },
        ],
      } as never,
      { signal: AbortSignal.timeout(AUTO_NAME_TIMEOUT_MS) },
    );
    const title = message.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim()
      .replace(/^["'「]|["'」]$/g, '')
      .split('\n')[0]
      ?.trim();
    if (title === undefined || title === '') {
      throw new UserInputError('Model returned an empty session name');
    }
    const trimmed = title.slice(0, AUTO_NAME_MAX_LENGTH);
    if (options.persist === true) manager.appendSessionInfo(trimmed);
    return { title: trimmed };
  }

  // ------------------------------------------------------------------
  // 分页（GET /api/sessions/:id/context，docs/02 §6.3）
  // ------------------------------------------------------------------

  async context(id: string, query: SessionContextQuery): Promise<SessionContext | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    return this.buildContext(manager.getEntries(), query.leafId ?? manager.getLeafId(), query);
  }

  // ------------------------------------------------------------------
  // 改名（PATCH /api/sessions/:id；运行中会话由 server 改走命令通道，M2）
  // ------------------------------------------------------------------

  async rename(id: string, name: string): Promise<SessionInfo | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    if (name.trim() === '') throw new UserInputError('Session name cannot be blank');
    manager.appendSessionInfo(name);
    return this.infoFromManager(manager, manager.getEntries());
  }

  // ------------------------------------------------------------------
  // 删除（DELETE /api/sessions/:id，docs/02 §6.2；docs/04 §8-2 server 动工补齐）
  // ------------------------------------------------------------------

  /**
   * 级联删除会话及其全部 subagent 子会话，返回受影响 id（含目标自身，目标在前）。
   * 不存在返回 null。子会话判定：header.parentSession 指向父会话文件路径
   * （agent-session-runtime 以 previousSessionFile 写入），且条目携带子代理
   * 标记（custom 条目的 `customType` 命中 `SUBAGENT_CUSTOM_TYPE`）——fork 子会话
   * 仍是顶层列表项，不在级联范围（docs/02 §3.3）。运行中会话的拦截归 server（409）。
   */
  async delete(id: string): Promise<string[] | null> {
    const infos = await this.listAllSessions(await scanSessionsDir(this.sessionsRoot));
    const target = infos.find((info) => info.id === id);
    if (target === undefined) return null;

    // 按 parentSessionPath 建子链，从目标出发 BFS 收集传递闭包
    const childrenByParent = new Map<string, typeof infos>();
    for (const info of infos) {
      if (info.parentSessionPath === undefined) continue;
      const list = childrenByParent.get(info.parentSessionPath) ?? [];
      list.push(info);
      childrenByParent.set(info.parentSessionPath, list);
    }
    const doomed: typeof infos = [];
    const queue = [target];
    while (queue.length > 0) {
      const current = queue.shift() as (typeof infos)[number];
      for (const child of childrenByParent.get(current.path) ?? []) {
        if (!(await this.isSubagent(child))) continue; // fork 子会话不级联
        doomed.push(child);
        queue.push(child);
      }
    }

    const deletedIds = [target.id, ...doomed.map((info) => info.id)];
    await rm(target.path, { force: true });
    for (const info of doomed) {
      await rm(info.path, { force: true });
    }
    return deletedIds;
  }

  /** 子代理标记检测（custom 条目的 `customType` 命中 `SUBAGENT_CUSTOM_TYPE`） */
  private async isSubagent(info: SdkSessionInfo): Promise<boolean> {
    const manager = SessionManager.open(info.path, this.sessionDir);
    return manager
      .getEntries()
      .some(
        (entry) =>
          entry.type === 'custom' &&
          (entry as { customType?: string }).customType === SUBAGENT_CUSTOM_TYPE,
      );
  }

  // ------------------------------------------------------------------
  // 工具结果图片惰性读取（GET /api/sessions/:id/entries/:entryId/tool-result-image，
  // docs/02 §6.3；docs/04 §8-3 server 动工补齐）
  // ------------------------------------------------------------------

  /** 二进制图片载荷（server 以 Content-Type: mimeType 直发） */
  async toolResultImage(
    id: string,
    entryId: string,
    blockIndex: number,
  ): Promise<{ data: Uint8Array; mimeType: string } | null> {
    const manager = await this.openById(id);
    if (manager === null) return null;
    const entry = manager.getEntry(entryId);
    if (entry?.type !== 'message' || entry.message.role !== 'toolResult') return null;
    const block = entry.message.content[blockIndex];
    if (block?.type !== 'image') return null;
    return { data: Buffer.from(block.data, 'base64'), mimeType: block.mimeType };
  }

  // ------------------------------------------------------------------
  // 内部
  // ------------------------------------------------------------------

  /** 会话投影 + 项目归一（同一 cwd 只解析一次；resolver 内部另有 60s 缓存） */
  private async enrich(infos: SdkSessionInfo[]): Promise<SessionInfo[]> {
    const cwds = [...new Set(infos.map((info) => info.cwd).filter((cwd) => cwd !== ''))];
    const resolutions = new Map(
      await Promise.all(cwds.map(async (cwd) => [cwd, await this.resolver.resolve(cwd)] as const)),
    );
    return infos.map((info) => {
      const wire = this.toWireInfo(info);
      const resolution = resolutions.get(info.cwd);
      // cwd 为空串（旧会话）→ 不猜项目，分组由客户端回落 cwd
      return resolution === undefined ? wire : { ...wire, ...resolution };
    });
  }

  /**
   * 读取全部会话（scan 的每个项目目录各调一次 SDK）。
   * 不用 `SessionManager.listAll()` 的默认根目录发现：列表与项目清单必须基于
   * **同一次扫描**，否则注入 sessionsRoot 的测试/自定义布局会两边不一致。
   * SDK 单次返回已按 modified 降序，合并后再排一次。
   */
  private async listAllSessions(scan: SessionsDirScan): Promise<SdkSessionInfo[]> {
    const perDir = await Promise.all(
      scan.projects.map((project) =>
        SessionManager.listAll(
          project.dirName === '.' ? this.sessionsRoot : join(this.sessionsRoot, project.dirName),
        ),
      ),
    );
    return perDir.flat().sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  /** 按 id 定位会话文件（复用同一次扫描；M1 无索引，量大后加缓存） */
  private async openById(id: string): Promise<SessionManager | null> {
    const infos = await this.listAllSessions(await scanSessionsDir(this.sessionsRoot));
    const hit = infos.find((info) => info.id === id);
    if (hit === undefined) return null;
    return SessionManager.open(hit.path, this.sessionDir);
  }

  private toWireInfo(info: SdkSessionInfo): SessionInfo {
    return {
      path: info.path,
      id: info.id,
      cwd: info.cwd,
      name: info.name,
      created: info.created.toISOString(),
      modified: info.modified.toISOString(),
      messageCount: info.messageCount,
      firstMessage: info.firstMessage,
    };
  }

  private infoFromManager(manager: SessionManager, entries: SessionEntry[]): SessionInfo {
    const header = manager.getHeader();
    const file = manager.getSessionFile();
    const messages = entries.filter((e) => e.type === 'message');
    const firstUser = messages.find((e) => e.type === 'message' && e.message.role === 'user');
    const firstMessage =
      firstUser !== undefined && firstUser.type === 'message'
        ? userMessageText(firstUser.message)
        : '';
    const timestamps = entries.map((e) => Date.parse(e.timestamp)).filter((t) => !Number.isNaN(t));
    const created = header ? Date.parse(header.timestamp) : Math.min(...timestamps, Date.now());
    const modified = timestamps.length > 0 ? Math.max(...timestamps) : created;
    return {
      path: file ?? '',
      id: manager.getSessionId(),
      cwd: manager.getCwd(),
      name: manager.getSessionName(),
      created: new Date(created).toISOString(),
      modified: new Date(Math.max(modified, created)).toISOString(),
      messageCount: messages.length,
      firstMessage: firstMessage.slice(0, 200),
    };
  }

  /** context 装配 + 分页（before/tail） */
  private buildContext(
    entries: SessionEntry[],
    leafId: string | null | undefined,
    query: Pick<SessionContextQuery, 'before' | 'tail'>,
  ): SessionContext {
    // thinkingLevel/model 沿整条活跃分支取最新值（与页窗口无关）；借 SDK 投影防字段漂移
    const ctx = buildSessionContext(entries, leafId ?? undefined);

    // 分页走原始 parentId 父链（sliceBranchWindow）：历史浏览要「发生过什么」，
    // 不是「模型看到什么」。SDK buildContextEntries 是 LLM 上下文投影，压缩点
    // 之前会被整体折叠成摘要——before 游标落在压缩前条目时失配，向上翻页死路
    // （08ee0ba 修复）
    const tail = Math.min(query.tail ?? DEFAULT_TAIL, MAX_TAIL);
    const windowEntries = sliceBranchWindow(entries, leafId, query.before, tail);

    // 平行数组：每个条目经 SDK 逐条投影展开为 0..1 条消息（compaction→分隔条等）
    // 转录 system 消息跳过：它与实时路径同口径（wire 事件层也丢弃），且它不是
    // 对话内容。原始条目仍在 tree 里（树要的是「发生过什么」）。
    const messages: AgentMessage[] = [];
    const entryIds: string[] = [];
    for (const entry of windowEntries) {
      for (const raw of sessionEntryToContextMessages(entry)) {
        if (raw.role === 'system') continue;
        messages.push(toWireAgentMessage(raw));
        entryIds.push(entry.id);
      }
    }

    return {
      messages,
      entryIds,
      thinkingLevel: (ctx.thinkingLevel || 'medium') as ThinkingLevel,
      model: ctx.model ? { provider: ctx.model.provider, modelId: ctx.model.modelId } : null,
      oldestEntryId: windowEntries[0]?.id,
      hasMore: windowEntries[0]?.parentId != null,
    };
  }
}

// ---------------------------------------------------------------------------
// 纯函数工具
// ---------------------------------------------------------------------------

/**
 * tail 预算只计入可见消息（user/assistant + compaction 分隔条）；toolResult 等
 * 以附件形式渲染，不该吃预算——否则工具密集会话一页 50 条可能只剩 1 条用户消息。
 */
function countsTowardTail(entry: SessionEntry): boolean {
  if (entry.type === 'compaction') return true;
  return (
    entry.type === 'message' &&
    (entry.message.role === 'user' || entry.message.role === 'assistant')
  );
}

/** 一页的原始条目下限：可见锚点稀疏的长工具流量段兜底，防单页 payload 失控 */
const MIN_RAW_WINDOW_ENTRIES = 200;
const rawWindowCap = (tail: number) => Math.max(MIN_RAW_WINDOW_ENTRIES, tail * 6);

/**
 * 沿原始 parentId 父链向上取一页历史（不做 compaction 过滤，压缩前条目照常可达）。
 * - 无 before：从 leafId（缺省取末条）向上，凑满 tail 个可见条目为止
 * - 有 before：从其父节点起（excludeLeaf，向上翻页 prepend 不重复）；
 *   条目不在会话中（含 before 即根）→ 空页而非回退到最新窗口
 * 迭代不递归：线性会话父链长度 = 条目数，递归遍历会爆栈。
 */
function sliceBranchWindow(
  entries: SessionEntry[],
  leafId: string | null | undefined,
  before: string | undefined,
  tail: number,
): SessionEntry[] {
  const byId = new Map<string, SessionEntry>(entries.map((entry) => [entry.id, entry]));
  let start: SessionEntry | undefined;
  if (before !== undefined) {
    const anchor = byId.get(before);
    start = anchor?.parentId != null ? byId.get(anchor.parentId) : undefined;
  } else {
    start = leafId ? byId.get(leafId) : entries[entries.length - 1];
  }
  if (start === undefined) return [];

  const chain: SessionEntry[] = [];
  const cap = rawWindowCap(tail);
  let visible = 0;
  let current: SessionEntry | undefined = start;
  while (current !== undefined) {
    chain.push(current);
    if (countsTowardTail(current)) visible += 1;
    if (visible >= tail || chain.length >= cap) break;
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }
  chain.reverse();
  return chain;
}

/** 会话文件指纹：`size:mtimeMs`（与列表指纹同构；无单调性，只比较相等） */
async function fileFingerprint(path: string): Promise<string> {
  const info = await stat(path);
  return `${info.size}:${Math.floor(info.mtimeMs)}`;
}

/** 内存会话并入列表：transient 排在最前，同 id 时以内存态为准 */
function mergeTransient(sessions: SessionInfo[], transient: SessionInfo[]): SessionInfo[] {
  if (transient.length === 0) return sessions;
  const transientIds = new Set(transient.map((session) => session.id));
  return [...transient, ...sessions.filter((session) => !transientIds.has(session.id))];
}

/** 工具参数里表示"文件路径"的键名（各家工具叫法不同，逐个认） */
const PATH_ARGUMENT_KEYS = new Set([
  'path',
  'filePath',
  'file_path',
  'filepath',
  'notebook_path',
  'targetFile',
]);

/** 从工具参数里递归抽路径（只认上表键名；深度有界，防病态结构） */
function collectPathArguments(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || typeof value !== 'object' || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPathArguments(item, out, depth + 1);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && PATH_ARGUMENT_KEYS.has(key) && item.trim() !== '') {
      out.add(item);
    } else if (typeof item === 'object') {
      collectPathArguments(item, out, depth + 1);
    }
  }
}

/** auto-name 的输入：前几条 user/assistant 文本，截断到有界长度 */
function autoNameExcerpt(entries: readonly SessionEntry[]): string {
  const parts: string[] = [];
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const message = entry.message;
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
            .map((block) => block.text)
            .join(' ');
    if (text.trim() === '') continue;
    parts.push(`${message.role}: ${text.trim()}`);
    if (parts.join('\n').length > 4000) break;
  }
  return parts.join('\n').slice(0, 4000);
}

function userMessageText(message: SdkAgentMessage): string {
  if (message.role !== 'user') return '';
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ');
}

/** 冷会话统计（对齐 SDK AgentSession.getSessionStats 聚合口径） */
export function computeStats(
  entries: SessionEntry[],
  sessionId: string,
  sessionFile?: string,
): SessionStatsInfo {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;
  let toolResults = 0;
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  let cost = 0;

  for (const entry of entries) {
    // 用量条目（SDK ≥ 0.86）：不进上下文但计费，必须计入 token / cost，
    // 否则与 SDK `/session` 的口径不一致（prompt 缓存预热是典型例子）
    if (entry.type === 'usage') {
      tokens.input += entry.usage.input;
      tokens.output += entry.usage.output;
      tokens.cacheRead += entry.usage.cacheRead;
      tokens.cacheWrite += entry.usage.cacheWrite;
      cost += entry.usage.cost.total;
      continue;
    }
    if (entry.type !== 'message') continue;
    const message = entry.message;
    if (message.role === 'user') userMessages += 1;
    else if (message.role === 'assistant') {
      assistantMessages += 1;
      toolCalls += message.content.filter((b) => b.type === 'toolCall').length;
      tokens.input += message.usage.input;
      tokens.output += message.usage.output;
      tokens.cacheRead += message.usage.cacheRead;
      tokens.cacheWrite += message.usage.cacheWrite;
      cost += message.usage.cost.total;
    } else if (message.role === 'toolResult') {
      toolResults += 1;
    }
  }
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;

  return {
    sessionId,
    sessionFile,
    userMessages,
    assistantMessages,
    toolCalls,
    toolResults,
    totalMessages: userMessages + assistantMessages + toolResults,
    tokens,
    cost,
  };
}
