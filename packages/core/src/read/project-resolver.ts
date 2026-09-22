import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { ProjectInfo } from '@ice-ai/protocol';

/**
 * 项目归一（docs/02 §6.1；决策见 ADR-0008）。
 *
 * 问题：会话按 cwd 分目录（`~/.pi/agent/sessions/<encoded-cwd>/`），但 cwd ≠ 项目——
 * 同一仓库的子目录（`repo/packages/core`）与 worktree（`../repo-worktrees/feat-x`）
 * 会各占一个目录，前端按 cwd 分组就会把同一个项目拆成多个。
 *
 * 做法（对齐 pi-web）：用 git 把 cwd 归一到仓库根，worktree 归到主仓库根；
 * 非 git 目录回落 cwd。结果按 cwd 缓存 60s——每个 distinct cwd 一次 git 子进程。
 *
 * 缓存与失效：TTL 60s（分支切换后最多滞后一分钟）；`force=1` 由上层调 clear()。
 * 缓存粒度是 cwd 而非目录指纹——git 元数据变化（checkout/新 worktree）不体现在
 * 会话文件 mtime 上，指纹对它无效。
 */

/**
 * 项目解析器最小契约：默认实现为 ProjectResolver；测试可注入假实现以避开 git 子进程
 * （第二个真实用例：dev/test 两套环境）。SessionReadService（列表 enrich）与
 * ProjectReadService（项目清单）共用同一实例 ⇒ 两处 projectKey 按构造一致（ADR-0008）。
 */
export interface ProjectResolverLike {
  resolve(cwd: string): Promise<ProjectResolution>;
  clear(): void;
}

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 5000;
const DEFAULT_TTL_MS = 60_000;

/** 一次项目解析的结果（protocol 的 ProjectInfo 去掉会话统计字段） */
export type ProjectResolution = Pick<
  ProjectInfo,
  'projectRoot' | 'projectKey' | 'isGit' | 'branch' | 'isWorktree'
>;

/**
 * 分组键：projectRoot 的跨平台归一。Windows 下大小写与分隔符不敏感
 * （`C:\Repo` 与 `c:/repo` 必须落进同一组）；POSIX 下等于原样路径（去尾斜杠）。
 */
export function projectKeyOf(projectRoot: string): string {
  const unified = projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? unified.toLowerCase() : unified;
}

export class ProjectResolver {
  private readonly cache = new Map<string, { info: ProjectResolution; expiresAt: number }>();

  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  async resolve(cwd: string): Promise<ProjectResolution> {
    const cached = this.cache.get(cwd);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.info;
    const info = await resolveWithGit(cwd);
    this.cache.set(cwd, { info, expiresAt: Date.now() + this.ttlMs });
    return info;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * `git rev-parse` 一次拿全所需信息（--path-format=absolute 保证 git-dir/common-dir 为绝对路径）：
 * - `--show-toplevel`      仓库根（子目录自动收敛）
 * - `--git-dir`            当前 worktree 的 git 目录
 * - `--git-common-dir`     共享 git 目录（worktree 时与 git-dir 不同）
 * - `--abbrev-ref HEAD`    当前分支（detached 时为 "HEAD"）
 */
async function resolveWithGit(cwd: string): Promise<ProjectResolution> {
  const fallback = (): ProjectResolution => ({
    projectRoot: cwd,
    projectKey: projectKeyOf(cwd),
    isGit: false,
  });
  if (cwd === '') return fallback();

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      'git',
      [
        '-C',
        cwd,
        'rev-parse',
        '--path-format=absolute',
        '--show-toplevel',
        '--git-dir',
        '--git-common-dir',
        '--abbrev-ref',
        'HEAD',
      ],
      { timeout: GIT_TIMEOUT_MS, env: { ...process.env, LC_ALL: 'C' } },
    ));
  } catch {
    // 非 git 目录 / cwd 已删除 / 未安装 git —— 一律回落 cwd（不报错，列表仍可用）
    return fallback();
  }

  const [toplevelRaw, gitDirRaw, commonDirRaw, branchRaw] = stdout.trim().split('\n');
  if (toplevelRaw === undefined || gitDirRaw === undefined || commonDirRaw === undefined) {
    return fallback();
  }

  const [toplevel, gitDir, commonDir] = await Promise.all([
    realpathOr(toplevelRaw),
    realpathOr(gitDirRaw),
    realpathOr(commonDirRaw),
  ]);
  // git-dir ≠ git-common-dir ⇒ 这是一个 worktree；归到主仓库根（common-dir 的父目录）
  const isWorktree = gitDir !== commonDir;
  const projectRoot = isWorktree ? dirname(commonDir) : toplevel;
  const branch = branchRaw?.trim();
  return {
    projectRoot,
    projectKey: projectKeyOf(projectRoot),
    isGit: true,
    isWorktree,
    ...(branch !== undefined && branch !== '' && branch !== 'HEAD' ? { branch } : {}),
  };
}

/** realpath 失败（路径已删除/权限）时用原值兜底，保证归一不因单个目录消失而整体失败 */
async function realpathOr(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}
