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
  filterSessions,
  formatRelativeTime,
  getProjectActivity,
  getRecentProjects,
  groupSessionsByProject,
  sessionDisplayTitle,
  sessionsForProject,
  workspaceKeyOf,
} from '../src/view-models/session-list';
import {
  getScrollTopForIndex,
  getSessionListHeight,
  getSessionListIndices,
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

describe('project-groups：分组与活动统计', () => {
  const sessions = [
    session({
      id: 'a',
      cwd: '/repo/a',
      projectKey: 'repo',
      projectRoot: '/repo',
      modified: '2026-09-03T00:00:00.000Z',
    }),
    session({
      id: 'b',
      cwd: '/repo/b',
      projectKey: 'repo',
      projectRoot: '/repo',
      modified: '2026-09-01T00:00:00.000Z',
    }),
    session({
      id: 'c',
      cwd: '/other',
      projectKey: 'other',
      projectRoot: '/other',
      modified: '2026-09-02T00:00:00.000Z',
    }),
  ];

  it('按 projectKey 去重并按活动时间降序，count 为会话数', () => {
    const projects = getRecentProjects(sessions);
    expect(projects.map((p) => p.key)).toEqual(['repo', 'other']);
    expect(projects[0]?.sessionCount).toBe(2);
    // 代表 cwd 取该项目最新活动会话的
    expect(projects[0]?.cwd).toBe('/repo/a');
  });

  it('sessionsForProject 只回该项目会话', () => {
    expect(sessionsForProject(sessions, 'repo').map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('activity 统计运行中数量', () => {
    const activity = getProjectActivity(sessions, new Set(['b']));
    expect(activity.get('repo')).toEqual({ running: 1, total: 2 });
    expect(activity.get('other')).toEqual({ running: 0, total: 1 });
  });

  it('groupSessionsByProject 组内按时间降序', () => {
    const groups = groupSessionsByProject(sessions);
    expect(groups[0]?.sessions.map((s) => s.id)).toEqual(['a', 'b']);
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

  it('filterSessions 命中标题/cwd/id/分支', () => {
    const list = [
      session({ id: 'a', name: 'Deploy fix', cwd: '/repo' }),
      session({ id: 'b', cwd: '/other', branch: 'feat/x' }),
    ];
    expect(filterSessions(list, 'deploy').map((s) => s.id)).toEqual(['a']);
    expect(filterSessions(list, 'feat/x').map((s) => s.id)).toEqual(['b']);
    expect(filterSessions(list, '').length).toBe(2);
  });
});

describe('session-list-window：窗口化切片', () => {
  it('少量会话：全部挂载', () => {
    expect(getSessionListIndices(5, 0, 600)).toEqual([0, 1, 2, 3, 4]);
  });

  it('大量会话：只挂可视 + overscan', () => {
    const indices = getSessionListIndices(1000, 0, 600);
    expect(indices[0]).toBe(0);
    expect(indices.length).toBeLessThan(40);
    expect(indices[indices.length - 1]).toBe((indices.length ?? 1) - 1);
  });

  it('滚动后切片跟随（含上下 overscan）', () => {
    const indices = getSessionListIndices(1000, 54 * 100, 540);
    expect(indices).toContain(100);
    expect(indices[0]).toBe(100 - 8); // 上方 overscan
  });

  it('focusedIndex 强制保留（防行内重命名被卸载）', () => {
    const indices = getSessionListIndices(1000, 54 * 100, 540, 5);
    expect(indices).toContain(5);
  });

  it('空列表与高度/滚动辅助', () => {
    expect(getSessionListIndices(0, 0, 600)).toEqual([]);
    expect(getSessionListHeight(10)).toBe(10 * SESSION_LIST_ITEM_HEIGHT);
    expect(getScrollTopForIndex(12)).toBe(12 * SESSION_LIST_ITEM_HEIGHT);
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
