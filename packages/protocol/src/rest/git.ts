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
 */

// ---------------------------------------------------------------------------
// git status
// ---------------------------------------------------------------------------

export const GitStatusQuerySchema = z.object({
  cwd: z.string().min(1),
});
export type GitStatusQuery = z.infer<typeof GitStatusQuerySchema>;

export const GIT_FILE_STATUS_KINDS = [
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'conflict',
] as const;
export const GitFileStatusKindSchema = z.enum(GIT_FILE_STATUS_KINDS);
export type GitFileStatusKind = z.infer<typeof GitFileStatusKindSchema>;

export const GitFileStatusSchema = z.object({
  path: z.string(),
  /** 重命名的原路径 */
  fromPath: z.string().optional(),
  kind: GitFileStatusKindSchema,
  /** 已暂存（index 区有改动） */
  staged: z.boolean(),
});
export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;

export const GitStatusResponseSchema = z.object({
  isGitRepository: z.boolean(),
  /** 仓库根（非 git 目录时为 null） */
  repositoryRoot: z.string().nullable(),
  branch: z.string().nullable(),
  files: z.array(GitFileStatusSchema),
  /** `git diff --numstat` 汇总（工作区 vs HEAD，含未跟踪不算） */
  additions: z.number(),
  deletions: z.number(),
});
export type GitStatusResponse = z.infer<typeof GitStatusResponseSchema>;

// ---------------------------------------------------------------------------
// git diff（单文件 unified patch）
// ---------------------------------------------------------------------------

export const GitDiffQuerySchema = z.object({
  cwd: z.string().min(1),
  path: z.string().min(1),
  /** 对比基准；缺省 = 工作区 vs HEAD */
  staged: z.literal('1').optional(),
});
export type GitDiffQuery = z.infer<typeof GitDiffQuerySchema>;

export const GitDiffResponseSchema = z.object({
  /** 该文件不受支持（二进制 / 未跟踪且无内容 / 不是 git 仓库） */
  supported: z.boolean(),
  status: GitFileStatusKindSchema.optional(),
  patch: z.string().optional(),
  /** 不支持时的可读原因 */
  reason: z.string().optional(),
});
export type GitDiffResponse = z.infer<typeof GitDiffResponseSchema>;

// ---------------------------------------------------------------------------
// worktrees
// ---------------------------------------------------------------------------

export const WorktreesQuerySchema = z.object({
  cwd: z.string().min(1),
});
export type WorktreesQuery = z.infer<typeof WorktreesQuerySchema>;

export const WorktreeInfoSchema = z.object({
  path: z.string(),
  branch: z.string().nullable(),
  /** HEAD 短 hash（detached 或无法解析时为 null） */
  head: z.string().nullable(),
  /** git 标记的 bare 仓库条目（通常只有主仓库本身） */
  bare: z.boolean(),
  /** 当前会话 cwd 落在哪个 worktree 里 */
  current: z.boolean(),
});
export type WorktreeInfo = z.infer<typeof WorktreeInfoSchema>;

export const WorktreesResponseSchema = z.object({
  projectRoot: z.string(),
  projectKey: z.string(),
  isGit: z.boolean(),
  /** cwd 是否就在仓库根（非 worktree） */
  isTopLevel: z.boolean(),
  currentWorktreePath: z.string().nullable(),
  worktrees: z.array(WorktreeInfoSchema),
});
export type WorktreesResponse = z.infer<typeof WorktreesResponseSchema>;

/** POST /api/worktrees —— 创建 worktree（分支已存在则检出，否则新建并检出） */
export const WorktreeCreateRequestSchema = z.object({
  cwd: z.string().min(1),
  branch: z.string().min(1),
  /** 目标父目录；缺省 = 仓库同级的 `<repo>.worktrees/` */
  basePath: z.string().optional(),
});
export type WorktreeCreateRequest = z.infer<typeof WorktreeCreateRequestSchema>;

export const WorktreeCreateResponseSchema = z.object({
  path: z.string(),
  branch: z.string(),
});
export type WorktreeCreateResponse = z.infer<typeof WorktreeCreateResponseSchema>;

/**
 * DELETE /api/worktrees —— 删除 worktree。
 * `force` 缺省时，工作区脏或未跟踪文件存在 → **409**（用户没打算丢改动）。
 */
export const WorktreeRemoveRequestSchema = z.object({
  cwd: z.string().min(1),
  path: z.string().min(1),
  force: z.boolean().optional(),
});
export type WorktreeRemoveRequest = z.infer<typeof WorktreeRemoveRequestSchema>;
