import type { ProjectInfo } from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from '../src/lib/prefs';
import { findProjectByCwd, projectCwd, resolveWorkspaceKey } from '../src/lib/workspace';

function project(overrides: Partial<ProjectInfo> & { projectKey: string }): ProjectInfo {
  return {
    projectRoot: `/repos/${overrides.projectKey}`,
    cwd: `/repos/${overrides.projectKey}`,
    cwds: [`/repos/${overrides.projectKey}`],
    sessionCount: 1,
    lastModified: '2026-09-23T10:00:00.000Z',
    isGit: true,
    ...overrides,
  };
}

// 服务端按 lastModified 降序给（ADR-0008），首项 = 最近一次对话的文件夹空间
const projects: ProjectInfo[] = [
  project({ projectKey: 'pi-boat' }),
  project({
    projectKey: 'pi-web',
    projectRoot: '/repos/pi-web',
    cwd: '/repos/pi-web/app',
    cwds: ['/repos/pi-web/app', '/repos/pi-web'],
  }),
];

describe('resolveWorkspaceKey', () => {
  it('没有记住的选择时，默认打开最近一次对话的文件夹空间（首项）', () => {
    expect(resolveWorkspaceKey(projects, null)).toBe('pi-boat');
  });

  it('记住的选择仍然存在时优先（用户显式选过不被覆盖）', () => {
    expect(resolveWorkspaceKey(projects, 'pi-web')).toBe('pi-web');
  });

  it('记住的选择已失效（项目删了）时回落到最近的项目', () => {
    expect(resolveWorkspaceKey(projects, 'gone')).toBe('pi-boat');
  });

  it('项目清单为空时返回 null（hero 用路径输入兜底）', () => {
    expect(resolveWorkspaceKey([], null)).toBeNull();
  });
});

describe('findProjectByCwd', () => {
  it('cwd 命中项目代表目录', () => {
    expect(findProjectByCwd(projects, '/repos/pi-boat')?.projectKey).toBe('pi-boat');
  });

  it('命中同一仓库的子目录（ADR-0008 归一语义）', () => {
    expect(findProjectByCwd(projects, '/repos/pi-web/app')?.projectKey).toBe('pi-web');
  });

  it('忽略尾部斜杠与空白', () => {
    expect(findProjectByCwd(projects, '  /repos/pi-boat/  ')?.projectKey).toBe('pi-boat');
  });

  it('命中 worktree / 项目根（projectRoot 与 cwd 不同时）', () => {
    const withWorktree = [
      project({
        projectKey: 'repo',
        projectRoot: '/repos/repo',
        cwd: '/repos/repo-feature',
        cwds: ['/repos/repo-feature'],
      }),
    ];
    expect(findProjectByCwd(withWorktree, '/repos/repo')?.projectKey).toBe('repo');
  });

  it('不认识的路径返回 null（会话仍可建，只是不切空间）', () => {
    expect(findProjectByCwd(projects, '/tmp/elsewhere')).toBeNull();
    expect(findProjectByCwd(projects, '')).toBeNull();
  });
});

describe('projectCwd', () => {
  it('按 key 取代表 cwd；未知 key / null 返回 null', () => {
    expect(projectCwd(projects, 'pi-web')).toBe('/repos/pi-web/app');
    expect(projectCwd(projects, 'gone')).toBeNull();
    expect(projectCwd(projects, null)).toBeNull();
  });
});

describe('clampSidebarWidth', () => {
  it('夹在 200–440（原型 makeDrag 的上下限）并取整', () => {
    expect(clampSidebarWidth(120)).toBe(SIDEBAR_MIN_PX);
    expect(clampSidebarWidth(999)).toBe(SIDEBAR_MAX_PX);
    expect(clampSidebarWidth(301.6)).toBe(302);
    expect(clampSidebarWidth(Number.NaN)).toBe(284);
  });
});
