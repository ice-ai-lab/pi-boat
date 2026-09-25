import type { SessionInfo } from '@ice-ai/protocol';

/**
 * 会话列表的展示派生（A 类移植自 pi-web lib/project-groups.ts + lib/session-title.ts 的展示部分）。
 * LLM 生成标题（pi-web buildTitleRequest）不走这里——本仓由后端 `/auto-name` 负责。
 */

/** 会话所属工作区的稳定标识：projectKey → projectRoot → cwd（worktree 共享同一槽位） */
export function workspaceKeyOf(session: {
  cwd: string;
  projectRoot?: string | null;
  projectKey?: string | null;
}): string {
  return session.projectKey ?? session.projectRoot ?? session.cwd;
}

export interface RecentProject {
  /** 稳定标识（比较与 Map 键用） */
  key: string;
  /** 展示与文件系统操作用的原始路径 */
  root: string;
  /** 该项目的代表 cwd（最近有活动的） */
  cwd: string;
  /** 该项目最新活动时间（ISO） */
  lastModified: string;
  sessionCount: number;
}

/** 按活动时间排序、按稳定 key 去重的项目清单（侧栏分组头用） */
export function getRecentProjects(sessions: readonly SessionInfo[]): RecentProject[] {
  const latest = new Map<string, RecentProject>();
  for (const session of sessions) {
    const root = session.projectRoot ?? session.cwd;
    if (root === undefined || root.length === 0) continue;
    const key = workspaceKeyOf(session);
    const previous = latest.get(key);
    if (previous === undefined) {
      latest.set(key, {
        key,
        root,
        cwd: session.cwd,
        lastModified: session.modified,
        sessionCount: 1,
      });
      continue;
    }
    previous.sessionCount += 1;
    if (session.modified > previous.lastModified) {
      previous.lastModified = session.modified;
      previous.cwd = session.cwd;
    }
  }
  return [...latest.values()].sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}

/** 项目 → 运行中/未读计数（分组头徽标） */
export function getProjectActivity(
  sessions: readonly SessionInfo[],
  runningSessionIds: ReadonlySet<string>,
): Map<string, { running: number; total: number }> {
  const counts = new Map<string, { running: number; total: number }>();
  for (const session of sessions) {
    const key = workspaceKeyOf(session);
    const entry = counts.get(key) ?? { running: 0, total: 0 };
    entry.total += 1;
    if (runningSessionIds.has(session.id)) entry.running += 1;
    counts.set(key, entry);
  }
  return counts;
}

export function sessionsForProject(
  sessions: readonly SessionInfo[],
  projectKey: string,
): SessionInfo[] {
  return sessions.filter((session) => workspaceKeyOf(session) === projectKey);
}

/** 会话展示标题：用户命名 → 首条消息摘要 → 短 id */
export function sessionDisplayTitle(session: {
  id: string;
  name?: string | null;
  firstMessage?: string | null;
}): string {
  const name = session.name?.trim();
  if (name !== undefined && name.length > 0) return name;
  const first = session.firstMessage?.trim().replace(/\s+/g, ' ');
  if (first !== undefined && first.length > 0) {
    return firstNameLine(first);
  }
  return session.id.slice(0, 8);
}

function firstNameLine(text: string): string {
  const line = text.split('\n')[0] ?? text;
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 相对时间（今天 12:30 / 昨天 / 3 天前 / 2026-09-20）；now 可注入便于测试 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diff = now - time;
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 按项目分组后的列表结构（侧栏渲染输入） */
export function groupSessionsByProject(
  sessions: readonly SessionInfo[],
): { project: RecentProject; sessions: SessionInfo[] }[] {
  return getRecentProjects(sessions).map((project) => ({
    project,
    sessions: sessionsForProject(sessions, project.key).sort((a, b) =>
      b.modified.localeCompare(a.modified),
    ),
  }));
}

/** 搜索过滤（客户端侧，用于已加载列表的即时筛；服务端搜索另走 /sessions/search） */
export function filterSessions(sessions: readonly SessionInfo[], query: string): SessionInfo[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...sessions];
  return sessions.filter((session) => {
    const haystack = [session.name ?? '', session.cwd, session.id, session.branch ?? '']
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}
