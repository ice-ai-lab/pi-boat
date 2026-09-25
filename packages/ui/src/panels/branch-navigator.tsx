import { CornerUpLeft, GitBranch, GitFork } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../utils/cn';
import { PanelShell } from './panel-shell';

/**
 * BranchNavigator（docs/06 §4.4）：会话树（分支）导航。
 * 只依赖 `GET /api/sessions/:id` 的 `tree`（SessionTreeNode[]）+ 当前叶 id；
 * 动作 fork / navigate / clone 由宿主调用命令通道（fork 是**破坏性原地替换**，见 docs/01 §8-1）。
 */
export interface BranchNodeView {
  id: string;
  parentId: string | null;
  /** 行摘要（用户消息 / 助手首句 / 条目类型） */
  label: string;
  /** 是否为当前叶所在路径上的节点 */
  onActivePath: boolean;
  /** 当前叶 */
  isLeaf: boolean;
  depth: number;
  /** 可从这里分叉（user 消息锚点） */
  forkable: boolean;
}

export interface BranchNavigatorProps {
  nodes: BranchNodeView[];
  leafCount: number;
  activeLeafId: string | null;
  busy: boolean;
  onNavigate(nodeId: string): void;
  onFork(nodeId: string): void;
  onClone(): void;
  onClose(): void;
}

export function BranchNavigator({
  nodes,
  leafCount,
  activeLeafId,
  busy,
  onNavigate,
  onFork,
  onClone,
  onClose,
}: BranchNavigatorProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const byParent = new Map<string | null, BranchNodeView[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const renderLevel = (parentId: string | null, depth: number): ReactNode =>
    (byParent.get(parentId) ?? []).map((node) => {
      const children = byParent.get(node.id) ?? [];
      const isOpen = expanded.has(node.id) || node.onActivePath;
      return (
        <div key={node.id}>
          <div
            className={cn(
              'hairline-b flex items-center gap-1.5 border-line-1 py-1',
              node.onActivePath ? 'text-fg' : 'text-fg-subtle',
            )}
            style={{ paddingLeft: depth * 12 }}
          >
            {children.length > 0 ? (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  })
                }
                className="sq w-4 shrink-0 text-fg-faint hover:text-fg"
              >
                {isOpen ? '▾' : '▸'}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {node.isLeaf && <GitBranch size={11} className="shrink-0 text-accent" />}
            <span className="min-w-0 flex-1 truncate text-[12px]">{node.label}</span>
            {node.forkable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onFork(node.id)}
                title="从这里分叉（原地替换会话）"
                aria-label="分叉"
                className="sq shrink-0 px-1 text-fg-faint hover:bg-hover hover:text-fg disabled:opacity-40"
              >
                <GitFork size={11} />
              </button>
            )}
            {!node.isLeaf && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onNavigate(node.id)}
                title="切换到这个节点（同一会话文件内换叶）"
                aria-label="切换到这个节点"
                className="sq shrink-0 px-1 text-fg-faint hover:bg-hover hover:text-fg disabled:opacity-40"
              >
                <CornerUpLeft size={11} />
              </button>
            )}
          </div>
          {isOpen && children.length > 0 && renderLevel(node.id, depth + 1)}
        </div>
      );
    });

  return (
    <PanelShell
      title="分支"
      hint={`${leafCount} 个叶节点${activeLeafId === null ? '' : ` · 当前 ${activeLeafId.slice(0, 6)}`}`}
      onClose={onClose}
      actions={
        <button
          type="button"
          disabled={busy}
          onClick={onClone}
          className="sq px-2 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-40"
        >
          克隆为独立会话
        </button>
      }
    >
      {nodes.length === 0 ? (
        <p className="py-2 text-[12px] text-fg-faint">没有分支（这是线性会话）</p>
      ) : (
        <div className="flex flex-col">{renderLevel(null, 0)}</div>
      )}
    </PanelShell>
  );
}
