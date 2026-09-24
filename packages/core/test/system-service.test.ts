import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isInsideRoot, PathGuard, samePath, toPosixPath } from '../src/system/path-guard';
import { fuzzyScore, SystemService } from '../src/system/system-service';

/**
 * 文件访问闸门（docs/02 §6.6 的协议级语义）。
 *
 * 这一层是**安全边界**，不是工具函数：本服务握有宿主机文件系统全部权限，
 * 而 ADR-0007 之后没有凭据兜底——判错的后果是任意文件读。
 * 因此测试按"攻击者视角"写：越界、前缀混淆、点文件、路径穿越。
 */

let root: string;
let outside: string;

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), 'piboat-guard-'));
  root = join(base, 'repo');
  outside = join(base, 'outside');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'evil'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(outside, 'secret.txt'), 'top secret\n');
  writeFileSync(join(outside, 'ref.png'), 'png\n');
});
afterAll(() => {
  rmSync(join(root, '..'), { recursive: true, force: true });
});

describe('PathGuard：allowed-roots', () => {
  it('roots 内放行；roots 外拒绝', () => {
    const guard = new PathGuard([root]);
    expect(guard.check(join(root, 'src', 'a.ts')).allowed).toBe(true);
    expect(guard.check(join(outside, 'secret.txt'))).toEqual({
      allowed: false,
      reason: 'outside-roots',
    });
  });

  it('前缀混淆：`/repo-evil` 不算在 `/repo` 内（按路径段边界比，不比字符串前缀）', () => {
    const guard = new PathGuard([root]);
    const sibling = `${root}-evil`;
    mkdirSync(sibling, { recursive: true });
    expect(guard.check(sibling).allowed).toBe(false);
    expect(isInsideRoot(sibling, root)).toBe(false);
    expect(isInsideRoot(root, root)).toBe(true);
  });

  it('路径穿越：`root/../outside/secret.txt` 解析后仍在 roots 外', () => {
    const guard = new PathGuard([root]);
    expect(guard.check(join(root, '..', 'outside', 'secret.txt')).allowed).toBe(false);
  });

  it('敏感路径即使在 roots 内也拒（.ssh / .env 类凭据）', () => {
    const guard = new PathGuard([root]);
    mkdirSync(join(root, '.ssh'), { recursive: true });
    expect(guard.check(join(root, '.ssh', 'id_rsa'))).toEqual({
      allowed: false,
      reason: 'sensitive',
    });
  });

  it('addRoot 接受不存在的路径时被忽略（roots 里不留死路径）', () => {
    const guard = new PathGuard([]);
    guard.addRoot(join(outside, 'definitely-missing'));
    expect(guard.allowedRoots).toEqual([]);
    guard.addRoot(outside);
    expect(guard.allowedRoots).toHaveLength(1);
  });

  it('会话引用放行：roots 外的文件被引用时可读；但**敏感路径引用也不给**', () => {
    const guard = new PathGuard([root]);
    const target = join(outside, 'ref.png');
    expect(guard.checkWithSessionReference(target, [target]).allowed).toBe(true);
    expect(guard.checkWithSessionReference(target, ['/some/other']).allowed).toBe(false);

    mkdirSync(join(outside, '.ssh'), { recursive: true });
    const key = join(outside, '.ssh', 'id_rsa');
    expect(guard.checkWithSessionReference(key, [key])).toEqual({
      allowed: false,
      reason: 'sensitive',
    });
  });
});

describe('samePath / toPosixPath', () => {
  it('尾斜杠与冗余段归一后相等', () => {
    expect(samePath(root, `${root}/`)).toBe(true);
    expect(samePath(root, join(root, '.', 'src', '..'))).toBe(true);
    expect(samePath(root, outside)).toBe(false);
  });

  it('git 的 POSIX 路径转本机原生分隔符', () => {
    const native = toPosixPath(join('a', 'b'));
    expect(native).toBe('a/b');
  });
});

describe('SystemService：文件与索引', () => {
  // tmpdir 在 macOS 上是 /var → /private/var 的符号链接，PathGuard 存的是 realpath；
  // 断言里一律用 realpath 过的根，否则比的不是同一个路径。
  // 惰性求值：describe 体在 beforeAll 之前执行，此处不能直接读 root
  const realRoot = () => realpathSync(root);
  const service = () => new SystemService({ guard: new PathGuard([root]) });

  it('listDirectory：目录在前、忽略体积目录（node_modules）并回报忽略项；敏感目录**不列**', async () => {
    const listed = await service().listDirectory(root);
    expect(listed?.entries.map((entry) => entry.name)).toEqual(['src']);
    expect(listed?.ignored).toContain('node_modules');
    // .ssh 连存在性都不暴露（上一条测试在 root 里建过它）
    expect(listed?.entries.some((entry) => entry.name === '.ssh')).toBe(false);
    expect(listed?.ignored).not.toContain('.ssh');
  });

  it('listDirectory：roots 外返回 null（**列目录不适用会话引用放行**）', async () => {
    expect(await service().listDirectory(outside)).toBeNull();
  });

  it('meta / readFile：分类与图片 MIME；越界 null', async () => {
    const meta = await service().meta(join(root, 'src', 'a.ts'));
    expect(meta).toMatchObject({ category: 'text', type: 'file' });
    const image = await service().meta(join(outside, 'ref.png'), [join(outside, 'ref.png')]);
    expect(image).toMatchObject({ category: 'image', mimeType: 'image/png' });

    const file = await service().readFile(join(root, 'src', 'a.ts'));
    expect(file?.data.toString()).toContain('export const a');
    expect(await service().readFile(join(outside, 'secret.txt'))).toBeNull();
  });

  it('saveUpload：文件名清洗（拒 `../` 与空名）、rename 不覆盖', async () => {
    const svc = service();
    const first = await svc.saveUpload(root, '../../evil.txt', new Uint8Array([1]), 'rename');
    expect(first).toMatchObject({ path: join(realRoot(), 'evil.txt'), finalName: 'evil.txt' });
    const second = await svc.saveUpload(root, 'evil.txt', new Uint8Array([2]), 'rename');
    expect(second).toMatchObject({ finalName: 'evil (2).txt' });
    const skipped = await svc.saveUpload(root, 'evil.txt', new Uint8Array([3]), 'skip');
    expect(skipped).toEqual({ skipped: 'evil.txt' });
    expect(await svc.saveUpload(root, '..', new Uint8Array([1]))).toBeNull();
  });

  it('checkUploadConflicts 与 fileIndex', async () => {
    const svc = service();
    // 入参是**文件名**（会取 basename），不是相对路径
    const conflicts = await svc.checkUploadConflicts(root, ['a.ts', 'nope.ts', '../../a.ts']);
    expect(conflicts).toEqual([
      { name: 'a.ts', exists: false },
      { name: 'nope.ts', exists: false },
      { name: '../../a.ts', exists: false },
    ]);
    const all = await svc.fileIndex(root);
    expect(all.files).toContain('src/a.ts');
    expect(all.truncated).toBe(false);
    const filtered = await svc.fileIndex(root, 'ats');
    expect(filtered.files[0]).toBe('src/a.ts');
  });
});

describe('fuzzyScore', () => {
  it('子序列匹配、词首加成、不匹配为 0', () => {
    // 模糊匹配是**子序列**：b→t→n 在 Button 里依次出现，所以 'btn' 也命中
    expect(fuzzyScore('src/components/Button.tsx', 'btn')).toBeGreaterThan(0);
    expect(fuzzyScore('src/components/Button.tsx', 'button')).toBeGreaterThan(0);
    expect(fuzzyScore('src/components/Button.tsx', 'cmpbtn')).toBeGreaterThan(0);
    // 顺序不成立 / 字符不存在 → 0
    expect(fuzzyScore('a/b/c.ts', 'xyz')).toBe(0);
    expect(fuzzyScore('a/b/c.ts', 'cba')).toBe(0);
    // 词首命中（大写 B 前是 /）分数高于词中命中
    expect(fuzzyScore('src/Button.tsx', 'b')).toBeGreaterThan(fuzzyScore('src/abutton.tsx', 'b'));
  });
});

describe('SystemService：真实 git 仓库', () => {
  let repo: string;

  beforeAll(async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const run = promisify(execFile);
    const base = mkdtempSync(join(tmpdir(), 'piboat-git-'));
    repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    await run('git', ['init', '-b', 'main'], { cwd: repo });
    await run('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
    await run('git', ['config', 'user.name', 'Test'], { cwd: repo });
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    await run('git', ['add', '.'], { cwd: repo });
    await run('git', ['commit', '-m', 'init'], { cwd: repo });
    // 制造三种状态：已修改、未跟踪、已暂存
    writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n');
    writeFileSync(join(repo, 'untracked.txt'), 'new\n');
  });
  afterAll(() => {
    rmSync(join(repo, '..'), { recursive: true, force: true });
  });

  const service = () => new SystemService({ guard: new PathGuard([repo]) });

  it('gitStatus：分支 / 文件分类 / numstat 汇总', async () => {
    const status = await service().gitStatus(repo);
    expect(status.isGitRepository).toBe(true);
    expect(status.branch).toBe('main');
    const modified = status.files.find((file) => file.path === 'a.txt');
    expect(modified).toMatchObject({ kind: 'modified', staged: false });
    expect(status.files.find((file) => file.path === 'untracked.txt')).toMatchObject({
      kind: 'untracked',
    });
    expect(status.additions).toBeGreaterThanOrEqual(1);
  });

  it('gitDiff：改动文件给出 unified patch；未改动文件回 supported:false', async () => {
    const diff = await service().gitDiff(repo, 'a.txt', false);
    expect(diff.supported).toBe(true);
    expect(diff.patch).toContain('+two');
    expect(diff.status).toBe('modified');

    expect(await service().gitDiff(repo, 'nope.txt', false)).toMatchObject({
      supported: false,
      reason: 'file-not-changed',
    });
  });

  it('gitStatus：非 git 目录回 isGitRepository:false（不是 500）', async () => {
    const plain = join(repo, '..', 'plain');
    mkdirSync(plain, { recursive: true });
    const svc = new SystemService({ guard: new PathGuard([plain]) });
    expect(await svc.gitStatus(plain)).toMatchObject({ isGitRepository: false, files: [] });
  });

  it('worktrees：主仓库自身在清单里且 current=true；创建与删除走 git', async () => {
    const svc = service();
    const listed = await svc.worktrees(repo);
    expect(listed.isGit).toBe(true);
    expect(listed.isTopLevel).toBe(true);
    expect(listed.worktrees).toHaveLength(1);
    expect(listed.worktrees[0]).toMatchObject({ current: true, branch: 'main' });
    // 真实路径可能被 /var → /private/var 规范化，比较 realpath
    expect(samePath(listed.currentWorktreePath ?? '', realpathSync(repo))).toBe(true);

    const created = await svc.createWorktree(repo, 'feat-x');
    expect(created.branch).toBe('feat-x');
    const after = await svc.worktrees(repo);
    expect(after.worktrees).toHaveLength(2);
    // 新建的 worktree 自动进 roots（用户马上会在里面开会话）
    expect(svc.pathGuard.check(created.path).allowed).toBe(true);

    const removed = await svc.removeWorktree(repo, created.path, true);
    expect(removed).toBeNull();
    expect((await svc.worktrees(repo)).worktrees).toHaveLength(1);
  });

  it('worktrees：脏 worktree 不加 force → 返回脏文件清单（server 映射 409）', async () => {
    const svc = service();
    const created = await svc.createWorktree(repo, 'feat-dirty');
    writeFileSync(join(created.path, 'dirty.txt'), 'x\n');
    const dirty = await svc.removeWorktree(repo, created.path, false);
    expect(dirty?.dirty).toContain('dirty.txt');
    // 没删掉
    expect((await svc.worktrees(repo)).worktrees.some((w) => samePath(w.path, created.path))).toBe(
      true,
    );
    await svc.removeWorktree(repo, created.path, true);
  });

  it('创建 worktree：非 git 仓库 → 用户输入错误（不是崩溃）', async () => {
    const plain = join(repo, '..', 'plain2');
    mkdirSync(plain, { recursive: true });
    const svc = new SystemService({ guard: new PathGuard([plain]) });
    await expect(svc.createWorktree(plain, 'x')).rejects.toThrow(/Not a git repository/);
  });
});
