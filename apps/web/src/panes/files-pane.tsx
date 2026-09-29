import { fileByteUrl, getFileName, getRelativeFilePath, isImagePath } from '@ice-ai/client';
import { useGitStatusQuery } from '@ice-ai/client/react';
import { FileTabs, FileViewer, useI18n } from '@ice-ai/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileTabsStore } from '../services/file-tabs-store';
import { insertMention } from '../services/mention-bus';
import { useFileContent } from '../services/use-file-content';
import { useFileTabs } from '../services/use-file-tabs';
import { type FileExplorerHandle, FileExplorerPane } from './file-explorer-pane';
import styles from './files-pane.module.css';

/**
 * FilesPane（F3，右栏）：固定「文件浏览器」标签页（不可关闭）+ 打开文件页签 + 查看器。
 * 页签状态在 file-tabs-store（对话内跳转共用）；内容按展示模式懒加载（文本 / 元信息 / git patch）。
 * 文件浏览器（树 + 搜索 + 上传 + 变更）原在左栏 EXPLORER 区，2026-09-27 移入右栏作固定页签。
 */
export interface FilesPaneProps {
  /** 当前项目根（相对路径基准 + git 查询 cwd） */
  root: string | null;
  /** 当前会话 id（工具产物在 allowed-roots 之外时凭它放行） */
  sessionId: string | null;
  /** 右栏是否展开（`aria-expanded` 用真实值，T0-2） */
  open: boolean;
  /** 右栏是否全宽展开（设计规范 `rightPanelFullWidth`） */
  expanded: boolean;
  /** 切换全宽展开（toolbar 的 expand 按钮） */
  onToggleExpand(): void;
  /** 隐藏右栏（toolbar 的 hide 按钮） */
  onHide(): void;
  /** 文件树解析出的真实根（符号链接路径下与 root 不同；上抛给布局供各栏共用） */
  onResolvedRoot?(resolvedRoot: string): void;
}

const REFRESH_DONE_RESET_MS = 2000;

export function FilesPane({
  root,
  sessionId,
  open,
  expanded,
  onToggleExpand,
  onHide,
  onResolvedRoot,
}: FilesPaneProps) {
  const { t } = useI18n();
  const { state, tab } = useFileTabs();

  // —— 文件浏览器标签页（固定、不可关） ——
  const [treeActive, setTreeActive] = useState(true);
  const [fileSearchOpen, setFileSearchOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [changesCollapsed, setChangesCollapsed] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshDone, setRefreshDone] = useState(false);
  const explorerRef = useRef<FileExplorerHandle>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 打开/激活文件页签 → 自动切到查看器；全部关掉 → 回到文件浏览器
  const activePath = state.activePath;
  useEffect(() => {
    setTreeActive(activePath === null);
  }, [activePath]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  const gitStatus = useGitStatusQuery(root);
  const changesCount = gitStatus.data?.files.length ?? 0;

  const refreshExplorer = useCallback(() => {
    setRefreshKey((key) => key + 1);
    setRefreshDone(true);
    if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setRefreshDone(false), REFRESH_DONE_RESET_MS);
  }, []);

  const onUpload = useCallback(() => {
    explorerRef.current?.openUploadPicker();
  }, []);

  // git 状态供查看器判断「有没有可对比的改动」（内容/diff 切换要不要出现）
  const diffAvailable = useMemo(() => {
    if (tab === null || root === null) return false;
    const relative = getRelativeFilePath(tab.path, root);
    const status = gitStatus.data?.files.find((file) => file.path === relative);
    return status !== undefined && status.kind !== 'untracked';
  }, [gitStatus.data, root, tab]);
  const content = useFileContent({
    path: tab?.path ?? null,
    mode: tab?.displayMode ?? 'source',
    sessionId,
    root,
  });

  const byteUrl = useCallback(
    (type: 'read' | 'preview' | 'download') =>
      tab === null ? '#' : fileByteUrl(tab.path, type, sessionId),
    [tab, sessionId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶行：固定「文件浏览器」页签 + 文件页签 + 全宽展开 + 隐藏（按 dsh-file-explorer 视觉） */}
      <div className={styles.topBar}>
        <div
          role="tab"
          aria-selected={treeActive}
          aria-label={t('files.explorer')}
          tabIndex={treeActive ? 0 : -1}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setTreeActive(true);
            }
          }}
          onClick={() => setTreeActive(true)}
          className={`${styles.tab}${treeActive ? ` ${styles.tabActive}` : ''}`}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.tabIcon}
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span>{t('files.explorer')}</span>
        </div>
        {/* 文件页签常驻：切回文件浏览器时不再把它们藏起来（否则无法切回） */}
        <div className={styles.tabsSlot}>
          <FileTabs
            tabs={state.tabs}
            activePath={treeActive ? null : state.activePath}
            relativePathOf={(path) =>
              root === null ? getFileName(path) : getRelativeFilePath(path, root)
            }
            onActivate={(path) => {
              setTreeActive(false);
              fileTabsStore.activate(path);
            }}
            onClose={(path) => fileTabsStore.close(path)}
          />
        </div>
        <button
          type="button"
          className={`${styles.iconButton}${expanded ? ` ${styles.iconButtonActive}` : ''}`}
          onClick={onToggleExpand}
          aria-controls="file-panel"
          aria-pressed={expanded}
          title={expanded ? '恢复文件面板宽度' : '展开文件面板'}
          aria-label={expanded ? '恢复文件面板宽度' : '展开文件面板'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path
              d={
                expanded
                  ? 'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6'
                  : 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6'
              }
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onHide}
          aria-controls="file-panel"
          aria-expanded={open}
          title="隐藏文件面板"
          aria-label="隐藏文件面板"
          className={styles.iconButton}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </button>
      </div>
      {treeActive ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 浏览器工具行（原左栏 EXPLORER 头部）：变更折叠 / 文件搜索 / 上传 / 刷新 */}
          <div className={styles.toolRow}>
            {changesCount > 0 && (
              <ExplorerToolButton
                onClick={() => setChangesCollapsed((collapsed) => !collapsed)}
                title={t('sidebar.changedFiles', { count: changesCount })}
                ariaPressed={!changesCollapsed}
                color={changesCollapsed ? 'var(--text-dim)' : 'var(--accent)'}
                background={changesCollapsed ? 'none' : 'var(--bg-selected)'}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M3 12h6" />
                  <path d="M15 12h6" />
                </svg>
              </ExplorerToolButton>
            )}
            <ExplorerToolButton
              onClick={() => setFileSearchOpen(!fileSearchOpen)}
              title={t('sidebar.searchFiles')}
              ariaPressed={fileSearchOpen}
              color={fileSearchOpen ? 'var(--accent)' : 'var(--text-dim)'}
              background={fileSearchOpen ? 'var(--bg-selected)' : 'none'}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            </ExplorerToolButton>
            <ExplorerToolButton
              onClick={onUpload}
              disabled={uploadBusy}
              title={t('sidebar.uploadFilesTitle')}
              color="var(--text-dim)"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m17 8-5-5-5 5" />
                <path d="M12 3v12" />
              </svg>
            </ExplorerToolButton>
            <ExplorerToolButton
              onClick={refreshExplorer}
              title={t('sidebar.refreshExplorer')}
              skipHover={refreshDone}
              color={refreshDone ? 'var(--green)' : 'var(--text-dim)'}
              background={refreshDone ? 'rgba(74,222,128,0.18)' : 'none'}
            >
              {refreshDone ? (
                <svg
                  aria-hidden="true"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--green)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              )}
            </ExplorerToolButton>
          </div>
          <div className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
            <FileExplorerPane
              ref={explorerRef}
              root={root}
              fileSearchOpen={fileSearchOpen}
              onFileSearchOpenChange={setFileSearchOpen}
              changesCollapsed={changesCollapsed}
              refreshKey={refreshKey}
              onResolvedRoot={onResolvedRoot}
              onAtMention={(relativePath, isDir) => insertMention(relativePath, isDir)}
              onUploadBusyChange={setUploadBusy}
              onError={() => {}}
              onNotice={() => {}}
            />
          </div>
        </div>
      ) : tab === null ? (
        <div
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-dim)',
            fontSize: 12,
          }}
        >
          {t('files.noneOpen')}
        </div>
      ) : (
        <FileViewer
          tab={tab}
          displayPath={root === null ? tab.path : getRelativeFilePath(tab.path, root)}
          loading={content.loading}
          error={content.error}
          text={content.text}
          size={content.size}
          patch={content.patch}
          diffAvailable={diffAvailable}
          byteUrl={byteUrl}
          onAtMention={() =>
            insertMention(root === null ? tab.path : getRelativeFilePath(tab.path, root), false)
          }
          onToggleWrap={() => fileTabsStore.toggleWrap(tab.path)}
          onShowDiff={() => fileTabsStore.setMode(tab.path, 'diff')}
          onShowSource={() =>
            fileTabsStore.setMode(tab.path, isImagePath(tab.path) ? 'preview' : 'source')
          }
        />
      )}
    </div>
  );
}

/** 浏览器工具行图标按钮（原 Sidebar 的 ToolbarIconButton，随 EXPLORER 区一并迁来） */
function ExplorerToolButton({
  onClick,
  title,
  disabled,
  skipHover,
  color,
  background = 'none',
  ariaPressed,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  skipHover?: boolean;
  color: string;
  background?: string;
  ariaPressed?: boolean;
  children: React.ReactNode;
}) {
  const enter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || skipHover) return;
    e.currentTarget.style.color = 'var(--text-muted)';
    e.currentTarget.style.background = 'var(--bg-hover)';
  };
  const leave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || skipHover) return;
    e.currentTarget.style.color = color;
    e.currentTarget.style.background = background;
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={ariaPressed}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        padding: 0,
        background,
        border: 'none',
        color,
        cursor: disabled ? 'default' : 'pointer',
        borderRadius: '50%',
        flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
        transition: 'color 0.3s, background 0.3s',
      }}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {children}
    </button>
  );
}
