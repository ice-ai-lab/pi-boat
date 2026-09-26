import { fileByteUrl, getRelativeFilePath } from '@ice-ai/client';
import type { FileListEntry, GitFileStatus, GitFileStatusKind } from '@ice-ai/protocol';
import { useRef, useState } from 'react';
import { useScrollbarVisibility } from '../utils/use-scrollbar-visibility';
import { FileIcon } from './file-icon';

/**
 * FileTree（T2-16：行几何 / git 徽标 / 行内「提及·下载」逐条对齐 pi-web `FileExplorer`）：
 * - 行：`paddingLeft: 8 + depth*14` / `height:24` / `gap:4` / `radius:4` / 文字 `var(--text)`
 * - git 徽标：14×14 / mono 11 / 600 / untracked 绿 `#4ade80` / **仅未 hover 显示**
 * - hover 时右侧出现「提及」（`@`）与「下载」
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
  /** 「提及」：把相对路径插入输入框（`@path`）。不传则不渲染该按钮 */
  onAtMention?(relativePath: string, isDir: boolean): void;
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

/** git 徽标色（pi-web `GIT_STATUS_COLORS`） */
const GIT_STATUS_COLORS: Record<GitFileStatusKind, string> = {
  modified: '#d6a84b',
  added: '#4ade80',
  deleted: '#f87171',
  renamed: '#60a5fa',
  untracked: '#4ade80',
  conflict: '#f87171',
};

const GIT_STATUS_CODES: Record<GitFileStatusKind, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflict: 'C',
};

function GitStatusBadge({ status, label }: { status: GitFileStatus; label: string }) {
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      style={{
        width: 14,
        height: 14,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: GIT_STATUS_COLORS[status.kind],
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {GIT_STATUS_CODES[status.kind]}
    </span>
  );
}

export function FileTree({
  root,
  entriesByPath,
  loadingPaths,
  expandedPaths,
  activePath,
  gitStatus,
  onToggleDir,
  onOpenFile,
  onAtMention,
}: FileTreeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useScrollbarVisibility(scrollRef);
  const rootEntries = entriesByPath.get(root);

  if (rootEntries === undefined) {
    return <p className="px-2 py-2 text-[11.5px] text-fg-faint">展开以加载文件…</p>;
  }

  return (
    // ARIA tree 模式要求 role=tree/item/group（无等价原生元素）
    <div ref={scrollRef} className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto" role="tree">
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
        onAtMention={onAtMention}
      />
    </div>
  );
}

interface TreeLevelProps extends Omit<FileTreeProps, 'root'> {
  entries: FileListEntry[];
  depth: number;
  root: string;
}

function TreeLevel({ entries, depth, ...rest }: TreeLevelProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: ARIA tree 模式的 group 角色（无等价原生元素）
    <div role="group">
      {entries.map((entry) => (
        <TreeNode key={entry.path} entry={entry} depth={depth} {...rest} />
      ))}
      {entries.length === 0 && (
        <p className="px-2 py-1 text-[11px] text-fg-faint" style={{ paddingLeft: depth * 14 + 8 }}>
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
  onAtMention,
}: Omit<TreeLevelProps, 'entries'> & { entry: FileListEntry }) {
  const isDir = entry.type === 'directory';
  const expanded = expandedPaths.has(entry.path);
  const children = entriesByPath.get(entry.path);
  const relative = getRelativeFilePath(entry.path, root);
  const status = gitStatus?.get(relative);
  const [hovered, setHovered] = useState(false);
  const loading = loadingPaths?.has(entry.path) === true;

  return (
    <div role="treeitem" tabIndex={-1} aria-expanded={isDir ? expanded : undefined}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 逐字移植 pi-web 文件树行（点击展开/打开） */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上——键盘入口由 role=tree 的容器与行内按钮提供 */}
      <div
        onClick={() => (isDir ? onToggleDir(entry.path) : onOpenFile(entry.path))}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 8 + depth * 14,
          paddingRight: 8,
          height: 24,
          cursor: 'pointer',
          background: hovered ? 'var(--bg-hover)' : 'transparent',
          borderRadius: 4,
          userSelect: 'none',
        }}
      >
        {isDir ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              flexShrink: 0,
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.1s',
            }}
          >
            <polyline points="3 2 7 5 3 8" />
          </svg>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {loading ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-dim)"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
            </svg>
          ) : (
            <FileIcon name={entry.name} isDir={isDir} expanded={expanded} />
          )}
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={entry.path}
        >
          {entry.name}
        </span>
        {!hovered && !isDir && status !== undefined && (
          <GitStatusBadge status={status} label={status.kind} />
        )}
        {/* hover：右侧「提及 / 下载」（T2-16 / L22） */}
        {onAtMention !== undefined && hovered && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAtMention(relative, isDir);
            }}
            title="插入路径"
            style={{
              position: 'absolute',
              right: isDir ? 4 : 28,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '0 8px',
              height: 20,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
            </svg>
            提及
          </button>
        )}
        {hovered && !isDir && (
          <a
            href={fileByteUrl(entry.path, 'download')}
            download
            onClick={(e) => e.stopPropagation()}
            title="下载"
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '0 5px',
              height: 20,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
              }}
            >
              下载
            </span>
          </a>
        )}
      </div>
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
          onAtMention={onAtMention}
        />
      )}
    </div>
  );
}
