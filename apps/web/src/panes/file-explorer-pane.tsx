import { getFileIndex, uploadFiles } from '@ice-ai/client';
import { useGitStatusQuery } from '@ice-ai/client/react';
import { FileTree, useI18n } from '@ice-ai/ui';
import {
  type ChangeEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { fileTabsStore } from '../services/file-tabs-store';
import { useFileTree } from '../services/use-file-tree';

/**
 * FileExplorerPane（T2 重排）：EXPLORER 区内容——文件树 + 文件搜索面板 + 变更文件区块。
 * 头部（路径行 / 上传按钮）上移到 EXPLORER 图标行（Sidebar 提供），这里只剩内容。
 * 上传入口经 `FileExplorerHandle.openUploadPicker()` 暴露（pi-web `FileExplorerHandle` 同款）。
 */
export interface FileExplorerPaneProps {
  /** 当前项目根（树根 = git 状态查询 cwd） */
  root: string | null;
  /** 文件搜索面板开合（EXPLORER 头部图标驱动，T2-11） */
  fileSearchOpen: boolean;
  onFileSearchOpenChange(open: boolean): void;
  /** 变更文件区块折叠态（头部图标驱动；true = 折叠） */
  changesCollapsed: boolean;
  /** 刷新信号（EXPLORER 头部刷新图标驱动；自增触发重载） */
  refreshKey: number;
  /** 服务端解析出的真实根（符号链接路径下与 root 不同；上抛给布局，供右栏共用） */
  onResolvedRoot?(resolvedRoot: string): void;
  /** 上传忙态回传（EXPLORER 头部上传图标禁用） */
  onUploadBusyChange?(busy: boolean): void;
  /** 行内「提及」：把相对路径插入 Composer 草稿 */
  onAtMention?(relativePath: string, isDir: boolean): void;
  onError(message: string): void;
  onNotice(message: string): void;
}

/** 命令式接口（上传选择器；pi-web `FileExplorerHandle`） */
export interface FileExplorerHandle {
  openUploadPicker(): void;
}

/** git 状态色（pi-web `GIT_STATUS_COLORS`） */
const GIT_STATUS_COLORS: Record<string, string> = {
  modified: '#e2b34d',
  added: '#4ade80',
  deleted: '#f87171',
  renamed: '#a78bfa',
  untracked: '#4ade80',
  conflict: '#f87171',
};

export const FileExplorerPane = forwardRef<FileExplorerHandle, FileExplorerPaneProps>(
  function FileExplorerPane(
    {
      root,
      fileSearchOpen,
      onFileSearchOpenChange,
      changesCollapsed,
      refreshKey,
      onResolvedRoot,
      onUploadBusyChange,
      onAtMention,
      onError,
      onNotice,
    },
    ref,
  ) {
    const { t } = useI18n();
    const tree = useFileTree(root);
    const effectiveRoot = tree.resolvedRoot ?? root;
    const gitStatus = useGitStatusQuery(effectiveRoot);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(false);
    const [searchPaths, setSearchPaths] = useState<string[]>([]);

    useImperativeHandle(
      ref,
      () => ({
        openUploadPicker() {
          inputRef.current?.click();
        },
      }),
      [],
    );

    // 真实根上抛（右栏的相对路径与 git 查询要用同一基准）
    useEffect(() => {
      if (tree.resolvedRoot !== null) onResolvedRoot?.(tree.resolvedRoot);
    }, [tree.resolvedRoot, onResolvedRoot]);

    // 刷新信号：重载根目录（react-query 缓存由 refetch 处理，这里只需树）
    // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey 是显式信号量
    useEffect(() => {
      if (root !== null) tree.reloadDir(root);
    }, [refreshKey]);

    // 文件搜索面板打开时聚焦输入框
    useEffect(() => {
      if (fileSearchOpen) searchInputRef.current?.focus();
    }, [fileSearchOpen]);

    // 文件搜索：150ms 防抖 + 索引端点（pi-web FileExplorer 的 fileSearch）
    const hasSearchQuery = searchQuery.trim().length > 0;
    // biome-ignore lint/correctness/useExhaustiveDependencies: 防抖只随查询词变化
    useEffect(() => {
      if (!fileSearchOpen || !hasSearchQuery || effectiveRoot === null) return;
      const query = searchQuery.trim();
      const timer = setTimeout(() => {
        setSearchLoading(true);
        setSearchError(false);
        getFileIndex(effectiveRoot, query)
          .then((index) => {
            setSearchPaths(index.files.slice(0, 200));
            setSearchLoading(false);
          })
          .catch(() => {
            setSearchError(true);
            setSearchLoading(false);
          });
      }, 150);
      return () => clearTimeout(timer);
    }, [searchQuery, fileSearchOpen, effectiveRoot]);

    const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])];
      event.target.value = '';
      if (files.length === 0 || root === null) return;
      setUploading(true);
      onUploadBusyChange?.(true);
      try {
        const result = await uploadFiles(root, files, 'rename');
        const renamed = result.uploaded.filter((entry) => entry.finalName !== undefined).length;
        onNotice(
          `已上传 ${result.uploaded.length} 个文件${renamed > 0 ? `（${renamed} 个同名已重命名）` : ''}${
            result.skipped.length > 0 ? `，跳过 ${result.skipped.length} 个` : ''
          }`,
        );
        tree.reloadDir(root);
      } catch (caught) {
        onError(caught instanceof Error ? caught.message : '上传失败');
      } finally {
        setUploading(false);
        onUploadBusyChange?.(false);
      }
    };

    if (root === null || effectiveRoot === null) {
      return <p className="px-3 py-3 text-[12px] text-fg-faint">选择项目后可浏览文件</p>;
    }

    const gitFiles = gitStatus.data?.files ?? [];
    const gitMap = new Map(gitFiles.map((file) => [file.path, file] as const));
    const openFile = (path: string, diff: boolean) => {
      const status = gitMap.get(path.slice(effectiveRoot.length + 1));
      fileTabsStore.open(path, diff || (status !== undefined && status.kind !== 'untracked'));
    };

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          disabled={uploading}
          onChange={(event) => void onPick(event)}
        />

        {/* 变更文件区块（T2-11；折叠由 EXPLORER 头部图标控制） */}
        {!changesCollapsed && gitFiles.length > 0 && (
          <div style={{ padding: '0 4px 2px' }}>
            <div
              role="status"
              aria-label={t('files.changeStats', {
                count: gitFiles.length,
                additions: gitStatus.data?.additions ?? 0,
                deletions: gitStatus.data?.deletions ?? 0,
              })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 24,
                padding: '0 10px',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--text-dim)' }}>
                {t('files.changedCount', { count: gitFiles.length })}
              </span>
              <span style={{ color: GIT_STATUS_COLORS.added, fontFamily: 'var(--font-mono)' }}>
                +{gitStatus.data?.additions ?? 0}
              </span>
              <span style={{ color: GIT_STATUS_COLORS.deleted, fontFamily: 'var(--font-mono)' }}>
                -{gitStatus.data?.deletions ?? 0}
              </span>
            </div>
            {gitFiles.map((status) => (
              <button
                key={`${status.kind}:${status.path}`}
                type="button"
                title={status.path}
                onClick={() => {
                  const absolute = status.path.startsWith('/')
                    ? status.path
                    : `${effectiveRoot}/${status.path}`;
                  openFile(absolute, true);
                }}
                className="flex w-full cursor-pointer items-center gap-1.5 rounded-[4px] px-2 py-[3px] text-left hover:bg-bg-hover"
                style={{ height: 24 }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: GIT_STATUS_COLORS[status.kind] ?? 'var(--text-dim)',
                    minWidth: 10,
                  }}
                >
                  {status.kind === 'modified'
                    ? 'M'
                    : status.kind === 'added'
                      ? 'A'
                      : status.kind === 'deleted'
                        ? 'D'
                        : status.kind === 'renamed'
                          ? 'R'
                          : status.kind === 'conflict'
                            ? 'C'
                            : 'U'}
                </span>
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  {status.path}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 文件搜索面板（T2-11） */}
        {fileSearchOpen && (
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
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
                style={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-dim)',
                  pointerEvents: 'none',
                }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onFileSearchOpenChange(false);
                }}
                placeholder={t('sidebar.searchFilesPlaceholder')}
                aria-label={t('sidebar.searchFiles')}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 24px',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  outline: 'none',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title={t('sidebar.clearSearch')}
                  aria-label={t('sidebar.clearSearch')}
                  style={{
                    position: 'absolute',
                    right: 4,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    padding: 0,
                    border: 'none',
                    borderRadius: 4,
                    background: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-hover)';
                    e.currentTarget.style.color = 'var(--text)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'none';
                    e.currentTarget.style.color = 'var(--text-dim)';
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              )}
            </div>
            {hasSearchQuery && (
              <div style={{ paddingTop: 3 }}>
                {searchLoading && (
                  <div
                    role="status"
                    style={{ padding: '6px 2px', fontSize: 10, color: 'var(--text-dim)' }}
                  >
                    {t('sidebar.searchingFiles')}
                  </div>
                )}
                {!searchLoading && searchError && (
                  <div role="alert" style={{ padding: '6px 2px', fontSize: 10, color: '#f87171' }}>
                    {t('i18n.networkError')}
                  </div>
                )}
                {!searchLoading && !searchError && searchPaths.length === 0 && (
                  <div style={{ padding: '6px 2px', fontSize: 10, color: 'var(--text-dim)' }}>
                    {t('sidebar.noMatchingFiles')}
                  </div>
                )}
                {!searchLoading && !searchError && searchPaths.length > 0 && (
                  <div>
                    {searchPaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        title={path}
                        onClick={() => openFile(path, false)}
                        className="flex w-full cursor-pointer items-center rounded-[4px] px-2 text-left hover:bg-bg-hover"
                        style={{ height: 24 }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 11,
                            color: 'var(--text)',
                          }}
                        >
                          {path}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tree.error !== null && (
          <p className="sq mx-0.5 bg-danger-soft px-2 py-1 text-[11.5px] text-danger">
            {tree.error}
          </p>
        )}
        <FileTree
          root={effectiveRoot ?? root}
          entriesByPath={tree.entriesByPath}
          loadingPaths={tree.loadingPaths}
          expandedPaths={tree.expandedPaths}
          activePath={null}
          gitStatus={gitMap}
          onToggleDir={tree.toggleDir}
          onOpenFile={(path) => openFile(path, false)}
          onAtMention={onAtMention}
        />
      </div>
    );
  },
);
