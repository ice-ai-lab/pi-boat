import { uploadFiles } from '@ice-ai/client';
import { useGitStatusQuery } from '@ice-ai/client/react';
import { FileTree } from '@ice-ai/ui';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { fileTabsStore } from '../services/file-tabs-store';
import { useFileTree } from '../services/use-file-tree';

/**
 * FileExplorerPane（F3，侧栏「文件」页签）：文件树 + 上传 + git 徽标。
 * 目录内容按需加载（useFileTree）；点击文件在右栏开标签（file-tabs-store）。
 * 注意：列目录端点**不支持**会话引用放行，所以这里不需要 sessionId（协议明文）。
 */
export interface FileExplorerPaneProps {
  /** 当前项目根（树根 = git 状态查询 cwd） */
  root: string | null;
  /** 服务端解析出的真实根（符号链接路径下与 root 不同；上抛给布局，供右栏共用） */
  onResolvedRoot?(resolvedRoot: string): void;
  onError(message: string): void;
  onNotice(message: string): void;
}

/** 路径尾部两段（标题栏空间有限） */
function shortRoot(root: string): string {
  const parts = root.split('/').filter((part) => part.length > 0);
  return parts.length <= 2 ? root : `…/${parts.slice(-2).join('/')}`;
}

export function FileExplorerPane({
  root,
  onResolvedRoot,
  onError,
  onNotice,
}: FileExplorerPaneProps) {
  const tree = useFileTree(root);
  const effectiveRoot = tree.resolvedRoot ?? root;
  const gitStatus = useGitStatusQuery(effectiveRoot);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const gitMap = new Map((gitStatus.data?.files ?? []).map((file) => [file.path, file] as const));

  // 真实根上抛（右栏的相对路径与 git 查询要用同一基准）
  useEffect(() => {
    if (tree.resolvedRoot !== null) onResolvedRoot?.(tree.resolvedRoot);
  }, [tree.resolvedRoot, onResolvedRoot]);

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0 || root === null) return;
    setUploading(true);
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
    }
  };

  if (root === null || effectiveRoot === null) {
    return <p className="px-3 py-3 text-[12px] text-fg-faint">选择项目后可浏览文件</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-faint" title={root}>
          {shortRoot(root)}
        </span>
        <button
          type="button"
          title="上传文件到项目根"
          aria-label="上传文件"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="sq shrink-0 px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg disabled:opacity-50"
        >
          上传
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => void onPick(event)}
        />
      </div>
      {tree.error !== null && (
        <p className="sq mx-0.5 bg-danger-soft px-2 py-1 text-[11.5px] text-danger">{tree.error}</p>
      )}
      <FileTree
        root={effectiveRoot ?? root}
        entriesByPath={tree.entriesByPath}
        loadingPaths={tree.loadingPaths}
        expandedPaths={tree.expandedPaths}
        activePath={null}
        gitStatus={gitMap}
        onToggleDir={tree.toggleDir}
        onOpenFile={(path) => {
          const status = gitMap.get(path.slice(effectiveRoot.length + 1));
          fileTabsStore.open(path, status !== undefined && status.kind !== 'untracked');
        }}
      />
    </div>
  );
}
