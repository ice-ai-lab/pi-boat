import { getRelativeFilePath } from '@ice-ai/client';
import type { FileListEntry, GitFileStatus } from '@ice-ai/protocol';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../utils/cn';
import { FileIcon } from './file-icon';

/**
 * FileTree（docs/06 §4.3）：侧栏文件树。目录懒加载（展开时由宿主取 list），
 * 节点是 button（可键盘访问，docs/06 §9.2）；git 状态徽标取 `git/status` 的路径映射。
 */
export interface FileTreeProps {
  /** 根目录绝对路径（展示用） */
  root: string;
  /** 已加载的目录内容：绝对路径 → 条目 */
  entriesByPath: ReadonlyMap<string, FileListEntry[]>;
  /** 正在加载的目录 */
  loadingPaths?: ReadonlySet<string>;
  expandedPaths: ReadonlySet<string>;
  activePath: string | null;
  /** git 状态：相对 root 的路径 → 状态 */
  gitStatus?: ReadonlyMap<string, GitFileStatus>;
  onToggleDir(path: string): void;
  onOpenFile(path: string): void;
}

/** 目录优先、再按名称排序（A 类移植自 pi-web 的 dirent 排序语义） */
export function sortEntries(entries: readonly FileListEntry[]): FileListEntry[] {
  return [...entries].sort((a, b) => {
    const aDir = a.type === 'directory';
    const bDir = b.type === 'directory';
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const GIT_BADGE: Record<GitFileStatus['kind'], { label: string; tone: string }> = {
  modified: { label: 'M', tone: 'text-warn' },
  added: { label: 'A', tone: 'text-success' },
  deleted: { label: 'D', tone: 'text-danger' },
  renamed: { label: 'R', tone: 'text-tool-read' },
  untracked: { label: 'U', tone: 'text-fg-faint' },
  conflict: { label: 'C', tone: 'text-danger' },
};

export function FileTree({
  root,
  entriesByPath,
  loadingPaths,
  expandedPaths,
  activePath,
  gitStatus,
  onToggleDir,
  onOpenFile,
}: FileTreeProps) {
  const rootEntries = entriesByPath.get(root);

  if (rootEntries === undefined) {
    return <p className="px-2 py-2 text-[11.5px] text-fg-faint">展开以加载文件…</p>;
  }

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1" role="tree">
      <TreeLevel
        entries={sortEntries(rootEntries)}
        depth={0}
        entriesByPath={entriesByPath}
        loadingPaths={loadingPaths}
        expandedPaths={expandedPaths}
        activePath={activePath}
        gitStatus={gitStatus}
        root={root}
        onToggleDir={onToggleDir}
        onOpenFile={onOpenFile}
      />
    </div>
  );
}

interface TreeLevelProps extends Omit<FileTreeProps, 'root'> {
  entries: FileListEntry[];
  depth: number;
  root: string;
}

function TreeLevel({
  entries,
  depth,
  entriesByPath,
  loadingPaths,
  expandedPaths,
  activePath,
  gitStatus,
  root,
  onToggleDir,
  onOpenFile,
}: TreeLevelProps) {
  return (
    // ARIA tree 模式要求 role=group（无等价原生元素）
    // biome-ignore lint/a11y/useSemanticElements: 见上行说明
    <div role="group">
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={depth}
          entriesByPath={entriesByPath}
          loadingPaths={loadingPaths}
          expandedPaths={expandedPaths}
          activePath={activePath}
          gitStatus={gitStatus}
          root={root}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      ))}
      {entries.length === 0 && (
        <p className="px-2 py-1 text-[11px] text-fg-faint" style={{ paddingLeft: depth * 12 + 8 }}>
          空目录
        </p>
      )}
    </div>
  );
}

function TreeNode({
  entry,
  depth,
  entriesByPath,
  loadingPaths,
  expandedPaths,
  activePath,
  gitStatus,
  root,
  onToggleDir,
  onOpenFile,
}: Omit<TreeLevelProps, 'entries'> & { entry: FileListEntry }) {
  const isDir = entry.type === 'directory';
  const expanded = expandedPaths.has(entry.path);
  const children = entriesByPath.get(entry.path);
  const relative = getRelativeFilePath(entry.path, root);
  const status = gitStatus?.get(relative);
  const [hovered, setHovered] = useState(false);

  const badge = useMemo(() => (status === undefined ? null : GIT_BADGE[status.kind]), [status]);

  return (
    // 焦点由内部 button 承担（roving tabindex 模式下容器仅标 tabIndex=-1）
    <div role="treeitem" tabIndex={-1} aria-expanded={isDir ? expanded : undefined}>
      <button
        type="button"
        title={relative}
        onClick={() => (isDir ? onToggleDir(entry.path) : onOpenFile(entry.path))}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'flex w-full items-center gap-1 rounded-[6px] py-[3px] pr-1.5 text-left text-[12px]',
          activePath === entry.path ? 'bg-accent-weak text-accent' : 'text-fg-muted hover:bg-hover',
        )}
        style={{ paddingLeft: depth * 12 + 6 }}
      >
        {isDir ? (
          <ChevronRight
            size={11}
            className={cn('shrink-0 text-fg-faint transition-transform', expanded && 'rotate-90')}
          />
        ) : (
          <span className="w-[11px] shrink-0" />
        )}
        {loadingPaths?.has(entry.path) === true ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-accent" />
        ) : (
          <FileIcon name={entry.name} isDir={isDir} expanded={expanded} />
        )}
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        {badge !== null && (
          <span className={cn('shrink-0 font-mono text-[10px]', badge.tone)} title={status?.kind}>
            {badge.label}
          </span>
        )}
        {hovered && !isDir && entry.size !== undefined && (
          <span className="shrink-0 font-mono text-[10px] text-fg-faint">
            {formatSizeShort(entry.size)}
          </span>
        )}
      </button>
      {isDir && expanded && children !== undefined && (
        <TreeLevel
          entries={sortEntries(children)}
          depth={depth + 1}
          entriesByPath={entriesByPath}
          loadingPaths={loadingPaths}
          expandedPaths={expandedPaths}
          activePath={activePath}
          gitStatus={gitStatus}
          root={root}
          onToggleDir={onToggleDir}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  );
}

function formatSizeShort(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
