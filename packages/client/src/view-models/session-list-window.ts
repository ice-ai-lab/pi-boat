import type { SessionInfo } from '@ice-ai/protocol';

/**
 * 会话列表的分组与窗口化（ui 渲染的唯一布局来源）：
 * - 分组：`今天 / 昨天 / 更早`（本地日历日）
 * - 窗口化：把「分组头 + 会话行」展平成前缀和，只挂可视切片 + overscan
 *
 * 与 chat-lazy-load 的滚动距离保持是两套不同用途（这里是「少挂 DOM」，那里是「加内容不跳」）。
 */

/** 会话行固定高（渲染必须与此一致，否则窗口算错） */
export const SESSION_LIST_ITEM_HEIGHT = 54;
/** 分组头固定高（比会话行矮，但带分隔线与字重，保证与列表有区分度） */
export const SESSION_LIST_HEADER_HEIGHT = 34;
/** 可视区上下各多挂载的行数 */
export const SESSION_LIST_OVERSCAN = 8;

export type SessionListGroupKey = 'today' | 'yesterday' | 'earlier';

export interface SessionListGroup {
  key: SessionListGroupKey;
  sessions: SessionInfo[];
}

const DAY_MS = 86_400_000;

/** 本地日历日的零点时间戳（跨时区/夏令时都按本地日历切） */
function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 按本地日历日分组：今天 / 昨天 / 更早；保持传入顺序，空组不产出 */
export function groupSessionsByDay(
  sessions: readonly SessionInfo[],
  now: Date = new Date(),
): SessionListGroup[] {
  const today = startOfLocalDay(now);
  const yesterday = today - DAY_MS;
  const buckets: Record<SessionListGroupKey, SessionInfo[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const session of sessions) {
    const at = new Date(session.modified);
    const day = Number.isNaN(at.getTime()) ? today - 2 * DAY_MS : startOfLocalDay(at);
    const key: SessionListGroupKey =
      day >= today ? 'today' : day >= yesterday ? 'yesterday' : 'earlier';
    buckets[key].push(session);
  }
  return (['today', 'yesterday', 'earlier'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, sessions: buckets[key] }));
}

export interface SessionListHeaderRow {
  kind: 'header';
  key: string;
  group: SessionListGroupKey;
  top: number;
  height: number;
}

export interface SessionListSessionRow {
  kind: 'session';
  key: string;
  session: SessionInfo;
  top: number;
  height: number;
}

export type SessionListRow = SessionListHeaderRow | SessionListSessionRow;

/** 展平分组并算好每行的 `top` 与列表总高（绝对定位 + 窗口化用） */
export function buildSessionListRows(groups: readonly SessionListGroup[]): {
  rows: SessionListRow[];
  height: number;
} {
  const rows: SessionListRow[] = [];
  let top = 0;
  for (const group of groups) {
    rows.push({
      kind: 'header',
      key: `header:${group.key}`,
      group: group.key,
      top,
      height: SESSION_LIST_HEADER_HEIGHT,
    });
    top += SESSION_LIST_HEADER_HEIGHT;
    for (const session of group.sessions) {
      rows.push({
        kind: 'session',
        key: session.id,
        session,
        top,
        height: SESSION_LIST_ITEM_HEIGHT,
      });
      top += SESSION_LIST_ITEM_HEIGHT;
    }
  }
  return { rows, height: top };
}

/** 返回应挂载的行下标切片（含 overscan；focused 会话强制保留，防行内重命名被卸载） */
export function getSessionListVisibleRows(
  rows: readonly SessionListRow[],
  scrollTop: number,
  viewportHeight: number,
  focusedSessionKey: string | null = null,
): number[] {
  if (rows.length === 0) return [];
  const overscanPx = SESSION_LIST_OVERSCAN * SESSION_LIST_ITEM_HEIGHT;
  const min = scrollTop - overscanPx;
  const max = scrollTop + (viewportHeight || 600) + overscanPx;
  const indices: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === undefined) continue;
    if (row.top + row.height < min) continue;
    if (row.top > max) break;
    indices.push(index);
  }
  if (
    focusedSessionKey !== null &&
    !indices.some((index) => rows[index]?.key === focusedSessionKey)
  ) {
    const focused = rows.findIndex((row) => row.key === focusedSessionKey);
    if (focused >= 0) indices.push(focused);
  }
  return indices;
}
