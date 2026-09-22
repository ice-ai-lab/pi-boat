import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectResolver, projectKeyOf } from '../src/read/project-resolver';

/**
 * 项目归一测试：用真实 git 仓库（临时目录）验证仓库根收敛、worktree 归属、非 git 回落。
 * 注意 macOS 的 /var → /private/var 符号链接：断言一律用 realpathSync 后的路径
 * （resolver 内部也 realpath，这正是要验的行为之一）。
 */

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-C', cwd, ...args], { env: { ...process.env, LC_ALL: 'C' } })
    .toString()
    .trim();

describe('ProjectResolver', () => {
  let root: string;
  let repo: string;
  let worktree: string;
  let plain: string;
  let branch: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'piboat-git-'));
    repo = join(root, 'repo');
    worktree = join(root, 'repo-worktrees', 'feat-x');
    plain = join(root, 'plain-dir');
    mkdirSync(repo, { recursive: true });
    mkdirSync(join(repo, 'packages', 'core'), { recursive: true });
    mkdirSync(plain, { recursive: true });

    git(repo, ['init']);
    git(repo, [
      '-c',
      'user.email=t@example.com',
      '-c',
      'user.name=test',
      'commit',
      '--allow-empty',
      '-m',
      'init',
    ]);
    branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    mkdirSync(join(root, 'repo-worktrees'), { recursive: true });
    git(repo, ['worktree', 'add', '-b', 'feat-x', worktree]);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const resolver = () => new ProjectResolver();

  it('子目录收敛到仓库根，并给出当前分支', async () => {
    const info = await resolver().resolve(join(repo, 'packages', 'core'));
    expect(info.isGit).toBe(true);
    expect(info.projectRoot).toBe(realpathSync(repo));
    expect(info.branch).toBe(branch);
    expect(info.isWorktree).toBe(false);
    expect(info.projectKey).toBe(realpathSync(repo));
  });

  it('worktree 归到主仓库根（不分裂成新项目）', async () => {
    const info = await resolver().resolve(worktree);
    expect(info.isGit).toBe(true);
    expect(info.projectRoot).toBe(realpathSync(repo));
    expect(info.isWorktree).toBe(true);
    expect(info.branch).toBe('feat-x');
    // 与主仓库解析结果同键 ⇒ 前端分组时落进同一组
    expect(info.projectKey).toBe((await resolver().resolve(repo)).projectKey);
  });

  it('非 git 目录回落 cwd，isGit=false', async () => {
    const info = await resolver().resolve(plain);
    expect(info).toEqual({ projectRoot: plain, projectKey: plain, isGit: false });
  });

  it('目录已删除 / cwd 为空 → 不抛错，回落原值', async () => {
    const gone = await resolver().resolve(join(root, 'does-not-exist'));
    expect(gone.isGit).toBe(false);
    expect(gone.projectRoot).toBe(join(root, 'does-not-exist'));
    expect((await resolver().resolve('')).isGit).toBe(false);
  });

  it('按 cwd 缓存：60s 内复用（clear 后失效）', async () => {
    const cached = resolver();
    const first = await cached.resolve(repo);
    const second = await cached.resolve(repo);
    expect(second).toBe(first); // 同一对象引用 ⇒ 确实走了缓存
    cached.clear();
    expect(await cached.resolve(repo)).not.toBe(first);
  });
});

describe('projectKeyOf', () => {
  it('去尾斜杠 + 分隔符统一（Windows 另有大小写归一）', () => {
    expect(projectKeyOf('/a/b/')).toBe('/a/b');
    expect(projectKeyOf('C:\\Repo\\sub')).toBe(
      process.platform === 'win32' ? 'c:/repo/sub' : 'C:/Repo/sub',
    );
  });
});
