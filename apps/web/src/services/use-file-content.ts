import {
  type FileDisplayMode,
  getFileMeta,
  getGitDiff,
  getRelativeFilePath,
  readFileText,
} from '@ice-ai/client';
import { useEffect, useState } from 'react';

/**
 * 活动文件页签的内容加载（web 层）：按展示模式取文本 / git patch。
 * 二进制与图片不取文本（查看器直接用字节 URL）。2026-10-06 起 meta 只用来
 * 判 category，体积不再上浮（查看器抬头不显示体积）。
 */
export interface FileContentState {
  loading: boolean;
  error: string | null;
  text: string | null;
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
            patch: diff.patch ?? '',
          });
          return;
        }
        if (meta.category !== 'text') {
          setState({ loading: false, error: null, text: null, patch: null });
          return;
        }
        const text = await readFileText(path, sessionId);
        if (!alive) return;
        setState({ loading: false, error: null, text, patch: null });
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
