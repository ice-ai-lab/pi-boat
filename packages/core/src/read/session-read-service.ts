import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { open, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildSessionContext,
  getAgentDir,
  type SessionInfo as SdkSessionInfo,
  type SessionEntry,
  SessionManager,
  sessionEntryToContextMessages,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentMessage,
  ProjectInfo,
  ProjectsResponse,
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
import type { ProjectResolution } from './project-resolver';
import { ProjectResolver } from './project-resolver';

/**
 * 只读会话浏览（docs/01 §3.1 SessionReadService，M1 子集：列表/详情/分页/改名）。
 *
 * 为什么需要：SDK 的 SessionManager 只有裸的 .jsonl 读取原语；浏览视图需要的
 * 分页截断、详情装配、统计摘要、运行态合并、改名写入都没有现成入口。
 *
 * 相对 SDK 新增：list / search / listProjects（项目分组）/ detail（tail 分页装配）、
 * context（上下文窗口装配）、rename、computeStats。
 * 数据源是 pi 共享的 .jsonl 会话文件（~/.pi/agent/sessions 及项目目录），
 * 与 pi CLI 天然互见。文件存储的 toolCall 本就是 {id, name, arguments} 形状，
 * 无需归一化；流式路径的双字段补齐在 core 投影层完成（events/wire-event.ts）。
 *
 * 性能分层（ADR-0008）：会话目录指纹（每文件 size+mtime）成本 ~0.1ms，是全量列表
 * 的缓存键；项目清单只读目录元数据 + 每目录一次首行头读取，不解析会话正文。
 *
 * M1 不做：导出 HTML / auto-name（需 LLM）/ 搜索索引（M3）、deferMedia 占位符
 * （图片惰性加载的 wire 形状待 protocol 定稿后再接，目前历史图片全文直发）。
 */

/**
 * 项目解析器最小契约：默认实现为 ProjectResolver；测试可注入假实现以避开 git 子进程
 * （第二个真实用例：dev/test 两套环境）
 */
export interface ProjectResolverLike {
  resolve(cwd: string): Promise<ProjectResolution>;
  clear(): void;
}

export interface SessionReadOptions {
  /** 会话文件目录（缺省 = SDK 默认 ~/.pi/agent/sessions；测试注入临时目录） */
  sessionDir?: string;
  /** 会话根目录（其下每项目一子目录，用于项目清单扫描）；缺省 = sessionDir ?? SDK 默认 */
  sessionsRoot?: string;
  /** 运行中会话查询（详情合并运行时状态用），缺省恒 false */
  isRunning?: (sessionId: string) => boolean;
  /** 项目解析器（缓存 git 归一结果）；测试可注入以避开真实 git 子进程 */
  resolver?: ProjectResolverLike;
}

/** GET /api/sessions 的查询语义（rest/sessions 的 SessionListQuery） */
export interface SessionListOptions {
  /** 跳过后端列表缓存并清空项目解析缓存（?force=1） */
  force?: boolean;
  /** 只返回该项目的会话（ProjectInfo.projectKey） */
  projectKey?: string;
}

const DEFAULT_TAIL = 50;
const MAX_TAIL = 1000;
/** 首行头最大读取字节（SessionHeader 极小，8KB 足够且不会因多字节字符截断出问题） */
const HEADER_READ_BYTES = 8192;

export class SessionReadService {
  private readonly sessionDir?: string;
  private readonly sessionsRoot: string;
  private readonly isRunning: (sessionId: string) => boolean;
  private readonly resolver: ProjectResolverLike;
  /** 列表缓存：指纹匹配才复用（会话增删/改名/写入都会改变指纹） */
  private listCache: { fingerprint: string; sessions: SessionInfo[] } | null = null;

  constructor(options: SessionReadOptions = {}) {
    this.sessionDir = options.sessionDir;
    this.sessionsRoot =
      options.sessionsRoot ?? options.sessionDir ?? join(getAgentDir(), 'sessions');
    this.isRunning = options.isRunning ?? (() => false);
    this.resolver = options.resolver ?? new ProjectResolver();
  }

  // ------------------------------------------------------------------
  // 列表（GET /api/sessions，docs/02 §6.1）
  // ------------------------------------------------------------------

  async list(options: SessionListOptions = {}): Promise<SessionInfo[]> {
    if (options.force === true) this.invalidate();
    const scan = await this.scan();
    let sessions =
      this.listCache?.fingerprint === scan.fingerprint ? this.listCache.sessions : null;
    if (sessions === null) {
      sessions = await this.enrich(await this.listAllSessions(scan));
      this.listCache = { fingerprint: scan.fingerprint, sessions };
    }
    const filtered =
      options.projectKey === undefined
        ? sessions
        : sessions.filter((session) => session.projectKey === options.projectKey);
    return filtered;
  }

  /** 会话目录指纹（GET /api/sessions 的 listFingerprint）：回答“磁盘侧列表内容变了吗” */
  async listFingerprint(): Promise<string> {
    return (await this.scan()).fingerprint;
  }

  /**
   * 项目清单（GET /api/projects，ADR-0008）：O(项目数) 的目录元数据扫描 +
   * 每目录一次首行头读取；不解析会话正文，因此不分页也便宜。
   *
   * 按 projectKey **合并**多个会话目录——同一仓库的子目录与 worktree 各占一个
   * 目录名，但属于同一个项目（这正是本端点相对“前端按 cwd 分组”的价值）。
   * 空目录与头部读不到 cwd 的目录不出现（见 protocol rest/projects 注释）。
   */
  async listProjects(options: { force?: boolean } = {}): Promise<ProjectsResponse> {
    if (options.force === true) this.resolver.clear();
    const scan = await this.scan();

    // projectKey → 该项目包含的会话目录（每个目录一个 cwd，按 SDK 布局约定）
    const grouped = new Map<string, { resolution: ProjectResolution; dirs: ProjectDirSummary[] }>();
    for (const project of scan.projects) {
      const newest = project.files[0]; // scan 已按文件名（ISO 时间戳前缀）降序
      if (newest === undefined) continue;
      const cwd = await readSessionCwd(newest.path);
      if (cwd === '') continue;
      const resolution = await this.resolver.resolve(cwd);
      const dir: ProjectDirSummary = {
        cwd,
        sessionCount: project.files.length,
        lastModified: new Date(
          Math.max(...project.files.map((file) => file.mtimeMs)),
        ).toISOString(),
      };
      const entry = grouped.get(resolution.projectKey);
      if (entry === undefined) grouped.set(resolution.projectKey, { resolution, dirs: [dir] });
      else entry.dirs.push(dir);
    }

    const projects: ProjectInfo[] = [...grouped.values()].map(({ resolution, dirs }) => {
      dirs.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
      const newestDir = dirs[0] as ProjectDirSummary;
      return {
        ...resolution,
        cwd: newestDir.cwd,
        cwds: dirs.map((dir) => dir.cwd),
        sessionCount: dirs.reduce((total, dir) => total + dir.sessionCount, 0),
        lastModified: newestDir.lastModified,
      };
    });
    projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return { projects, listFingerprint: scan.fingerprint };
  }

  async search(q: string): Promise<SessionInfo[]> {
    const needle = q.toLowerCase();
    const all = await this.list();
    return all.filter(
      (s) =>
        s.firstMessage.toLowerCase().includes(needle) ||
        (s.name?.toLowerCase().includes(needle) ?? false),
    );
  }

  /** 清空缓存（force 路径；项目解析缓存也一并清，对齐 pi-web 的 force 语义） */
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

    return {
      sessionId: manager.getSessionId(),
      filePath: manager.getSessionFile() ?? '',
      info: this.infoFromManager(manager, entries),
      leafId,
      tree,
      context,
      stats,
      // 活跃时长需运行时埋点；冷会话 M1 置 0（协议字段为必填，语义上无运行记录）
      totalActiveMs: 0,
    };
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
   * （agent-session-runtime 以 previousSessionFile 写入），且条目携带 subagent
   * 标记（custom 条目 pi-web:subagent，生态约定）——fork 子会话仍是顶层列表项，
   * 不在级联范围（docs/02 §3.3）。运行中会话的拦截归 server（409）。
   */
  async delete(id: string): Promise<string[] | null> {
    const infos = await this.listAllSessions(await this.scan());
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

  /** subagent 标记检测（pi-web 生态约定：custom 条目 pi-web:subagent） */
  private async isSubagent(info: SdkSessionInfo): Promise<boolean> {
    const manager = SessionManager.open(info.path, this.sessionDir);
    return manager
      .getEntries()
      .some(
        (entry) =>
          entry.type === 'custom' &&
          (entry as { customType?: string }).customType === 'pi-web:subagent',
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

  /**
   * 目录元数据扫描：项目目录 → .jsonl 文件（size/mtime）。不读文件内容，
   * 本机实测 32 会话 / 7 目录约 0.15ms（对比 listAll 解析正文 57–110ms）。
   */
  private async scan(): Promise<SessionsDirScan> {
    let dirents: Dirent[];
    try {
      dirents = await readdir(this.sessionsRoot, { withFileTypes: true });
    } catch {
      return { projects: [], fingerprint: fingerprintOf([]) };
    }

    const projects: ProjectDirScan[] = [];
    for (const dirent of dirents) {
      if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
      const files = await listJsonlFiles(join(this.sessionsRoot, dirent.name));
      projects.push({ dirName: dirent.name, files });
    }
    // 根目录下直接放 .jsonl（注入的单项目目录、历史布局）也算一个项目
    const rootFiles = await statJsonlFiles(
      this.sessionsRoot,
      dirents.filter((d) => d.isFile() && d.name.endsWith('.jsonl')).map((d) => d.name),
    );
    if (rootFiles.length > 0) projects.push({ dirName: '.', files: rootFiles });

    return { projects, fingerprint: fingerprintOf(projects) };
  }

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
    const infos = await this.listAllSessions(await this.scan());
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
    // （对齐 pi-web sliceActiveBranch 的教训，2026-09-21）
    const tail = Math.min(query.tail ?? DEFAULT_TAIL, MAX_TAIL);
    const windowEntries = sliceBranchWindow(entries, leafId, query.before, tail);

    // 平行数组：每个条目经 SDK 逐条投影展开为 0..1 条消息（compaction→分隔条等）
    const messages: AgentMessage[] = [];
    const entryIds: string[] = [];
    for (const entry of windowEntries) {
      for (const raw of sessionEntryToContextMessages(entry)) {
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
// 目录扫描（项目清单与列表指纹共用；不解析会话正文）
// ---------------------------------------------------------------------------

interface SessionFileMeta {
  path: string;
  /** 文件名（ISO 时间戳前缀 ⇒ 字典序 = 时间序） */
  name: string;
  size: number;
  mtimeMs: number;
}

interface ProjectDirScan {
  /** 项目目录名（encoded-cwd，编码有损，仅作诊断/指纹用） */
  dirName: string;
  /** 已按文件名降序（最新在前）；空目录为 [] */
  files: SessionFileMeta[];
}

interface SessionsDirScan {
  projects: ProjectDirScan[];
  fingerprint: string;
}

/** 项目内一个会话目录的摘要（listProjects 合并用） */
interface ProjectDirSummary {
  cwd: string;
  sessionCount: number;
  lastModified: string;
}

async function listJsonlFiles(dir: string): Promise<SessionFileMeta[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.jsonl'));
  } catch {
    return [];
  }
  return statJsonlFiles(dir, names);
}

async function statJsonlFiles(dir: string, names: string[]): Promise<SessionFileMeta[]> {
  const metas = await Promise.all(
    names.map(async (name): Promise<SessionFileMeta | null> => {
      const path = join(dir, name);
      try {
        const info = await stat(path);
        return { path, name, size: info.size, mtimeMs: info.mtimeMs };
      } catch {
        return null; // 扫描期间被删除
      }
    }),
  );
  return metas
    .filter((meta): meta is SessionFileMeta => meta !== null)
    .sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * 指纹：所有项目目录名 + 每个 .jsonl 的 (相对路径, size, mtime)。
 * 目录里新增/删除会话、追加写入、改名都会改变它；空目录的增删也在内。
 */
function fingerprintOf(projects: ProjectDirScan[]): string {
  const parts: string[] = [];
  for (const project of projects) {
    parts.push(`dir:${project.dirName}`);
    for (const file of project.files) {
      parts.push(
        `${project.dirName}/${file.name}\u0000${file.size}\u0000${Math.round(file.mtimeMs)}`,
      );
    }
  }
  parts.sort();
  return createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 16);
}

/** 只读会话文件首行头取 cwd（首行即 SessionHeader）——比 listAll 读全文便宜两个数量级 */
async function readSessionCwd(path: string): Promise<string> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, 'r');
    const buffer = Buffer.allocUnsafe(HEADER_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytesRead).toString('utf8').split('\n', 1)[0] ?? '';
    const parsed: unknown = JSON.parse(firstLine);
    const cwd = (parsed as { cwd?: unknown }).cwd;
    return typeof cwd === 'string' ? cwd : '';
  } catch {
    return ''; // 头部损坏 / 无 cwd（极旧会话）→ 交给上层跳过
  } finally {
    await handle?.close();
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
