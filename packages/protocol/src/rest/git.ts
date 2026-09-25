import { z } from 'zod';

/**
 * ⑤ REST 资源——Git 与 Worktree 域（docs/02 §6.7）。
 *
 * 为什么服务端做而不是让前端跑 git：浏览器里没有 git，而且 `cwd` 必须过
 * allowed-roots（与文件域同一道闸）。这里是**只读**的两个查询 + worktree 的
 * 三个增删查——唯一的写操作是创建/删除 worktree 目录，因此那两个用 POST/DELETE。
 *
 * 路径归一：git 输出的是 POSIX 风格相对路径，Windows 上要转原生分隔符；
 * 所有路径比较一律用 `samePath()`（大小写/分隔符不敏感），不用 `===`。
 * 入参用 zod（server 校验），出参只是类型（ADR-0017）。
 */

// ---------------------------------------------------------------------------
// git status
// ---------------------------------------------------------------------------

export const GitStatusQuerySchema = z.object({
  cwd: z.string().min(1),
});
export type GitFileStatusKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflict';

export type GitFileStatus = {
  path: string;
  /** 重命名的原路径 */
  fromPath?: string;
  kind: GitFileStatusKind;
  /** 已暂存（index 区有改动） */
  staged: boolean;
};

export type GitStatusResponse = {
  isGitRepository: boolean;
  /** 仓库根（非 git 目录时为 null） */
  repositoryRoot: string | null;
  branch: string | null;
  files: GitFileStatus[];
  /** `git diff --numstat` 汇总（工作区 vs HEAD，含未跟踪不算） */
  additions: number;
  deletions: number;
};

// ---------------------------------------------------------------------------
// git diff（单文件 unified patch）
// ---------------------------------------------------------------------------

export const GitDiffQuerySchema = z.object({
  cwd: z.string().min(1),
  path: z.string().min(1),
  /** 对比基准；缺省 = 工作区 vs HEAD */
  staged: z.literal('1').optional(),
});
export type GitDiffResponse = {
  /** 该文件不受支持（二进制 / 未跟踪且无内容 / 不是 git 仓库） */
  supported: boolean;
  status?: GitFileStatusKind;
  patch?: string;
  /** 不支持时的可读原因 */
  reason?: string;
};

// ---------------------------------------------------------------------------
// worktrees
// ---------------------------------------------------------------------------

export const WorktreesQuerySchema = z.object({
  cwd: z.string().min(1),
});
export type WorktreeInfo = {
  path: string;
  branch: string | null;
  /** HEAD 短 hash（detached 或无法解析时为 null） */
  head: string | null;
  /** git 标记的 bare 仓库条目（通常只有主仓库本身） */
  bare: boolean;
  /** 当前会话 cwd 落在哪个 worktree 里 */
  current: boolean;
};

export type WorktreesResponse = {
  projectRoot: string;
  projectKey: string;
  isGit: boolean;
  /** cwd 是否就在仓库根（非 worktree） */
  isTopLevel: boolean;
  currentWorktreePath: string | null;
  worktrees: WorktreeInfo[];
};

/** POST /api/worktrees —— 创建 worktree（分支已存在则检出，否则新建并检出） */
export const WorktreeCreateRequestSchema = z.object({
  cwd: z.string().min(1),
  branch: z.string().min(1),
  /** 目标父目录；缺省 = 仓库同级的 `<repo>.worktrees/` */
  basePath: z.string().optional(),
});
export type WorktreeCreateResponse = {
  path: string;
  branch: string;
};

/**
 * DELETE /api/worktrees —— 删除 worktree。
 * `force` 缺省时，工作区脏或未跟踪文件存在 → **409**（用户没打算丢改动）。
 */
export const WorktreeRemoveRequestSchema = z.object({
  cwd: z.string().min(1),
  path: z.string().min(1),
  force: z.boolean().optional(),
});
