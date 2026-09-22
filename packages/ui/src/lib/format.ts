/** 数值/时间的展示格式化（原型 `.num` 各处；纯函数便于单测） */

/** `3.2s` / `1m 12s` / `850ms`（原型 `.disc-dur`） */
export function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes}m ${rest}s`;
}

/** `42.3K` / `1.2M` / `755` */
export function formatTokens(tokens: number | null | undefined): string | null {
  if (tokens === null || tokens === undefined || !Number.isFinite(tokens)) return null;
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** `$0.0123`（成本 < 1 分时保留 4 位有效数字） */
export function formatCost(cost: number | null | undefined): string | null {
  if (cost === null || cost === undefined || !Number.isFinite(cost)) return null;
  if (cost === 0) return '$0';
  // 原型里的量级：$0.0123 / $0.0031——小于 1 元保留 4 位，超过才收敛到 2 位
  return cost < 1 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

/** `16:29`（原型 `.tm` / `.usage-line` 的时间） */
export function formatClock(at: number): string {
  const date = new Date(at);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** 两个时间是否落在同一个**本地**日历日（跨天判定用日历日而非 24h，与用户直觉一致） */
function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 会话列表的时间（原型 `.session-item .sm` 第一段）：`刚刚` / `21 分钟前` / `4 小时前`
 * / `昨天 17:42` / `09-18` / `2025-12-31`。
 * 非法时间串回落到 `—`（不抛：列表项的时间来自磁盘 mtime，容错优先）。
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';

  const deltaMs = now.getTime() - at.getTime();
  if (sameCalendarDay(at, now)) {
    if (deltaMs < 60_000) return '刚刚';
    const minutes = Math.floor(deltaMs / 60_000);
    if (minutes < 60) return `${minutes} 分钟前`;
    return `${Math.floor(minutes / 60)} 小时前`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameCalendarDay(at, yesterday)) return `昨天 ${formatClock(at.getTime())}`;

  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  if (at.getFullYear() === now.getFullYear()) return `${month}-${day}`;
  return `${at.getFullYear()}-${month}-${day}`;
}

/** 会话列表的分组（原型 `list-label`：今天 / 昨天 / 更早） */
export interface DayGroup<T> {
  label: string;
  items: T[];
}

/**
 * 按日历日把列表切成 今天 / 昨天 / 更早 三组（空组不产出，顺序固定）。
 * 入参需按时间**降序**（`GET /api/sessions` 的原样输出就是降序）。
 */
export function groupByDay<T extends { modified: string }>(
  items: T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const today: T[] = [];
  const yesterdayItems: T[] = [];
  const earlier: T[] = [];
  for (const item of items) {
    const at = new Date(item.modified);
    if (Number.isNaN(at.getTime())) earlier.push(item);
    else if (sameCalendarDay(at, now)) today.push(item);
    else if (sameCalendarDay(at, yesterday)) yesterdayItems.push(item);
    else earlier.push(item);
  }

  const buckets: DayGroup<T>[] = [
    { label: '今天', items: today },
    { label: '昨天', items: yesterdayItems },
    { label: '更早', items: earlier },
  ];
  return buckets.filter((bucket) => bucket.items.length > 0);
}
