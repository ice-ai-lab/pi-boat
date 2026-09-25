import { fileByteUrl, getFileName, getRelativeFilePath, isImagePath } from '@ice-ai/client';
import { FileTabs, FileViewer } from '@ice-ai/ui';
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
}

export function FilesPane({ root, sessionId }: FilesPaneProps) {
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
      <FileTabs
        tabs={state.tabs}
        activePath={state.activePath}
        relativePathOf={(path) =>
          root === null ? getFileName(path) : getRelativeFilePath(path, root)
        }
        onActivate={(path) => fileTabsStore.activate(path)}
        onClose={(path) => fileTabsStore.close(path)}
      />
      {tab === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-5 text-center">
          <p className="text-[12.5px] text-fg-muted">尚未打开文件</p>
          <p className="text-[11.5px] text-fg-faint">
            左侧切到「文件」页签浏览项目，点击文件即在此打开
          </p>
          {root !== null && <p className="mt-1 font-mono text-[10.5px] text-fg-faint">{root}</p>}
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
