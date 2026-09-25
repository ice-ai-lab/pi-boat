import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getAgentRunningState,
  newAgentSession,
  renewAgentLease,
  resumeAgentSession,
  sendAgentCommand,
} from '../endpoints/agent';
import { validateCwd } from '../endpoints/files';
import { getSessionContext, getSessionDetail } from '../endpoints/sessions';
import { ApiError } from '../http';
import { disposeAgentStream, getAgentStream } from '../stream/agent-stream';
import { rebuildChatState, rebuildTurns } from '../stream/rebuild';
import { type ChatState, emptyChatState } from '../stream/view-model';

/**
 * useAgentSession（docs/05 §7）：单会话编排——建会话 / 打开既有会话（历史重建 +
 * 冷会话 resume，ADR-0013）/ 发送 / 中止 / 向上翻页 / lease 续期。
 * 事件流经 AgentStream（useSyncExternalStore），不入 Query（ADR-0009）。
 */
export interface UseAgentSessionResult {
  sessionId: string | null;
  /** 会话工作目录（建会话时的 cwd / 打开时的 info.cwd）；提及索引与文件域基准用 */
  cwd: string | null;
  /** 视图模型快照（未建会话时为空态） */
  chat: ChatState;
  /** 建会话 / 历史加载进行中 */
  starting: boolean;
  sending: boolean;
  /** 向上还有历史可取 */
  hasOlder: boolean;
  loadingOlder: boolean;
  start(cwd: string): Promise<string | null>;
  /** 打开既有会话：历史重建 → 冷会话 resume → 连流 */
  open(sessionId: string): Promise<string | null>;
  /** 向上翻页：取更早一页并前插（调用方负责滚动保持） */
  loadOlder(): Promise<void>;
  send(text: string): Promise<string | null>;
  abort(): Promise<void>;
  reset(): void;
}

/** lease 续期间隔（服务端 TTL 180s，30s 续一次留足余量；G2-12） */
const LEASE_RENEW_INTERVAL_MS = 30_000;

export function useAgentSession(): UseAgentSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<{ oldest?: string; hasMore: boolean }>({
    hasMore: false,
  });
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

  // 会话切换：连接事件流（restore 已由 start/open 完成；全新流补空态）；
  // 并释放上一个会话的流（否则每访问一个会话就多留一条 SSE = 多一个观看者）
  useEffect(() => {
    if (sessionId === null) return;
    if (initializedRef.current === sessionId) return;
    const previous = initializedRef.current;
    initializedRef.current = sessionId;
    if (previous !== null) disposeAgentStream(previous);
    const stream = getAgentStream(sessionId);
    if (!stream.isRestored) stream.restore(emptyChatState(), 0);
    stream.connect();
    // 断开交由注册表生命周期（多组件共享；页面卸载时 EventSource 随页销毁）
  }, [sessionId]);

  // lease 续期：会话开着就不断续，防 idle 回收把观看中的会话收回（G2-12）
  useEffect(() => {
    if (sessionId === null) return;
    const timer = setInterval(() => {
      void renewAgentLease(sessionId).catch(() => {
        // 会话已不在注册表：忽略（重连/恢复由 open 负责）
      });
    }, LEASE_RENEW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sessionId]);

  const start = useCallback(async (cwd: string): Promise<string | null> => {
    setStarting(true);
    try {
      // 先授权：allowed-roots 只由 cwd/validate 写入，文件域（文件树/查看器/上传）依赖它
      const validated = await validateCwd(cwd);
      if (!validated.success) return '目录不存在或不可访问';
      if (validated.projectRoot !== cwd) await validateCwd(validated.projectRoot);
      const { sessionId: id } = await newAgentSession({ cwd, type: 'ensure_session' });
      setHistoryCursor({ hasMore: false });
      setCwd(cwd);
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
      const detail = await getSessionDetail(id).catch(async (error: unknown) => {
        // 刚建还没落盘的会话（ensure_session 后无条目 → 无 .jsonl）：磁盘侧查不到，
        // 但运行时注册表里有。此时没有历史可重建，直接连流即可（docs/02 §6.1 双通道）。
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        const running = await getAgentRunningState(id);
        if (!running.running) throw error;
        getAgentStream(id).restore(emptyChatState(), running.state.lastSeq);
        setCwd(null);
        setSessionId(id);
        return null;
      });
      if (detail === null) return null;
      // 打开即授权该会话的工作目录与项目根（用户点开这个会话 = 显式选择该项目）
      await validateCwd(detail.info.cwd).catch(() => null);
      if (detail.info.projectRoot !== undefined && detail.info.projectRoot !== detail.info.cwd) {
        await validateCwd(detail.info.projectRoot).catch(() => null);
      }
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
      setHistoryCursor({
        oldest: detail.context.oldestEntryId,
        hasMore: detail.context.hasMore,
      });
      const stream = getAgentStream(id);
      stream.restore(state, watermark);
      setCwd(detail.info.cwd);
      setSessionId(id);
      return null;
    } catch (error) {
      return errorMessage(error);
    } finally {
      setStarting(false);
    }
  }, []);

  const loadOlder = useCallback(async (): Promise<void> => {
    const id = sessionId;
    const before = historyCursor.oldest;
    if (id === null || before === undefined) return;
    setLoadingOlder(true);
    try {
      const page = await getSessionContext(id, { before, tail: 50 });
      getAgentStream(id).prependTurns(rebuildTurns(page.messages, page.entryIds));
      setHistoryCursor({ oldest: page.oldestEntryId, hasMore: page.hasMore });
    } finally {
      setLoadingOlder(false);
    }
  }, [sessionId, historyCursor.oldest]);

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
    const previous = initializedRef.current;
    initializedRef.current = null;
    if (previous !== null) disposeAgentStream(previous);
    setSessionId(null);
    setCwd(null);
    setHistoryCursor({ hasMore: false });
  }, []);

  return {
    sessionId,
    cwd,
    chat: storeChat,
    starting,
    sending,
    hasOlder: historyCursor.hasMore,
    loadingOlder,
    start,
    open,
    loadOlder,
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
