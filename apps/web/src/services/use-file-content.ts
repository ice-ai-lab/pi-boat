import {
  type FileDisplayMode,
  getFileMeta,
  getGitDiff,
  getRelativeFilePath,
  readFileText,
} from '@ice-ai/client';
import { useEffect, useState } from 'react';

/**
 * 活动文件页签的内容加载（web 层）：按展示模式取文本 / 元信息 / git patch。
 * 二进制与图片不取文本（查看器直接用字节 URL）。
 */
export interface FileContentState {
  loading: boolean;
  error: string | null;
  text: string | null;
  size?: number;
  patch: string | null;
}

export function useFileContent(options: {
  path: string | null;
  mode: FileDisplayMode;
  sessionId: string | null;
  root: string | null;
}): FileContentState {
  const { path, mode, sessionId, root } = options;
  const [state, setState] = useState<FileContentState>({
    loading: false,
    error: null,
    text: null,
    patch: null,
  });

  useEffect(() => {
    if (path === null) {
      setState({ loading: false, error: null, text: null, patch: null });
      return;
    }
    let alive = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    const run = async () => {
      try {
        const meta = await getFileMeta(path, sessionId);
        if (!alive) return;
        if (mode === 'diff') {
          // 抬头要显示 `语言 · N lines · 体积`（与 参考实现 同形），所以 diff 模式下也把文本取回来：
          // 只用来数行，不渲染（diff 模式下查看器走 patch）
          const [diff, text] = await Promise.all([
            getGitDiff(root ?? '', getRelativeFilePath(path, root ?? undefined)),
            meta.category === 'text'
              ? readFileText(path, sessionId).catch(() => null)
              : Promise.resolve(null),
          ]);
          if (!alive) return;
          setState({
            loading: false,
            error: diff.supported ? null : (diff.reason ?? '该文件不支持 diff'),
            text,
            size: meta.size,
            patch: diff.patch ?? '',
          });
          return;
        }
        if (meta.category !== 'text') {
          setState({ loading: false, error: null, text: null, size: meta.size, patch: null });
          return;
        }
        const text = await readFileText(path, sessionId);
        if (!alive) return;
        setState({ loading: false, error: null, text, size: meta.size, patch: null });
      } catch (caught) {
        if (!alive) return;
        setState({
          loading: false,
          error: caught instanceof Error ? caught.message : '文件读取失败',
          text: null,
          patch: null,
        });
      }
    };

    void run();
    return () => {
      alive = false;
    };
    // 内容为一次性加载：变更由用户切换模式/标签触发（无文件监听，docs/07 §9 type=watch 未实现）
  }, [path, mode, sessionId, root]);

  return state;
}
