import type { ProjectInfo, ProjectsResponse } from '@ice-ai/protocol';
import { readSessionCwd, resolveSessionsRoot, scanSessionsDir } from './dir-scan';
import type { ProjectResolution, ProjectResolverLike } from './project-resolver';
import { ProjectResolver } from './project-resolver';

/**
 * 项目清单（GET /api/projects，ADR-0008）：O(项目数) 的目录元数据扫描 +
 * 每目录一次首行头读取；不解析会话正文，因此不分页也便宜（2026-09-22 自
 * SessionReadService 按领域拆出）。
 *
 * 按 projectKey **合并**多个会话目录——同一仓库的子目录与 worktree 各占一个
 * 目录名，但属于同一个项目（这正是本端点相对“前端按 cwd 分组”的价值）。
 * 空目录与头部读不到 cwd 的目录不出现（见 protocol rest/projects 注释）。
 *
 * 与 SessionReadService 的关系：共用 dir-scan 的磁盘扫描原语；resolver 须由
 * 装配方（server main / 测试）传**同一实例**给两个服务 ⇒ 会话列表与项目清单的
 * projectKey 按构造一致，前端分组与 ?projectKey 过滤不会错位。
 */

export interface ProjectReadOptions {
  /** 会话根目录（其下每项目一子目录，目录元数据扫描的范围）；缺省 = SDK 默认 */
  sessionsRoot?: string;
  /** 项目解析器（缓存 git 归一结果）；测试可注入以避开真实 git 子进程 */
  resolver?: ProjectResolverLike;
}

/** 项目内一个会话目录的摘要（listProjects 合并用） */
interface ProjectDirSummary {
  cwd: string;
  sessionCount: number;
  lastModified: string;
}

export class ProjectReadService {
  private readonly sessionsRoot: string;
  private readonly resolver: ProjectResolverLike;

  constructor(options: ProjectReadOptions = {}) {
    this.sessionsRoot = resolveSessionsRoot(options);
    this.resolver = options.resolver ?? new ProjectResolver();
  }

  async listProjects(options: { force?: boolean } = {}): Promise<ProjectsResponse> {
    if (options.force === true) this.resolver.clear();
    const scan = await scanSessionsDir(this.sessionsRoot);

    // projectKey → 该项目包含的会话目录（每个目录一个 cwd，按 SDK 布局约定）
    const grouped = new Map<string, { resolution: ProjectResolution; dirs: ProjectDirSummary[] }>();
    for (const project of scan.projects) {
      const newest = project.files[0]; // scan 已按文件名（ISO 时间戳前缀）降序
      if (newest === undefined) continue;
      const cwd = await readSessionCwd(newest.path);
      if (cwd === '') continue;
      const resolution = await this.resolver.resolve(cwd);
      const dir: ProjectDirSummary = {
        cwd,
        sessionCount: project.files.length,
        lastModified: new Date(
          Math.max(...project.files.map((file) => file.mtimeMs)),
        ).toISOString(),
      };
      const entry = grouped.get(resolution.projectKey);
      if (entry === undefined) grouped.set(resolution.projectKey, { resolution, dirs: [dir] });
      else entry.dirs.push(dir);
    }

    const projects: ProjectInfo[] = [...grouped.values()].map(({ resolution, dirs }) => {
      dirs.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
      const newestDir = dirs[0] as ProjectDirSummary;
      return {
        ...resolution,
        cwd: newestDir.cwd,
        cwds: dirs.map((dir) => dir.cwd),
        sessionCount: dirs.reduce((total, dir) => total + dir.sessionCount, 0),
        lastModified: newestDir.lastModified,
      };
    });
    projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return { projects, listFingerprint: scan.fingerprint };
  }
}
