import type { RecentProject } from '@ice-ai/client';
import type { WorktreeInfo } from '@ice-ai/protocol';
import { ChevronDown, GitBranch, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Input } from '../primitives/input';
import { Popover } from '../primitives/popover';
import { cn } from '../utils/cn';

/** 路径尾部两段（`…/pi-boat/packages`），避免长路径撑爆头部 */
export function shortenProjectPath(root: string): string {
  const parts = root.split('/').filter((part) => part.length > 0);
  if (parts.length <= 2) return root;
  return `…/${parts.slice(-2).join('/')}`;
}

/**
 * ProjectPicker（docs/06 §4.3）：项目切换 + 项目内 worktree 切换/新建/删除。
 * 侧栏一次只展示**选中项目**的会话（窗口化列表），所以项目清单走浮层而不是分组展开。
 */
export interface ProjectPickerProps {
  projects: RecentProject[];
  activeProjectKey: string | null;
  activity: Map<string, { running: number; total: number }>;
  worktrees: WorktreeInfo[];
  currentWorktreePath: string | null;
  worktreeBusy?: boolean;
  onSelectProject(projectKey: string): void;
  onSelectWorktree(path: string): void;
  onCreateWorktree(branch: string): void;
  onRemoveWorktree(path: string): void;
}

export function ProjectPicker({
  projects,
  activeProjectKey,
  activity,
  worktrees,
  currentWorktreePath,
  worktreeBusy = false,
  onSelectProject,
  onSelectWorktree,
  onCreateWorktree,
  onRemoveWorktree,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState('');
  const active = projects.find((project) => project.key === activeProjectKey);
  const currentWorktree = worktrees.find((worktree) => worktree.path === currentWorktreePath);
  const hasWorktrees = worktrees.length > 0;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      width={320}
      triggerLabel="项目与 worktree"
      trigger={
        <span
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text)',
            textAlign: 'left',
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {active === undefined ? '选择项目' : shortenProjectPath(active.root)}
          </span>
          {active !== undefined && (
            <span style={{ flexShrink: 0, color: 'var(--text-dim)' }}>{active.sessionCount}</span>
          )}
          <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--text-dim)' }} />
        </span>
      }
    >
      <div className="flex flex-col gap-0.5">
        <p
          style={{
            padding: '4px 6px',
            fontSize: 10,
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          项目
        </p>
        {projects.map((project) => {
          const counters = activity.get(project.key);
          return (
            <button
              key={project.key}
              type="button"
              title={project.root}
              onClick={() => {
                onSelectProject(project.key);
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-[5px] px-2 py-1.5 text-left text-[12px]',
                project.key === activeProjectKey
                  ? 'bg-bg-selected text-accent'
                  : 'text-text-muted hover:bg-bg-hover',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{shortenProjectPath(project.root)}</span>
              {(counters?.running ?? 0) > 0 && (
                <Loader2 size={11} className="shrink-0 animate-spin text-accent" />
              )}
              <span className="shrink-0 text-[10.5px] text-fg-faint">
                {counters?.total ?? project.sessionCount}
              </span>
            </button>
          );
        })}

        {active !== undefined && hasWorktrees && (
          <>
            <p className="mt-1 border-t border-border px-1.5 pt-2 pb-1 text-[10px] font-mono tracking-wide text-text-dim uppercase">
              worktree
            </p>
            {worktrees.map((worktree) => (
              <div key={worktree.path} className="group/wt flex items-center gap-1">
                <button
                  type="button"
                  title={worktree.path}
                  onClick={() => {
                    onSelectWorktree(worktree.path);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-[5px] px-2 py-1.5 text-left text-[12px]',
                    worktree.path === currentWorktreePath
                      ? 'bg-bg-selected text-accent'
                      : 'text-text-muted hover:bg-bg-hover',
                  )}
                >
                  <GitBranch size={11} className="shrink-0 text-fg-faint" />
                  <span className="min-w-0 flex-1 truncate">
                    {worktree.branch ?? `(detached ${worktree.head ?? '?'})`}
                  </span>
                  {worktree.bare && <span className="text-[10px] text-fg-faint">bare</span>}
                </button>
                {!worktree.bare && (
                  <button
                    type="button"
                    title="删除该 worktree"
                    aria-label="删除 worktree"
                    data-x
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] text-text-dim hover:bg-danger-soft hover:text-danger"
                    onClick={() => onRemoveWorktree(worktree.path)}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            <div className="mt-1 flex items-center gap-1 border-t border-border pt-2">
              <Input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="新分支名（新建 worktree）"
                disabled={worktreeBusy}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && branch.trim().length > 0) {
                    onCreateWorktree(branch.trim());
                    setBranch('');
                    setOpen(false);
                  }
                }}
              />
              <button
                type="button"
                title="新建 worktree"
                aria-label="新建 worktree"
                disabled={worktreeBusy || branch.trim().length === 0}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] bg-bg-selected text-accent disabled:opacity-40"
                onClick={() => {
                  onCreateWorktree(branch.trim());
                  setBranch('');
                  setOpen(false);
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          </>
        )}
        {currentWorktree === null && active !== undefined && !hasWorktrees && (
          <p className="px-1.5 py-1 text-[10.5px] text-text-dim">非 git 仓库：无 worktree</p>
        )}
      </div>
    </Popover>
  );
}
