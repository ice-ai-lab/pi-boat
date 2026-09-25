import { z } from 'zod';

/**
 * ⑤ REST 资源——项目（分组）域（docs/02 §6.1，决策见 ADR-0008）。
 *
 * "项目"不是独立实体，而是**会话目录的派生视图**：会话按 cwd 落在
 * `~/.pi/agent/sessions/<encoded-cwd>/`，本域把同一 git 仓库（含 worktree/子目录）
 * 的会话归到一组，给出前端侧栏需要的最小信息。
 *
 * 为什么需要这个视图，而不是让前端从会话列表推导：推导要求会话列表**全量且
 * 不分页**，一旦分页项目清单就残缺且随活动漂移。本视图走
 * O(项目数) 的目录元数据（不解析会话正文），因此廉价且不需要分页。
 * 同一仓库的多个会话目录（子目录、worktree）按 projectKey 合并为一项。
 *
 * 注：本文件只定义请求/响应契约，**不导出路径常量**——server 路由一律用字面量，
 * path 常量仅在出现 client SDK 消费方时再加（docs/02 §3 “不养期货”）。
 */
export type ProjectInfo = {
  /** 分组键：projectRoot 的跨平台归一（Windows 大小写/分隔符不敏感），前端分组用 */
  projectKey: string;
  /** git 仓库根（realpath）；worktree 归到主仓库根；非 git 目录 = cwd 本身 */
  projectRoot: string;
  /** 该项目的代表 cwd（项目内最近有活动的会话目录） */
  cwd: string;
  /** 该项目包含的全部 cwd（子目录/worktree 各占一项，按活动时间降序） */
  cwds: string[];
  /** 该项目的会话文件总数（含未解析正文的） */
  sessionCount: number;
  /** 该项目内最新会话的文件 mtime（ISO），无需解析正文 */
  lastModified: string;
  isGit: boolean;
  /** 当前分支；detached HEAD 或无分支时缺省 */
  branch?: string;
  /** 该 cwd 是否为 git worktree（worktree 的 projectRoot 归到主仓库） */
  isWorktree?: boolean;
};

/**
 * GET /api/projects?force=1 —— 全量项目清单（不分页：量级 10¹，见 ADR-0008）。
 * 空会话目录（目录存在但无 .jsonl）不出现在结果里：其 cwd 只能靠有损的目录名反解。
 */
export type ProjectsResponse = {
  projects: ProjectInfo[];
  /** 会话目录指纹（同 SessionListResponse.listFingerprint）：变了说明列表内容已变；
   *  不透明字符串，无单调性（只比较相等） */
  listFingerprint: string;
};

/** GET /api/projects 查询参数 */
export const ProjectsQuerySchema = z.object({
  /** force=1：清空项目解析（git）缓存后重算 */
  force: z.literal('1').optional(),
});
export type ProjectsQuery = z.infer<typeof ProjectsQuerySchema>;
