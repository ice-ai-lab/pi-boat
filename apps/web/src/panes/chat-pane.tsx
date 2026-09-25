import { useAgentSession } from '@ice-ai/client/react';
import {
  Composer,
  EmptyState,
  MessageList,
  ToastHost,
  type ToastItem,
  toastQueueReducer,
} from '@ice-ai/ui';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useServerHealth } from '../layout/health';

const LAST_CWD_KEY = 'piboat:last-cwd';

function readLastCwd(): string {
  try {
    return localStorage.getItem(LAST_CWD_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * 对话面板（F1）：EmptyState cwd 输入 → 会话建立 → 消息流 + Composer。
 * URL `?s=` 持久当前会话（ADR-0019-5）：刷新后走 open() 历史重建 + 冷会话 resume。
 */
export function ChatPane() {
  const session = useAgentSession();
  const { chat, sessionId } = session;
  const [draft, setDraft] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const [searchParams, setSearchParams] = useSearchParams();

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);

  // 刷新恢复：**仅首次挂载**按 URL 的 ?s= 打开会话（历史重建 + 冷会话 resume，ADR-0013）。
  // 不能跟着 searchParams 跑——建完会话后同步 URL 会立即再触发一次 open，对
  // 刚建好、尚未落盘的会话发 GET /sessions/:id 会 404。
  const initialSessionIdRef = useRef(searchParams.get('s'));
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只跑一次的挂载恢复，见上行说明
  useEffect(() => {
    const id = initialSessionIdRef.current;
    if (id === null || id.length === 0) return;
    void session.open(id).then((error) => {
      if (error !== null) pushToast(`会话恢复失败：${error}`, 'error');
    });
  }, []);

  // 会话变化同步 URL（?s=，ADR-0019-5）
  useEffect(() => {
    if (sessionId === null) return;
    const current = searchParams.get('s');
    if (current !== sessionId) setSearchParams({ s: sessionId }, { replace: true });
  }, [sessionId, searchParams, setSearchParams]);

  const handleStart = useCallback(
    async (cwd: string) => {
      setStartError(null);
      const error = await session.start(cwd);
      if (error !== null) {
        setStartError(error);
        return;
      }
      try {
        localStorage.setItem(LAST_CWD_KEY, cwd);
      } catch {
        // 存储不可用：不阻塞
      }
    },
    [session],
  );

  const handleSubmit = useCallback(
    (text: string) => {
      void session.send(text).then((error) => {
        if (error !== null) pushToast(error, 'error');
      });
    },
    [session, pushToast],
  );

  const handleAbort = useCallback(() => {
    void session.abort();
  }, [session]);

  const health = useServerHealth();

  if (sessionId === null) {
    return (
      <EmptyState
        onStart={handleStart}
        starting={session.starting}
        initialCwd={readLastCwd()}
        error={startError}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hairline-b flex h-8 shrink-0 items-center gap-2 border-line-1 px-4">
        <span className="truncate text-[12px] text-fg-subtle">
          {chat.sessionName ?? sessionId.slice(0, 8)}
        </span>
        {health === 'down' && <span className="text-[11px] text-danger">· 服务连接中断</span>}
        {chat.streaming && <span className="ml-auto text-[11px] text-accent">运行中</span>}
      </div>
      <MessageList chat={chat} />
      <div className="shrink-0 pb-4">
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={handleSubmit}
          onAbort={handleAbort}
          streaming={chat.streaming}
          disabled={chat.terminated}
        />
      </div>
      <ToastHost items={toasts} />
    </div>
  );
}
