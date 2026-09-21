import {
  buildSessionContext,
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
import { type SdkAgentMessage, toWireAgentMessage } from '../events/wire-message';

/**
 * 只读会话浏览（docs/01 §3.1 SessionReadService，M1 子集：列表/详情/分页/改名）。
 *
 * 为什么需要：SDK 的 SessionManager 只有裸的 .jsonl 读取原语；浏览视图需要的
 * 分页截断、详情装配、统计摘要、运行态合并、改名写入都没有现成入口。
 *
 * 相对 SDK 新增：list / search（客户端过滤）、detail（tail 分页 + toolCall
 * 归一化装配）、context（上下文窗口装配）、rename、computeStats。
 * 数据源是 pi 共享的 .jsonl 会话文件（~/.pi/agent/sessions 及项目目录），
 * 与 pi CLI 天然互见。文件加载路径的 toolCall 归一化由 protocol 的
 * normalizeToolCalls() 负责（两条路径共用，AGENTS.md）。
 *
 * M1 不做：导出 HTML / auto-name（需 LLM）/ 删除级联（M2）、搜索索引（M3）。
 */

export interface SessionReadOptions {
  /** 会话文件目录（缺省 = SDK 默认 ~/.pi/agent/sessions；测试注入临时目录） */
  sessionDir?: string;
  /** 运行中会话查询（详情合并运行时状态用），缺省恒 false */
  isRunning?: (sessionId: string) => boolean;
}

const DEFAULT_TAIL = 50;
const MAX_TAIL = 1000;

export class SessionReadService {
  private readonly sessionDir?: string;
  private readonly isRunning: (sessionId: string) => boolean;

  constructor(options: SessionReadOptions = {}) {
    this.sessionDir = options.sessionDir;
    this.isRunning = options.isRunning ?? (() => false);
  }

  // ------------------------------------------------------------------
  // 列表（GET /api/sessions，docs/02 §6.1）
  // ------------------------------------------------------------------

  async list(): Promise<SessionInfo[]> {
    const infos = await SessionManager.listAll(this.sessionDir);
    return infos.map((info) => this.toWireInfo(info));
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
    if (name.trim() === '') throw new Error('Session name cannot be blank');
    manager.appendSessionInfo(name);
    return this.infoFromManager(manager, manager.getEntries());
  }

  // ------------------------------------------------------------------
  // 内部
  // ------------------------------------------------------------------

  /** 按 id 定位会话文件（listAll 扫描 + path 匹配；M1 无索引，量大后加缓存） */
  private async openById(id: string): Promise<SessionManager | null> {
    const infos = await SessionManager.listAll(this.sessionDir);
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
