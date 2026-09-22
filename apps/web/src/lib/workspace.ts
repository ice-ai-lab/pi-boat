import type { ProjectInfo } from '@ice-ai/protocol';

/**
 * 文件夹空间（= protocol 的**项目**，ADR-0008）的选择与默认值。
 *
 * 需求（2026-09-23）：**默认打开最近一次对话的文件夹空间**——首次打开（或记住的选择已失效）
 * 时选中「最近有活动的项目」，即 `GET /api/projects` 的首项（服务端按 `lastModified` 降序）。
 * 这与 pi-web 的行为对齐（那边是 workspace 记忆 + 最近项目兜底），但只记一层空间，不记
 * 「空间内最后打开的会话」（那会让 `/` 直接跳进某条旧会话，偏离「从一次对话开始」）。
 *
 * 与 `piboat.cwd`（上次提交的工作目录）的关系：空间选择优先——空间给出 cwd，用户手改 cwd
 * 只影响本次建会话；`adoptCwd` 在提交后把「能归类到某个项目的 cwd」反哺回空间选择。
 */

export const WORKSPACE_STORAGE_KEY = 'piboat.workspace';

export function readStoredWorkspaceKey(): string | null {
  try {
    const value = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return value === null || value === '' ? null : value;
  } catch {
    return null;
  }
}

export function storeWorkspaceKey(key: string | null): void {
  try {
    if (key === null) window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    else window.localStorage.setItem(WORKSPACE_STORAGE_KEY, key);
  } catch {
    // 隐私模式等场景：记住选择是尽力而为，不阻塞主流程
  }
}

/** 归一化路径：去掉尾部斜杠（`/a/b/` 与 `/a/b` 是同一个目录，也方便与 projectRoot 比对） */
function normalizePath(path: string): string {
  if (path.length > 1) return path.replace(/[/\\]+$/, '');
  return path;
}

/**
 * 启动时要选的文件夹空间：**记住的选择仍存在时优先**（用户显式选过就不该被覆盖），
 * 否则取最近有活动的项目 —— 它的 `cwd` 就是最近一次对话的工作目录。
 * 项目清单为空（首次使用、或会话目录还没内容）时返回 `null`，此时 hero 用路径输入兜底。
 */
export function resolveWorkspaceKey(
  projects: ProjectInfo[],
  storedKey: string | null,
): string | null {
  if (storedKey !== null && projects.some((p) => p.projectKey === storedKey)) return storedKey;
  return projects[0]?.projectKey ?? null;
}

/** 项目 → 代表 cwd（`GET /api/projects` 已按活动时间降序给了 `cwd`） */
export function projectCwd(projects: ProjectInfo[], key: string | null): string | null {
  if (key === null) return null;
  return projects.find((p) => p.projectKey === key)?.cwd ?? null;
}

/**
 * cwd → 所属项目（`projectKey`）。会话的 cwd 可能是项目根、子目录或 worktree，
 * 三种都算「同一个文件夹空间」（ADR-0008 的归一语义），因此依次比对这三处。
 */
export function findProjectByCwd(projects: ProjectInfo[], cwd: string): ProjectInfo | null {
  const target = normalizePath(cwd.trim());
  if (target === '') return null;
  return (
    projects.find(
      (project) =>
        normalizePath(project.cwd) === target ||
        normalizePath(project.projectRoot) === target ||
        project.cwds.some((item) => normalizePath(item) === target),
    ) ?? null
  );
}
