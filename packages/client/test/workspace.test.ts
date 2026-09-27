import type { SessionInfo } from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import {
  captureScrollDistance,
  getLiveFollowAttached,
  getNextVisibleCount,
  getVisibleRenderWindow,
  isScrollAtTail,
  restoreScrollTop,
  shouldShowScrollToLatest,
} from '../src/view-models/chat-lazy-load';
import {
  formatRelativeTime,
  getProjectActivity,
  projectKeyForCwd,
  sessionDisplayTitle,
  workspaceKeyOf,
} from '../src/view-models/session-list';
import {
  buildSessionListRows,
  getSessionListVisibleRows,
  groupSessionsByDay,
  SESSION_LIST_HEADER_HEIGHT,
  SESSION_LIST_ITEM_HEIGHT,
} from '../src/view-models/session-list-window';

const session = (overrides: Partial<SessionInfo> & { id: string }): SessionInfo =>
  ({
    cwd: '/repo',
    created: '2026-09-01T00:00:00.000Z',
    modified: '2026-09-01T00:00:00.000Z',
    messageCount: 1,
    ...overrides,
  }) as SessionInfo;

describe('项目活动统计（按项目取数后：running 带 cwd、unread 靠归属索引）', () => {
  const projects = [
    { projectKey: 'repo', projectRoot: '/repo', cwds: ['/repo', '/repo/a', '/repo/b'] },
    { projectKey: 'other', projectRoot: '/other', cwds: ['/other'] },
  ];

  it('projectKeyForCwd 命中代表 cwd 与任一子目录/worktree；未知 cwd 回 null', () => {
    expect(projectKeyForCwd(projects, '/repo')).toBe('repo');
    expect(projectKeyForCwd(projects, '/repo/a')).toBe('repo');
    expect(projectKeyForCwd(projects, '/other')).toBe('other');
    expect(projectKeyForCwd(projects, '/elsewhere')).toBeNull();
    expect(projectKeyForCwd(projects, '')).toBeNull();
  });

  it('running 按 cwd 归到项目（跨项目可见，不依赖已加载的列表）', () => {
    const activity = getProjectActivity({
      projects,
      running: [
        { id: 'a', cwd: '/repo/a' },
        { id: 'b', cwd: '/repo' },
        { id: 'c', cwd: '/other' },
        { id: 'd', cwd: '/never-seen' },
      ],
      unread: new Set(),
      sessionProjects: new Map(),
    });
    expect(activity.get('repo')).toEqual({ running: 2, unread: 0 });
    expect(activity.get('other')).toEqual({ running: 1, unread: 0 });
  });

  it('unread 靠「会话 → 项目」索引归位；索引里没有的会话不计入任何项目', () => {
    const activity = getProjectActivity({
      projects,
      running: [],
      // sessionProjects 是会话结束那一刻记下的归属（那时它还在 runningSessions 里）
      unread: new Set(['a', 'c', 'unknown']),
      sessionProjects: new Map([
        ['a', 'repo'],
        ['c', 'other'],
      ]),
    });
    expect(activity.get('repo')).toEqual({ running: 0, unread: 1 });
    expect(activity.get('other')).toEqual({ running: 0, unread: 1 });
    expect(activity.size).toBe(2);
  });

  it('workspaceKeyOf 回退顺序：projectKey → projectRoot → cwd', () => {
    expect(workspaceKeyOf({ cwd: '/x', projectKey: 'k', projectRoot: '/r' })).toBe('k');
    expect(workspaceKeyOf({ cwd: '/x', projectRoot: '/r' })).toBe('/r');
    expect(workspaceKeyOf({ cwd: '/x' })).toBe('/x');
  });
});

describe('session 展示派生', () => {
  it('标题优先级：命名 → 首条消息（截断）→ 短 id', () => {
    expect(sessionDisplayTitle({ id: 'abc12345', name: '修复构建' })).toBe('修复构建');
    expect(sessionDisplayTitle({ id: 'abc12345', name: '  ' })).toBe('abc12345');
    expect(sessionDisplayTitle({ id: 'abc12345', firstMessage: '帮我看看这个 bug' })).toBe(
      '帮我看看这个 bug',
    );
    const long = 'x'.repeat(100);
    expect(sessionDisplayTitle({ id: 'abc12345', firstMessage: long })).toHaveLength(61); // 60 + …
    expect(sessionDisplayTitle({ id: 'abcdefghij' })).toBe('abcdefgh');
  });

  it('相对时间分级（now 注入）', () => {
    const now = Date.parse('2026-09-27T12:00:00.000Z');
    expect(formatRelativeTime('2026-09-27T11:59:40.000Z', now)).toBe('刚刚');
    expect(formatRelativeTime('2026-09-27T11:45:00.000Z', now)).toBe('15 分钟前');
    expect(formatRelativeTime('2026-09-27T09:00:00.000Z', now)).toBe('3 小时前');
    expect(formatRelativeTime('2026-09-25T12:00:00.000Z', now)).toBe('2 天前');
    expect(formatRelativeTime('2026-09-01T12:00:00.000Z', now)).toBe('2026-09-01');
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });
});

describe('session-list-window：分组与窗口化', () => {
  const now = new Date('2026-09-27T12:00:00');
  const at = (iso: string, id: string) => session({ id, modified: iso });

  it('按本地日历日分组：今天 / 昨天 / 更早', () => {
    const groups = groupSessionsByDay(
      [
        at('2026-09-27T08:00:00', 'a'),
        at('2026-09-26T23:00:00', 'b'),
        at('2026-09-20T10:00:00', 'c'),
      ],
      now,
    );
    expect(groups.map((group) => group.key)).toEqual(['today', 'yesterday', 'earlier']);
    expect(groups.map((group) => group.sessions.map((s) => s.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('空组不产出；未知时间归「更早」', () => {
    expect(groupSessionsByDay([at('2026-09-27T08:00:00', 'a')], now).map((g) => g.key)).toEqual([
      'today',
    ]);
    expect(groupSessionsByDay([session({ id: 'x', modified: 'not-a-date' })], now)[0]?.key).toBe(
      'earlier',
    );
  });

  it('展平为行：分组头 + 会话行，前缀和与总高一致', () => {
    const { rows, height } = buildSessionListRows(
      groupSessionsByDay([at('2026-09-27T08:00:00', 'a'), at('2026-09-26T08:00:00', 'b')], now),
    );
    expect(rows.map((row) => row.kind)).toEqual(['header', 'session', 'header', 'session']);
    expect(rows[0]?.top).toBe(0);
    expect(rows[1]?.top).toBe(SESSION_LIST_HEADER_HEIGHT);
    expect(rows[2]?.top).toBe(SESSION_LIST_HEADER_HEIGHT + SESSION_LIST_ITEM_HEIGHT);
    expect(height).toBe(SESSION_LIST_HEADER_HEIGHT * 2 + SESSION_LIST_ITEM_HEIGHT * 2);
  });

  it('窗口化：只挂可视 + overscan；focused 会话强制保留', () => {
    const groups = groupSessionsByDay(
      Array.from({ length: 200 }, (_, index) =>
        at(new Date(now.getTime() - index * 86_400_000).toISOString(), `s${index}`),
      ),
      now,
    );
    const { rows, height } = buildSessionListRows(groups);
    const visible = getSessionListVisibleRows(rows, 0, 600);
    expect(visible[0]).toBe(0);
    expect(visible.length).toBeLessThan(40);
    expect(height).toBeGreaterThan(600);

    const scrolled = getSessionListVisibleRows(rows, height - 600, 600);
    expect(scrolled[scrolled.length - 1]).toBe(rows.length - 1);
    expect(getSessionListVisibleRows(rows, height - 600, 600, 's0')).toContain(1);
  });

  it('空列表', () => {
    const { rows, height } = buildSessionListRows([]);
    expect(rows).toEqual([]);
    expect(height).toBe(0);
    expect(getSessionListVisibleRows(rows, 0, 600)).toEqual([]);
  });
});

describe('chat-lazy-load：滚动保持与吸附', () => {
  it('可见窗口从尾部往前取', () => {
    expect(getVisibleRenderWindow(10, 50)).toEqual({ startIndex: 0, hasMore: false });
    expect(getVisibleRenderWindow(100, 50)).toEqual({ startIndex: 50, hasMore: true });
    expect(getNextVisibleCount(50)).toBe(100);
  });

  it('前插内容后按「距底部距离」还原视口', () => {
    const distance = captureScrollDistance(1000, 400); // 距底 600
    expect(distance).toBe(600);
    expect(restoreScrollTop(1500, distance)).toBe(900); // 新增 500 高 → 视口不动
  });

  it('贴底判定与吸附推进', () => {
    expect(isScrollAtTail(500, 500, 1000)).toBe(true);
    expect(isScrollAtTail(400, 500, 1000)).toBe(false);
    // 上滚立即脱离
    expect(getLiveFollowAttached(true, 500, 400, 500, 1000)).toBe(false);
    // 未吸附但向下进入 96px 重吸区
    expect(getLiveFollowAttached(false, 300, 420, 500, 1000)).toBe(true);
    // 吸附中继续下行保持吸附
    expect(getLiveFollowAttached(true, 400, 450, 500, 1000)).toBe(true);
  });

  it('回到底部按钮：无溢出不显示', () => {
    expect(shouldShowScrollToLatest(0, 600, 600)).toBe(false);
    expect(shouldShowScrollToLatest(0, 600, 2000)).toBe(true);
    expect(shouldShowScrollToLatest(1400, 600, 2000)).toBe(false);
  });
});
