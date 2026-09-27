import type { ProjectInfo } from '@ice-ai/protocol';

/**
 * 会话列表的展示派生。
 *
 * 这里曾经有一套「从全量会话列表推导项目清单」的函数（getRecentProjects /
 * sessionsForProject / groupSessionsByProject / filterSessions）——ADR-0008 之后
 * 项目清单由 `/api/projects` 直接给出（服务端 git 归一并按 projectKey 合并子目录/
 * worktree），会话列表也按 `?projectKey=` 取数，客户端不再需要那套推导，已删。
 *
 * 现在只剩「把运行态/未读的会话归到项目上」这一件事——因为会话列表是按项目取的，
 * 客户端手里没有全量列表，必须靠服务端随会话带回的 cwd 来归位。
 */

/** 会话所属工作区的稳定标识：projectKey → projectRoot → cwd（worktree 共享同一槽位） */
export function workspaceKeyOf(session: {
  cwd: string;
  projectRoot?: string | null;
  projectKey?: string | null;
}): string {
  return session.projectKey ?? session.projectRoot ?? session.cwd;
}

/** cwd → 项目键（项目清单的 cwds 索引）；清单里没有该 cwd 时返回 null */
export function projectKeyForCwd(
  projects: readonly Pick<ProjectInfo, 'projectKey' | 'projectRoot' | 'cwds'>[],
  cwd: string,
): string | null {
  if (cwd.length === 0) return null;
  const match = projects.find(
    (project) => project.projectRoot === cwd || project.cwds.includes(cwd),
  );
  return match?.projectKey ?? null;
}

export interface ProjectActivity {
  running: number;
  unread: number;
}

/**
 * 项目 → 运行中/未读计数（侧栏项目行徽标与「其他项目有新活动」圆点）。
 *
 * - running 来自服务端随列表下发的 `runningSessions`（id + cwd）——跨项目可见，
 *   所以即使只加载了一个项目也能在别的项目行上显示运行数（`?projectKey=` 会丢掉
 *   全量列表，这是它的代价的补偿）。
 * - unread 是**客户端**概念（「跑完了你没看」）：会话结束的那一刻它还在 `runningSessions`
 *   里，因此 `sessionProjects` 记下当时的 cwd → projectKey，此刻直接查得到。
 */
export function getProjectActivity(input: {
  projects: readonly Pick<ProjectInfo, 'projectKey' | 'projectRoot' | 'cwds'>[];
  running: readonly { id: string; cwd: string }[];
  unread: ReadonlySet<string>;
  /** 见过的会话 → 项目键（由 runningSessions 的 cwd 与已加载列表累积） */
  sessionProjects: ReadonlyMap<string, string>;
}): Map<string, ProjectActivity> {
  const counts = new Map<string, ProjectActivity>();
  const bump = (key: string, field: keyof ProjectActivity) => {
    const entry = counts.get(key) ?? { running: 0, unread: 0 };
    entry[field] += 1;
    counts.set(key, entry);
  };
  for (const session of input.running) {
    const key = projectKeyForCwd(input.projects, session.cwd);
    if (key !== null) bump(key, 'running');
  }
  for (const id of input.unread) {
    const key = input.sessionProjects.get(id);
    if (key !== undefined) bump(key, 'unread');
  }
  return counts;
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
