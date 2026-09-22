import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectReadService } from '../src/read/project-read-service';

/**
 * ProjectReadService 测试（ADR-0008）：sessionsRoot 下每项目一个子目录（SDK 真实
 * 布局），外加一个空目录。注入假 resolver（避开 git 子进程），cwd → 项目键映射可控。
 * 会话列表侧的同键测试见 session-read-service.test.ts（两服务共享 resolver 的
 * 一致性由 server main.ts 装配保证，这里只测分组逻辑本身）。
 */

describe('ProjectReadService.listProjects', () => {
  let root: string;
  const session = (id: string, cwd: string, timestamp: string) =>
    `${JSON.stringify({ type: 'session', version: 3, id, timestamp, cwd })}\n`;

  /** 假解析器：把 cwd 归一到 /repo（模拟 git toplevel 收敛），非 /repo/* 则原样 */
  const fakeResolver = () => {
    const calls: string[] = [];
    return {
      calls,
      resolve: async (cwd: string) => {
        calls.push(cwd);
        const isGit = cwd.startsWith('/repo');
        const projectRoot = isGit ? '/repo' : cwd;
        return {
          projectRoot,
          projectKey: projectRoot,
          isGit,
          ...(isGit ? { branch: 'main' } : {}),
        };
      },
      clear: () => {
        calls.push('<clear>');
      },
    };
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'piboat-projects-'));
    mkdirSync(join(root, '--repo--'), { recursive: true });
    mkdirSync(join(root, '--repo-packages-core--'), { recursive: true });
    mkdirSync(join(root, '--other--'), { recursive: true });
    mkdirSync(join(root, '--empty--'), { recursive: true }); // 空目录：不出现在清单里
    // mtime 显式设定：lastModified 与排序都取自 stat mtime（不解析正文）
    const at = (day: number) => new Date(`2026-01-${day}T10:00:00.000Z`).getTime() / 1000;
    const write = (dir: string, name: string, id: string, cwd: string, day: number) => {
      const path = join(root, dir, name);
      writeFileSync(path, session(id, cwd, `2026-01-${day}T10:00:00.000Z`));
      utimesSync(path, at(day), at(day));
    };
    write('--repo--', '2026-01-15T10-00-00-000Z_aaaa.jsonl', 'aaaa', '/repo', 15);
    write('--repo--', '2026-01-16T10-00-00-000Z_bbbb.jsonl', 'bbbb', '/repo', 16);
    write(
      '--repo-packages-core--',
      '2026-01-10T10-00-00-000Z_cccc.jsonl',
      'cccc',
      '/repo/packages/core',
      10,
    );
    write('--other--', '2026-01-12T10-00-00-000Z_dddd.jsonl', 'dddd', '/other', 12);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const service = (resolver = fakeResolver()) =>
    new ProjectReadService({ sessionsRoot: root, resolver });

  it('按项目目录聚合：子目录与仓库根同键、空目录跳过、按 lastModified 降序', async () => {
    const resolver = fakeResolver();
    const { projects, listFingerprint } = await service(resolver).listProjects();

    expect(projects).toHaveLength(2); // --empty-- 被跳过，--repo-- 与子目录合并成一项
    expect(listFingerprint).toMatch(/^[0-9a-f]{16}$/);
    const [repoProject, otherProject] = projects;
    expect(repoProject).toMatchObject({
      projectKey: '/repo',
      projectRoot: '/repo',
      cwd: '/repo', // 代表 cwd = 最近有活动的目录（01-16）
      cwds: ['/repo', '/repo/packages/core'],
      sessionCount: 3,
      isGit: true,
      branch: 'main',
    });
    // 仓库根（01-16）比子目录（01-10）新 ⇒ 同一项目内取最新会话的 cwd 作代表
    expect(otherProject).toMatchObject({
      projectKey: '/other',
      cwd: '/other',
      sessionCount: 1,
      isGit: false,
    });
    expect(projects.map((p) => p.lastModified)).toEqual(
      [...projects].map((p) => p.lastModified).sort((a, b) => b.localeCompare(a)),
    );
    // cwd 去重后解析（/repo 与 /repo/packages/core 都会走到 resolver）
    expect(new Set(resolver.calls)).toEqual(new Set(['/repo', '/repo/packages/core', '/other']));
  });

  it('force=1 清空项目解析缓存', async () => {
    const resolver = fakeResolver();
    await service(resolver).listProjects({ force: true });
    expect(resolver.calls).toContain('<clear>');
  });
});
