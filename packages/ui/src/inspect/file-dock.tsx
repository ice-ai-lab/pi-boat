import { useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 右侧栏文件 dock（原型 `.rightbar` + `.dock-tabs` + `.dock-pane`：文件 / 变更 / 查看器）。
 *
 * M1 状态：`GET /api/files/*` 与 git 域在 M3（docs/01 §6），因此**不放假文件树**——
 * 结构与样式（.tree-toolbar / .tree / .chg-row / .viewer）已按原型就位，
 * 数据由 M3 的取数层接入；此刻显示明确的未接入说明。默认收起（原型 `app.rb-collapsed`）。
 */
export interface FileNode {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  children?: FileNode[];
  git?: 'M' | 'A' | 'U';
  modified?: boolean;
}

export interface FileChange {
  status: 'M' | 'A' | 'U';
  path: string;
  plus?: number;
  minus?: number;
}

export interface FileDockProps {
  /** 展开态；收起时由 CSS `.rb-collapsed` 处理，这里只控制 dock 内动作 */
  rootLabel?: string;
  tree?: readonly FileNode[];
  changes?: readonly FileChange[];
  onClose: () => void;
  onRefresh?: () => void;
  className?: string;
}

type DockTab = 'files' | 'changes';

export function FileDock({
  rootLabel = 'EXPLORER',
  tree = [],
  changes = [],
  onClose,
  onRefresh,
  className,
}: FileDockProps) {
  const [tab, setTab] = useState<DockTab>('files');
  return (
    <aside className={cn('rightbar', className)}>
      <div className="dock-tabs">
        <button
          type="button"
          className={cn('dtab sq', tab === 'files' && 'on')}
          onClick={() => setTab('files')}
        >
          <Icon name="folder" size={14} />
          文件
        </button>
        <button
          type="button"
          className={cn('dtab sq', tab === 'changes' && 'on')}
          onClick={() => setTab('changes')}
        >
          <Icon name="branch" size={14} />
          变更
          {changes.length > 0 ? (
            <span className="num" style={{ fontSize: 10, color: 'var(--amber)' }}>
              {changes.length}
            </span>
          ) : null}
        </button>
        <span className="grow" />
        <button
          type="button"
          className="icon-btn"
          title="收起面板"
          aria-label="收起文件面板"
          onClick={onClose}
        >
          <Icon name="panel" size={14} />
        </button>
      </div>
      <div className="dock-body">
        <div className={cn('dock-pane', tab === 'files' && 'on')}>
          <div className="tree-toolbar">
            <span>{rootLabel}</span>
            <span className="ops">
              <button
                type="button"
                className="icon-btn"
                style={{ width: 20, height: 20 }}
                title="刷新"
                aria-label="刷新文件树"
                onClick={onRefresh}
              >
                <Icon name="refresh" size={12} />
              </button>
            </span>
          </div>
          <FileTree nodes={tree} />
        </div>
        <div className={cn('dock-pane', tab === 'changes' && 'on')}>
          <div className="tree-toolbar">
            <span>工作区变更</span>
            <span className="ops">
              <button
                type="button"
                className="icon-btn"
                style={{ width: 20, height: 20 }}
                title="刷新"
                aria-label="刷新变更列表"
                onClick={onRefresh}
              >
                <Icon name="refresh" size={12} />
              </button>
            </span>
          </div>
          {changes.length === 0 ? (
            <EmptyDock text="文件与变更数据来自 M3 的 /api/files 与 git 域，尚未接入。" />
          ) : (
            changes.map((change) => (
              <div key={change.path} className="chg-row sq">
                <span className={cn('st', change.status)}>{change.status}</span>
                <span className="p">{change.path}</span>
                <span className="delta num">
                  {change.plus === undefined ? null : <span className="plus">+{change.plus}</span>}{' '}
                  {change.minus === undefined ? null : (
                    <span className="minus">−{change.minus}</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

function FileTree({ nodes, depth = 0 }: { nodes: readonly FileNode[]; depth?: number }) {
  if (nodes.length === 0) {
    return <EmptyDock text="文件与变更数据来自 M3 的 /api/files 与 git 域，尚未接入。" />;
  }
  return (
    <div className="tree">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} depth={depth} />
      ))}
    </div>
  );
}

function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const isDir = node.kind === 'dir';
  return (
    <>
      <button
        type="button"
        className={cn('tnode sq', isDir && open && 'open')}
        data-depth={depth}
        role="treeitem"
        aria-expanded={isDir ? open : undefined}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => {
          if (isDir) setOpen((value) => !value);
        }}
      >
        <Icon name="chev-r" size={12} className={isDir ? 'chev' : 'chev void'} />
        <Icon name={isDir ? 'folder' : 'file'} size={14} className="fico" />
        <span className="nm">{node.name}</span>
        {node.modified === true ? <span className="dotm" /> : null}
        {node.git === undefined ? null : <span className={cn('git', node.git)}>{node.git}</span>}
      </button>
      {isDir && open && node.children !== undefined ? (
        <div className="branch-kids">
          <FileTree nodes={node.children} depth={depth + 1} />
        </div>
      ) : null}
    </>
  );
}

function EmptyDock({ text }: { text: string }) {
  return <p style={{ padding: '12px', fontSize: 11, color: 'var(--t4)' }}>{text}</p>;
}
