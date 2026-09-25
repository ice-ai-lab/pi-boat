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
import { getLastCwd, setLastCwd } from '../services/workspace-memory';

/**
 * ChatPane（F1+F2）：URL `?s=` 是会话的**唯一真相**（ADR-0019-5）——
 * 侧栏点选 / 新建都只改 URL；本组件据此 open() 既有会话（历史重建 + 冷会话 resume）
 * 或展示 EmptyState 建新会话。刷新后同一条路径即恢复。
 */
export interface ChatPaneProps {
  /** 侧栏切换项目/新建会话时带上的预填 cwd */
  preferredCwd?: string | null;
}

export function ChatPane({ preferredCwd = null }: ChatPaneProps) {
  const session = useAgentSession();
  const { chat, sessionId } = session;
  const [draft, setDraft] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const [searchParams, setSearchParams] = useSearchParams();
  /** 由本组件写进 URL 的会话 id（区分「自己同步」与「用户点选」） */
  const selfNavigationRef = useRef<string | null>(null);
  const urlSessionId = searchParams.get('s');

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);

  // ① URL → 会话（打开既有会话 / 清空回 EmptyState）
  // biome-ignore lint/correctness/useExhaustiveDependencies: session.open/reset 身份随 sessionId 变化，只在 URL 变化时触发
  useEffect(() => {
    if (urlSessionId === session.sessionId) return;
    if (urlSessionId === null) {
      if (session.sessionId !== null) session.reset();
      return;
    }
    if (selfNavigationRef.current === urlSessionId) {
      selfNavigationRef.current = null;
      return;
    }
    void session.open(urlSessionId).then((error) => {
      if (error !== null) pushToast(`打开会话失败：${error}`, 'error');
    });
  }, [urlSessionId, session.sessionId, pushToast]);

  // ② 会话 id → URL（新建 / open 成功后落定）
  useEffect(() => {
    if (sessionId === null || urlSessionId === sessionId) return;
    selfNavigationRef.current = sessionId;
    setSearchParams({ s: sessionId }, { replace: true });
  }, [sessionId, urlSessionId, setSearchParams]);

  const startSession = useCallback(
    async (cwd: string) => {
      setStartError(null);
      const error = await session.start(cwd);
      if (error !== null) {
        setStartError(error);
        return;
      }
      setLastCwd(cwd);
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

  const health = useServerHealth();

  if (sessionId === null) {
    return (
      <>
        <EmptyState
          onStart={(cwd) => void startSession(cwd)}
          starting={session.starting}
          initialCwd={preferredCwd ?? getLastCwd()}
          error={startError}
        />
        <ToastHost items={toasts} />
      </>
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
      <MessageList
        chat={chat}
        hasOlder={session.hasOlder}
        loadingOlder={session.loadingOlder}
        onLoadOlder={() => void session.loadOlder()}
      />
      <div className="shrink-0 pb-4">
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={handleSubmit}
          onAbort={() => void session.abort()}
          streaming={chat.streaming}
          disabled={chat.terminated}
        />
      </div>
      <ToastHost items={toasts} />
    </div>
  );
}
