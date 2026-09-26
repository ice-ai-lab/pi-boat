import { fileByteUrl, getFileName, getRelativeFilePath, isImagePath } from '@ice-ai/client';
import { FileTabs, FileViewer, useI18n } from '@ice-ai/ui';
import { useCallback } from 'react';
import { fileTabsStore } from '../services/file-tabs-store';
import { useFileContent } from '../services/use-file-content';
import { useFileTabs } from '../services/use-file-tabs';

/**
 * FilesPane（F3，右栏）：页签 + 查看器。页签状态在 file-tabs-store（侧栏文件树与
 * 对话内跳转共用）；内容按展示模式懒加载（文本 / 元信息 / git patch）。
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
}

export function FilesPane({
  root,
  sessionId,
  open,
  expanded,
  onToggleExpand,
  onHide,
}: FilesPaneProps) {
  const { t } = useI18n();
  const { state, tab } = useFileTabs();
  // git 状态仅供侧栏文件树徽标使用；此处不取（避免同域重复轮询）
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
      {/* 顶行：页签 + 全宽展开 + 隐藏（按设计规范） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          height: 'calc(36px + env(safe-area-inset-top))',
          paddingTop: 'env(safe-area-inset-top)',
          background: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <FileTabs
            tabs={state.tabs}
            activePath={state.activePath}
            relativePathOf={(path) =>
              root === null ? getFileName(path) : getRelativeFilePath(path, root)
            }
            onActivate={(path) => fileTabsStore.activate(path)}
            onClose={(path) => fileTabsStore.close(path)}
          />
        </div>
        <button
          type="button"
          className="file-panel-expand-button"
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
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            padding: 0,
            background: 'var(--bg-selected)',
            border: 'none',
            borderLeft: '1px solid var(--border)',
            color: 'var(--text)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'color 0.12s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = 'var(--text)';
          }}
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
      {tab === null ? (
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
          byteUrl={byteUrl}
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
