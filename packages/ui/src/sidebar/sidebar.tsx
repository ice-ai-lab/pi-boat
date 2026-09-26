import { getProjectActivity, type RecentProject } from '@ice-ai/client';
import type { SessionInfo, WorktreeInfo } from '@ice-ai/protocol';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProjectPicker } from './project-picker';
import { SessionList } from './session-list';

/**
 * Sidebar：项目/worktree 选择器 + 新建会话 + 搜索插槽 + 窗口化会话列表。
 * 视觉照抄 pi-web `SessionSidebar`：页头 `12px 10px 10px` + 1px 分隔线，
 * 标题行右侧为 32px 高圆角 7 的新建按钮，下面整宽的项目选择按钮。
 * props 驱动、无取数（数据装配在 apps/web；docs/06 §1 边界 2 保持）。
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
  /** 标题（页头左侧），默认「会话」 */
  title?: string;
  /**
   * 内容槽：提供时替换会话列表（侧栏「文件」页签用），
   * 项目选择器与搜索槽保持不变——切页签不该丢掉切项目的能力。
   */
  content?: ReactNode;
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
  title = '',
  content,
}: SidebarProps) {
  const activity = getProjectActivity(sessions, runningSessionIds);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        style={{
          // L17：上边距由品牌行承担（避免两层 12px 叠加）
          padding: '0 10px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: title === '' ? 'flex-end' : 'space-between',
            marginBottom: 10,
          }}
        >
          {title !== '' && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </span>
          )}
          <button
            type="button"
            onClick={onNewSession}
            title="新建会话"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: 32,
              paddingLeft: 10,
              paddingRight: 12,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
              borderRadius: 7,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              flexShrink: 0,
              transition: 'background 0.12s, color 0.12s, border-color 0.12s',
            }}
          >
            <Plus size={12} />
            新会话
          </button>
        </div>
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
      </div>

      {searchSlot !== undefined && (
        <div
          style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
        >
          {searchSlot}
        </div>
      )}

      {content !== undefined ? (
        <div className="flex min-h-0 flex-1 flex-col">{content}</div>
      ) : sessions.length === 0 ? (
        <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
          {searching ? '无匹配会话' : emptyHint}
        </div>
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
