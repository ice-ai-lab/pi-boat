import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getAgentRunningState,
  newAgentSession,
  resumeAgentSession,
  sendAgentCommand,
} from '../endpoints/agent';
import { getSessionDetail } from '../endpoints/sessions';
import { ApiError } from '../http';
import { getAgentStream } from '../stream/agent-stream';
import { rebuildChatState } from '../stream/rebuild';
import { type ChatState, emptyChatState } from '../stream/view-model';

/**
 * useAgentSession（docs/05 §7）：单会话编排——建会话 / 打开既有会话（历史重建 +
 * 冷会话 resume，ADR-0013）/ 发送 / 中止。事件流经 AgentStream（useSyncExternalStore），
 * 不入 Query（ADR-0009）。
 */
export interface UseAgentSessionResult {
  sessionId: string | null;
  /** 视图模型快照（未建会话时为空态） */
  chat: ChatState;
  /** 首条 prompt / 历史加载进行中 */
  starting: boolean;
  sending: boolean;
  /** 建会话/发送失败的可展示错误（调用方决定 toast） */
  start(cwd: string): Promise<string | null>;
  /** 打开既有会话：历史重建 → 冷会话 resume → 连流 */
  open(sessionId: string): Promise<string | null>;
  send(text: string): Promise<string | null>;
  abort(): Promise<void>;
  reset(): void;
}

export function useAgentSession(): UseAgentSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  /** 本 hook 实例已初始化过的流（防 effect 重跑重复 restore） */
  const initializedRef = useRef<string | null>(null);

  const store = useMemo(() => {
    if (sessionId === null) return null;
    const stream = getAgentStream(sessionId);
    return {
      subscribe: stream.subscribe.bind(stream),
      getSnapshot: stream.getSnapshot.bind(stream),
    };
  }, [sessionId]);

  const storeChat = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? getEmptyChatState,
  );

  // 会话切换：连接事件流（restore 已由 start/open 完成；全新流补空态）
  useEffect(() => {
    if (sessionId === null || initializedRef.current === sessionId) return;
    initializedRef.current = sessionId;
    const stream = getAgentStream(sessionId);
    if (!stream.isRestored) stream.restore(emptyChatState(), 0);
    stream.connect();
    // 断开交由注册表生命周期（多组件共享；页面卸载时 EventSource 随页销毁）
  }, [sessionId]);

  const start = useCallback(async (cwd: string): Promise<string | null> => {
    setStarting(true);
    try {
      const { sessionId: id } = await newAgentSession({ cwd, type: 'ensure_session' });
      setSessionId(id);
      return null;
    } catch (error) {
      return errorMessage(error);
    } finally {
      setStarting(false);
    }
  }, []);

  const open = useCallback(async (id: string): Promise<string | null> => {
    setStarting(true);
    try {
      const detail = await getSessionDetail(id);
      const state = rebuildChatState(
        detail.context.messages,
        detail.context.entryIds,
        detail.info.name,
      );
      // 水位线：热会话取 lastSeq（双通道对账）；冷会话先 resume 再连流（ADR-0013）
      const running = await getAgentRunningState(id);
      let watermark = 0;
      if (running.running) watermark = running.state.lastSeq;
      else await resumeAgentSession(id);
      const streamFor = getAgentStream(id);
      streamFor.restore(state, watermark);
      setSessionId(id);
      return null;
    } catch (error) {
      return errorMessage(error);
    } finally {
      setStarting(false);
    }
  }, []);

  const send = useCallback(
    async (text: string): Promise<string | null> => {
      const id = sessionId;
      if (id === null || text.trim().length === 0) return null;
      setSending(true);
      try {
        await sendAgentCommand(id, { type: 'prompt', message: text });
        return null;
      } catch (error) {
        return errorMessage(error);
      } finally {
        setSending(false);
      }
    },
    [sessionId],
  );

  const abort = useCallback(async (): Promise<void> => {
    const id = sessionId;
    if (id === null) return;
    try {
      await sendAgentCommand(id, { type: 'abort' });
    } catch {
      // 会话已 settle 时 abort 报错可忽略
    }
  }, [sessionId]);

  const reset = useCallback((): void => {
    setSessionId(null);
    initializedRef.current = null;
  }, []);

  return {
    sessionId,
    chat: storeChat,
    starting,
    sending,
    start,
    open,
    send,
    abort,
    reset,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '请求失败';
}

const EMPTY_CHAT = emptyChatState();
const getEmptyChatState = (): ChatState => EMPTY_CHAT;
const noopSubscribe = (): (() => void) => () => {};
