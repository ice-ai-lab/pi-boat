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
import styles from './file-explorer-pane.module.css';

/**
 * FileExplorerPane（DSH 对齐重做）：文件树 + 文件搜索面板 + 变更文件区块。
 * 树本体按 DSH FilesBody 重做（ui FileTree）：行内不再有 hover 提及/下载按钮，
 * git 徽标收敛到「变更文件」区块；提及走查看器与输入框 `@`，下载走查看器。
 * 上传入口经 `FileExplorerHandle.openUploadPicker()` 暴露（设计规范 `FileExplorerHandle` 同款）。
 */
export interface FileExplorerPaneProps {
  /** 当前项目根（树根 = git 状态查询 cwd） */
  root: string | null;
  /** 文件搜索面板开合（头部图标驱动） */
  fileSearchOpen: boolean;
  onFileSearchOpenChange(open: boolean): void;
  /** 变更文件区块折叠态（头部图标驱动；true = 折叠） */
  changesCollapsed: boolean;
  /** 刷新信号（头部刷新图标驱动；自增触发重载） */
  refreshKey: number;
  /** 服务端解析出的真实根（符号链接路径下与 root 不同；上抛给布局，供右栏共用） */
  onResolvedRoot?(resolvedRoot: string): void;
  /** 上传忙态回传（头部上传图标禁用） */
  onUploadBusyChange?(busy: boolean): void;
  onError(message: string): void;
  onNotice(message: string): void;
}

/** 命令式接口（上传选择器；设计规范 `FileExplorerHandle`） */
export interface FileExplorerHandle {
  openUploadPicker(): void;
}

/** git 状态色（设计规范 `GIT_STATUS_COLORS`） */
const GIT_STATUS_COLORS: Record<string, string> = {
  modified: '#e2b34d',
  added: 'var(--green)',
  deleted: 'var(--red)',
  renamed: 'var(--accent)',
  untracked: 'var(--green)',
  conflict: 'var(--red)',
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

    // 文件搜索：150ms 防抖 + 索引端点（设计规范 FileExplorer 的 fileSearch）
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

        {/* 变更文件区块：git 徽标收敛在这里（树行内不再画徽标，DSH 对齐） */}
        {!changesCollapsed && gitFiles.length > 0 && (
          <div className={styles.changesSection}>
            <div
              role="status"
              aria-label={t('files.changeStats', {
                count: gitFiles.length,
                additions: gitStatus.data?.additions ?? 0,
                deletions: gitStatus.data?.deletions ?? 0,
              })}
              className={styles.changesSummary}
            >
              <span>{t('files.changedCount', { count: gitFiles.length })}</span>
              <span className={`${styles.delta} ${styles.additions}`}>
                +{gitStatus.data?.additions ?? 0}
              </span>
              <span className={`${styles.delta} ${styles.deletions}`}>
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
                className={styles.row}
              >
                <span
                  aria-hidden="true"
                  className={styles.rowKind}
                  style={{ color: GIT_STATUS_COLORS[status.kind] ?? 'var(--text-dim)' }}
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
                <span className={styles.rowPath}>{status.path}</span>
              </button>
            ))}
          </div>
        )}

        {/* 文件搜索面板；样式对齐 DSH 的筛选框 */}
        {fileSearchOpen && (
          <div className={styles.searchPanel}>
            <div className={styles.searchField}>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') onFileSearchOpenChange(false);
                }}
                placeholder={t('sidebar.searchFilesPlaceholder')}
                aria-label={t('sidebar.searchFiles')}
                spellCheck={false}
                className={styles.filter}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title={t('sidebar.clearSearch')}
                  aria-label={t('sidebar.clearSearch')}
                  className={styles.clear}
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
                  <div role="status" className={styles.searchHint}>
                    {t('sidebar.searchingFiles')}
                  </div>
                )}
                {!searchLoading && searchError && (
                  <div role="alert" className={`${styles.searchHint} ${styles.searchError}`}>
                    {t('i18n.networkError')}
                  </div>
                )}
                {!searchLoading && !searchError && searchPaths.length === 0 && (
                  <div className={styles.searchHint}>{t('sidebar.noMatchingFiles')}</div>
                )}
                {!searchLoading && !searchError && searchPaths.length > 0 && (
                  <div>
                    {searchPaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        title={path}
                        onClick={() => openFile(path, false)}
                        className={styles.row}
                      >
                        <span className={styles.rowPath} style={{ color: 'var(--text)' }}>
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

        <FileTree
          root={effectiveRoot}
          entriesByPath={tree.entriesByPath}
          loadingPaths={tree.loadingPaths}
          errorsByPath={tree.errorsByPath}
          expandedPaths={tree.expandedPaths}
          onToggleDir={tree.toggleDir}
          onOpenFile={(path) => openFile(path, false)}
        />
      </div>
    );
  },
);
