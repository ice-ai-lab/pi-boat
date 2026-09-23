import { useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 右侧 FileDock 内部（原型 `.dock-in` + `.dock-head`(.dt/.dock-tabs) + `.dock-body` +
 * `.ftree`/`.frow`/`.fsec`/`.badge`）。外层 `.dock`（宽度动画壳）由 AppShell 持有。
 *
 * M1 状态：`GET /api/files/*` 与 git 域在 M3（docs/01 §6），因此**不放假文件树**——
 * 结构与样式已按原型就位，数据由 M3 的取数层接入；此刻显示明确的未接入说明。
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
  tree?: readonly FileNode[];
  changes?: readonly FileChange[];
  onClose: () => void;
  onRefresh?: () => void;
  className?: string;
}

type DockTab = 'files' | 'changes';

const EMPTY_TEXT = '文件与变更数据来自 M3 的 /api/files 与 git 域，尚未接入。';

export function FileDock({
  tree = [],
  changes = [],
  onClose,
  onRefresh,
  className,
}: FileDockProps) {
  const [tab, setTab] = useState<DockTab>('files');
  return (
    <aside className={cn('dock-in', className)}>
      <div className="dock-head">
        <span className="dt">EXPLORER</span>
        <div className="dock-tabs">
          <button
            type="button"
            className={cn('dock-tab', tab === 'files' && 'on')}
            onClick={() => setTab('files')}
          >
            文件
          </button>
          <button
            type="button"
            className={cn('dock-tab', tab === 'changes' && 'on')}
            onClick={() => setTab('changes')}
          >
            变更
            {changes.length > 0 ? <span className="badge m num">{changes.length}</span> : null}
          </button>
        </div>
        {onRefresh === undefined ? null : (
          <button
            type="button"
            className="ico-btn"
            style={{ width: 24, height: 24 }}
            title="刷新"
            aria-label="刷新文件面板"
            onClick={onRefresh}
          >
            <Icon name="refresh" size={12} />
          </button>
        )}
        <button
          type="button"
          className="ico-btn"
          style={{ width: 24, height: 24 }}
          title="收起面板"
          aria-label="收起文件面板"
          onClick={onClose}
        >
          <Icon name="panel" size={12} />
        </button>
      </div>
      <div className="dock-body">
        {tab === 'files' ? (
          <FileTree nodes={tree} />
        ) : (
          <ChangeList changes={changes} onRefresh={onRefresh} />
        )}
      </div>
    </aside>
  );
}

function FileTree({ nodes, depth = 0 }: { nodes: readonly FileNode[]; depth?: number }) {
  if (nodes.length === 0) return <EmptyDock text={EMPTY_TEXT} />;
  return (
    <div className="ftree">
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
        className={cn('frow', isDir && 'dir')}
        data-depth={depth}
        role="treeitem"
        aria-expanded={isDir ? open : undefined}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (isDir) setOpen((value) => !value);
        }}
      >
        <Icon name="chev" size={10} className={isDir ? (open ? 'chev8 open' : 'chev8') : 'void'} />
        <Icon name={isDir ? 'folder' : 'file'} size={12} />
        <span>{node.name}</span>
        {node.git === undefined ? null : (
          <span className={cn('badge', node.git.toLowerCase())}>{node.git}</span>
        )}
      </button>
      {isDir && open && node.children !== undefined ? (
        <div>
          <FileTree nodes={node.children} depth={depth + 1} />
        </div>
      ) : null}
    </>
  );
}

function ChangeList({
  changes,
  onRefresh,
}: {
  changes: readonly FileChange[];
  onRefresh?: (() => void) | undefined;
}) {
  if (changes.length === 0) return <EmptyDock text={EMPTY_TEXT} />;
  return (
    <>
      <div className="fsec">工作区变更 · {changes.length}</div>
      {changes.map((change) => (
        <button
          key={change.path}
          type="button"
          className="frow"
          title={onRefresh === undefined ? change.path : `${change.path}（点击刷新）`}
          onClick={onRefresh}
        >
          <Icon name="file" size={12} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{change.path}</span>
          <span className="badge m">{change.status}</span>
          {change.plus === undefined && change.minus === undefined ? null : (
            <span className="num" style={{ fontSize: 10, color: 'var(--t4)' }}>
              {change.plus === undefined ? null : `+${change.plus}`}
              {change.minus === undefined ? null : ` −${change.minus}`}
            </span>
          )}
        </button>
      ))}
    </>
  );
}

function EmptyDock({ text }: { text: string }) {
  return <p style={{ padding: '12px', fontSize: 11, color: 'var(--t4)' }}>{text}</p>;
}
