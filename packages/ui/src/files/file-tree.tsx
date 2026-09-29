import { fileByteUrl, getRelativeFilePath } from '@ice-ai/client';
import type { FileListEntry, GitFileStatus, GitFileStatusKind } from '@ice-ai/protocol';
import { useRef, useState } from 'react';
import { useScrollbarVisibility } from '../utils/use-scrollbar-visibility';
import { FileIcon } from './file-icon';
import styles from './file-tree.module.css';

/**
 * FileTree（2026 视觉替换自 dsh-file-explorer）：
 * - 行：`height:28` / `paddingLeft: 8 + depth*12` / `gap:6` / `radius:8` / 文字 13px
 * - chevron 12px（目录才显示，展开旋转 90°），图标 16px（目录走 `--accent`）
 * - hover / 选中同为 `--bg-hover`（参照实现无边框、无底纹）
 * - git 徽标：14×14 / mono 11 / 600 / **仅未 hover 显示**
 * - hover 时右侧出现「提及」（`@`）与「下载」圆形幽灵按钮
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

/** 目录优先、再按名称排序（A 类按设计规范的 dirent 排序语义） */
export function sortEntries(entries: readonly FileListEntry[]): FileListEntry[] {
  return [...entries].sort((a, b) => {
    const aDir = a.type === 'directory';
    const bDir = b.type === 'directory';
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** git 徽标色（设计规范 `GIT_STATUS_COLORS`） */
const GIT_STATUS_COLORS: Record<GitFileStatusKind, string> = {
  modified: '#d6a84b',
  added: 'var(--green)',
  deleted: 'var(--red)',
  renamed: 'var(--accent)',
  untracked: 'var(--green)',
  conflict: 'var(--red)',
};

const GIT_STATUS_CODES: Record<GitFileStatusKind, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflict: 'C',
};

/** 缩进几何：参照实现的 `8 + depth * 12` */
function indentOf(depth: number): number {
  return 8 + depth * 12;
}

/** 展开箭头（dsh-file-explorer 同款 16viewBox / 12px 描边箭头） */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={12}
      height={12}
      fill="none"
      aria-hidden="true"
      className={`${styles.chev}${open ? ` ${styles.chevOpen}` : ''}`}
    >
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GitStatusBadge({ status, label }: { status: GitFileStatus; label: string }) {
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className={styles.badge}
      style={{ color: GIT_STATUS_COLORS[status.kind] }}
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
    return <p className={styles.hint}>展开以加载文件…</p>;
  }

  return (
    // ARIA tree 模式要求 role=tree/item/group（无等价原生元素）
    <div ref={scrollRef} className={`scrollbar-subtle ${styles.tree}`} role="tree">
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
    <div role="group" className={styles.group}>
      {entries.map((entry) => (
        <TreeNode key={entry.path} entry={entry} depth={depth} {...rest} />
      ))}
      {entries.length === 0 && (
        <p className={styles.hint} style={{ paddingLeft: indentOf(depth) }}>
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
  const active = activePath === entry.path;

  return (
    <div role="treeitem" tabIndex={-1} aria-expanded={isDir ? expanded : undefined}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 按参照实现文件树行（点击展开/打开） */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上——键盘入口由 role=tree 的容器与行内按钮提供 */}
      <div
        className={`${styles.row}${active ? ` ${styles.rowActive}` : ''}`}
        style={{ paddingLeft: indentOf(depth) }}
        onClick={() => (isDir ? onToggleDir(entry.path) : onOpenFile(entry.path))}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {isDir ? (
          <Chevron open={expanded} />
        ) : (
          <span className={`${styles.chev} ${styles.chevNone}`} />
        )}
        <span className={styles.icon}>
          {loading ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
            </svg>
          ) : (
            <FileIcon
              name={entry.name}
              isDir={isDir}
              expanded={expanded}
              tone={isDir ? 'accent' : 'muted'}
            />
          )}
        </span>
        <span className={styles.name} title={entry.path}>
          {entry.name}
        </span>
        {!hovered && !isDir && status !== undefined && (
          <GitStatusBadge status={status} label={status.kind} />
        )}
        {/* hover：右侧「提及 / 下载」 */}
        {onAtMention !== undefined && hovered && (
          <button
            type="button"
            className={styles.action}
            style={{ right: isDir ? 4 : 30 }}
            onClick={(e) => {
              e.stopPropagation();
              onAtMention(relative, isDir);
            }}
            title="插入路径"
            aria-label="插入路径"
          >
            <svg
              width="12"
              height="12"
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
          </button>
        )}
        {hovered && !isDir && (
          <a
            href={fileByteUrl(entry.path, 'download')}
            download
            onClick={(e) => e.stopPropagation()}
            title="下载"
            aria-label="下载"
            className={styles.action}
            style={{ right: 4 }}
          >
            <svg
              width="12"
              height="12"
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
            <span className="sr-only">下载</span>
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
