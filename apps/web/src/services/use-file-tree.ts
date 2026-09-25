import { joinFilePath, listDirectory } from '@ice-ai/client';
import type { FileListEntry } from '@ice-ai/protocol';
import { useCallback, useEffect, useState } from 'react';

/**
 * 文件树数据（web 层）：按目录懒加载 + 展开态。
 * 展开态是 UI 偏好（切换项目时重置），条目缓存在组件生命周期内保持。
 */
export interface FileTreeController {
  /** 服务端解析后的真实根（realpath）：符号链接路径（/tmp → /private/tmp）下只有它
   *  能算出正确的相对路径与 git 徽标键 */
  resolvedRoot: string | null;
  entriesByPath: ReadonlyMap<string, FileListEntry[]>;
  loadingPaths: ReadonlySet<string>;
  expandedPaths: ReadonlySet<string>;
  error: string | null;
  toggleDir(path: string): void;
  /** 首层载入（根目录） */
  loadRoot(): void;
  /** 上传/新建后刷新某目录 */
  reloadDir(path: string): void;
  reset(): void;
}

export function useFileTree(root: string | null): FileTreeController {
  const [entriesByPath, setEntriesByPath] = useState<Map<string, FileListEntry[]>>(new Map());
  const [loadingPaths, setLoadingPaths] = useState<ReadonlySet<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);

  const loadDir = useCallback(
    async (path: string) => {
      setLoadingPaths((previous) => new Set(previous).add(path));
      try {
        const listed = await listDirectory(path);
        setEntriesByPath((previous) => {
          const next = new Map(previous).set(path, listed.entries);
          // 根目录同时按「真实路径」存一份：符号链接场景（/tmp → /private/tmp）下
          // 树根会被换成 realpath 展示，两份键都要能查到同一份条目
          if (root !== null && path === root && listed.path !== path) {
            next.set(listed.path, listed.entries);
          }
          return next;
        });
        if (root !== null && path === root) setResolvedRoot(listed.path);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '目录读取失败');
      } finally {
        setLoadingPaths((previous) => {
          const next = new Set(previous);
          next.delete(path);
          return next;
        });
      }
    },
    [root],
  );

  // 根变化（切项目）：清空并载入新根
  useEffect(() => {
    setEntriesByPath(new Map());
    setExpandedPaths(new Set());
    setError(null);
    setResolvedRoot(null);
    if (root !== null) {
      setExpandedPaths(new Set([root]));
      void loadDir(root);
    }
  }, [root, loadDir]);

  const toggleDir = useCallback(
    (path: string) => {
      setExpandedPaths((previous) => {
        const next = new Set(previous);
        if (next.has(path)) {
          next.delete(path);
          return next;
        }
        next.add(path);
        return next;
      });
      if (!entriesByPath.has(path)) void loadDir(path);
    },
    [entriesByPath, loadDir],
  );

  const reloadDir = useCallback(
    (path: string) => {
      void loadDir(path);
    },
    [loadDir],
  );

  const reset = useCallback(() => {
    setEntriesByPath(new Map());
    setExpandedPaths(new Set());
  }, []);

  return {
    resolvedRoot,
    entriesByPath,
    loadingPaths,
    expandedPaths,
    error,
    toggleDir,
    loadRoot: () => {
      if (root !== null) void loadDir(root);
    },
    reloadDir,
    reset,
  };
}

export { joinFilePath };
