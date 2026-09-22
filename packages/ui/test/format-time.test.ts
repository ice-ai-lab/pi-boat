import { describe, expect, it } from 'vitest';
import { formatRelativeTime, groupByDay } from '../src/lib/format';

/**
 * 会话列表的时间与分组（原型 `.session-item .sm` + `list-label`）。
 * 基准时间固定注入 `now`——跨天判定用**本地日历日**，所以这里也用本地时间构造。
 */
const now = new Date('2026-09-23T14:30:00');

function at(local: string): string {
  return new Date(local).toISOString();
}

describe('formatRelativeTime', () => {
  it('今天：刚刚 / N 分钟前 / N 小时前', () => {
    expect(formatRelativeTime(at('2026-09-23T14:29:40'), now)).toBe('刚刚');
    expect(formatRelativeTime(at('2026-09-23T14:09:00'), now)).toBe('21 分钟前');
    expect(formatRelativeTime(at('2026-09-23T10:30:00'), now)).toBe('4 小时前');
  });

  it('昨天：带时刻', () => {
    expect(formatRelativeTime(at('2026-09-22T17:42:00'), now)).toBe('昨天 17:42');
  });

  it('更早：同年 MM-DD，跨年 YYYY-MM-DD', () => {
    expect(formatRelativeTime(at('2026-09-18T09:00:00'), now)).toBe('09-18');
    expect(formatRelativeTime(at('2025-12-31T09:00:00'), now)).toBe('2025-12-31');
  });

  it('跨月跨年按日历日而不是 24 小时算（23:59 → 次日 00:01 是「昨天」）', () => {
    const midnight = new Date('2026-10-01T00:05:00');
    expect(formatRelativeTime(at('2026-09-30T23:59:00'), midnight)).toBe('昨天 23:59');
  });

  it('非法时间回落为 —（磁盘 mtime 容错优先，不抛）', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('—');
  });
});

describe('groupByDay', () => {
  it('切成 今天 / 昨天 / 更早，空组不产出且顺序固定', () => {
    const items = [
      { id: 'a', modified: at('2026-09-23T14:00:00') },
      { id: 'b', modified: at('2026-09-23T09:00:00') },
      { id: 'c', modified: at('2026-09-22T09:00:00') },
      { id: 'd', modified: at('2026-09-01T09:00:00') },
    ];
    const groups = groupByDay(items, now);
    expect(groups.map((group) => group.label)).toEqual(['今天', '昨天', '更早']);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['a', 'b'],
      ['c'],
      ['d'],
    ]);
  });

  it('只有今天时只产出一组（侧栏据此不重复画标题）', () => {
    const groups = groupByDay([{ id: 'a', modified: at('2026-09-23T14:00:00') }], now);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('今天');
  });

  it('非法 modified 归「更早」而不是丢弃', () => {
    const groups = groupByDay([{ id: 'x', modified: 'bad' }], now);
    expect(groups).toEqual([{ label: '更早', items: [{ id: 'x', modified: 'bad' }] }]);
  });
});
