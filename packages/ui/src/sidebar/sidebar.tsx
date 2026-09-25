import { getProjectActivity, type RecentProject } from '@ice-ai/client';
import type { SessionInfo, WorktreeInfo } from '@ice-ai/protocol';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button';
import { ProjectPicker } from './project-picker';
import { SessionList } from './session-list';

/**
 * Sidebar（docs/06 §4.3）：新建会话 + 项目/worktree 选择器 + 搜索插槽 + 窗口化会话列表。
 * props 驱动、无取数（数据装配在 apps/web；docs/06 §1 边界 2 保持）。
 * 一次只展示选中项目的会话——项目切换走浮层，列表才能真正窗口化。
 */
export interface SidebarProps {
  /** 当前项目的会话 */
  sessions: SessionInfo[];
  projects: RecentProject[];
  activeProjectKey: string | null;
  runningSessionIds: ReadonlySet<string>;
  activeSessionId: string | null;
  worktrees: WorktreeInfo[];
  currentWorktreePath: string | null;
  worktreeBusy?: boolean;
  onSelectProject(projectKey: string): void;
  onSelectWorktree(path: string): void;
  onCreateWorktree(branch: string): void;
  onRemoveWorktree(path: string): void;
  onSelectSession(sessionId: string): void;
  onRenameSession(sessionId: string, name: string): void;
  onDeleteSession(sessionId: string): void;
  onNewSession(): void;
  searchSlot?: ReactNode;
  /** 搜索态：结果平铺，不显示项目头 */
  searching?: boolean;
  emptyHint?: string;
}

export function Sidebar({
  sessions,
  projects,
  activeProjectKey,
  runningSessionIds,
  activeSessionId,
  worktrees,
  currentWorktreePath,
  worktreeBusy = false,
  onSelectProject,
  onSelectWorktree,
  onCreateWorktree,
  onRemoveWorktree,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onNewSession,
  searchSlot,
  searching = false,
  emptyHint = '还没有会话',
}: SidebarProps) {
  const activity = getProjectActivity(sessions, runningSessionIds);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2.5">
      <Button variant="primary" size="sm" onClick={onNewSession}>
        <Plus size={13} />
        新会话
      </Button>
      {searchSlot !== undefined && <div>{searchSlot}</div>}
      {!searching && (
        <ProjectPicker
          projects={projects}
          activeProjectKey={activeProjectKey}
          activity={activity}
          worktrees={worktrees}
          currentWorktreePath={currentWorktreePath}
          worktreeBusy={worktreeBusy}
          onSelectProject={onSelectProject}
          onSelectWorktree={onSelectWorktree}
          onCreateWorktree={onCreateWorktree}
          onRemoveWorktree={onRemoveWorktree}
        />
      )}

      {sessions.length === 0 ? (
        <p className="px-1 py-3 text-[12px] text-fg-faint">
          {searching ? '无匹配会话' : emptyHint}
        </p>
      ) : (
        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          runningSessionIds={runningSessionIds}
          onSelect={onSelectSession}
          onRename={onRenameSession}
          onDelete={onDeleteSession}
        />
      )}
    </div>
  );
}
