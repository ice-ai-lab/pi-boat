import type {
  AgentState,
  ImageContent,
  SessionStatsInfo,
  SlashCommandInfo,
  ThinkingLevel,
  ToolInfo,
  ToolPreset,
} from '@ice-ai/protocol';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  abortAgentCompaction,
  clearAgentQueue,
  compactAgent,
  followUpAgent,
  forkAgentSession,
  getAgentCommands,
  getAgentRunningState,
  getAgentStateLight,
  getAgentStats,
  getAgentTools,
  navigateAgentTree,
  newAgentSession,
  renewAgentLease,
  respondAgentExtensionUi,
  resumeAgentSession,
  sendAgentCommand,
  setAgentModel,
  setAgentSessionName,
  setAgentTools,
  steerAgent,
} from '../endpoints/agent';
import { validateCwd } from '../endpoints/files';
import { autoNameSession, getSessionContext } from '../endpoints/sessions';
import { ApiError } from '../http';
import { disposeAgentStream, getAgentStream } from '../stream/agent-stream';
import { applyLiveRun, rebuildChatState, rebuildTurns } from '../stream/rebuild';
import { type ChatState, emptyChatState } from '../stream/view-model';
import { fetchSessionDetail } from './queries';

/**
 * useAgentSession（docs/05 §7）：单会话编排——建会话 / 打开既有会话（历史重建 +
 * 冷会话 resume，ADR-0013）/ 发送 / 中止 / 向上翻页 / lease 续期。
 * 事件流经 AgentStream（useSyncExternalStore），不入 Query（ADR-0009）。
 */
export interface UseAgentSessionResult {
  /** 斜杠命令清单（打开会话后按需拉取；失败为空数组） */
  commands: SlashCommandInfo[];
  /** 工具清单（含 `active` 标记） */
  tools: ToolInfo[];
  /** 统计（打开会话后按需拉取） */
  stats: SessionStatsInfo | null;
  /** 轻查拿到的完整运行时状态（含 systemPrompt；冷会话为 null） */
  liveState: AgentState | null;
  loadCommands(): Promise<void>;
  loadTools(): Promise<void>;
  refreshStats(): Promise<void>;
  refreshLiveState(): Promise<void>;
  compact(customInstructions?: string): Promise<string | null>;
  setThinkingLevel(level: ThinkingLevel): Promise<string | null>;
  /** 切换模型（provider + modelId，服务端逐会话生效） */
  setModel(provider: string, modelId: string): Promise<string | null>;
  abortCompaction(): Promise<void>;
  setTools(preset: ToolPreset): Promise<string | null>;
  /** 用 LLM 生成会话名并落盘（dryRun 只回名字） */
  autoName(dryRun?: boolean): Promise<{ title?: string; error?: string }>;
  setSessionName(name: string): Promise<string | null>;
  steer(text: string, images?: ImageContent[]): Promise<string | null>;
  followUp(text: string, images?: ImageContent[]): Promise<string | null>;
  clearQueue(): Promise<void>;
  fork(entryId: string): Promise<string | null>;
  navigateTree(
    targetId: string,
    options?: { summarize?: boolean; label?: string },
  ): Promise<{ error?: string; editorText?: string }>;
  respondExtensionUi(
    id: string,
    response: { value?: string; confirmed?: boolean; cancelled?: true },
  ): Promise<void>;
  sessionId: string | null;
  /** 会话工作目录（建会话时的 cwd / 打开时的 info.cwd）；提及索引与文件域基准用 */
  cwd: string | null;
  /** 空态（尚未建会话）下已选待生效的模型；建会话后由 liveState.model 取代 */
  pendingModel: { provider: string; modelId: string } | null;
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
  /** 发送消息（images 走 pi-ai 的 ImageContent，与 prompt 命令的 images 字段同形） */
  send(text: string, images?: ImageContent[]): Promise<string | null>;
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
  const [commands, setCommands] = useState<SlashCommandInfo[]>([]);
  const [tools, setToolsState] = useState<ToolInfo[]>([]);
  const [stats, setStats] = useState<SessionStatsInfo | null>(null);
  const [liveState, setLiveState] = useState<AgentState | null>(null);
  const initializedRef = useRef<string | null>(null);
  /**
   * 会话 id 的**同步副本**：`start()` 提交新的 sessionId 时 state 还没提交给渲染，
   * 同一次点击里的后续调用（空态「建会话 → 发首条消息」）若读 state 就会读到 **null**，
   * send 直接早退、消息静默丢失。所有「取此刻的会话」的路径一律读本 ref。
   */
  const sessionIdRef = useRef<string | null>(null);
  /** 自愈去重：同一时刻只跑一次 revive（lease 心跳与用户动作可能同时发现会话已回收） */
  const reviveRef = useRef<Promise<void> | null>(null);
  /**
   * 未落盘会话（`ensure_session` 建的）：pi 直到首条 assistant 消息才写 `.jsonl`，
   * 这之前 `open()` 走 404 分支（只有运行态、没有历史，用户消息不在任何通道里）。
   * 记下它，等它落盘后补一次历史（见下方 effect）。
   */
  const transientRef = useRef<string | null>(null);
  /** 详情走 Query 缓存：与 `useSessionDetailQuery` 共用同一份（见 fetchSessionDetail） */
  const queryClient = useQueryClient();
  /**
   * 空态（尚未建会话）下选中的模型：`setModel` 在没有活动会话时先记在这里，
   * `start()` 建会话时经 `agent/new` 的 provider/modelId 一并生效。
   * 与 sessionIdRef 同理读 ref（同一次点击里 state 未提交，读 state 会拿到 null）。
   */
  const pendingModelRef = useRef<{ provider: string; modelId: string } | null>(null);
  const [pendingModel, setPendingModel] = useState<{ provider: string; modelId: string } | null>(
    null,
  );

  /** 切会话的唯一入口：ref 与 state 必须同时更新，只改其中一个就是上面那个 bug */
  const switchSession = useCallback((id: string | null): void => {
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);

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

  const start = useCallback(
    async (cwd: string): Promise<string | null> => {
      setStarting(true);
      try {
        // 先授权：allowed-roots 只由 cwd/validate 写入，文件域（文件树/查看器/上传）依赖它
        const validated = await validateCwd(cwd);
        if (!validated.success) return '目录不存在或不可访问';
        if (validated.projectRoot !== cwd) await validateCwd(validated.projectRoot);
        const pending = pendingModelRef.current;
        const { sessionId: id } = await newAgentSession({
          cwd,
          type: 'ensure_session',
          ...(pending !== null ? { provider: pending.provider, modelId: pending.modelId } : {}),
        });
        pendingModelRef.current = null;
        setPendingModel(null);
        setHistoryCursor({ hasMore: false });
        setCwd(cwd);
        switchSession(id);
        return null;
      } catch (error) {
        return errorMessage(error);
      } finally {
        setStarting(false);
      }
    },
    [switchSession],
  );

  const open = useCallback(
    async (id: string): Promise<string | null> => {
      setStarting(true);
      try {
        const detail = await fetchSessionDetail(queryClient, id).catch(async (error: unknown) => {
          // 刚建还没落盘的会话（ensure_session 后无条目 → 无 .jsonl）：磁盘侧查不到，
          // 但运行时注册表里有。此时没有历史可重建，直接连流即可（docs/02 §6.1 双通道）。
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          const running = await getAgentRunningState(id);
          if (!running.running) throw error;
          transientRef.current = id;
          getAgentStream(id).restore(
            applyLiveRun(emptyChatState(), running.state),
            running.state.lastSeq,
          );
          setCwd(null);
          switchSession(id);
          return null;
        });
        if (detail === null) return null;
        // 打开即授权该会话的工作目录与项目根（用户点开这个会话 = 显式选择该项目）
        await validateCwd(detail.info.cwd).catch(() => null);
        if (detail.info.projectRoot !== undefined && detail.info.projectRoot !== detail.info.cwd) {
          await validateCwd(detail.info.projectRoot).catch(() => null);
        }
        const state = rebuildChatState(detail.context.messages, detail.context.entryIds, {
          sessionName: detail.info.name,
          sessionId: id,
        });
        // 水位线：热会话取 lastSeq（双通道对账）；冷会话先 resume 再连流（ADR-0013）
        const running = await getAgentRunningState(id);
        let watermark = 0;
        // 热会话可能正跑着（刷新中途接流）：历史是「静止」的，运行态得显式折进去
        // （composer 停止态 / 末轮平铺 / 未回填的工具行，见 applyLiveRun）
        let live: AgentState | null = null;
        if (running.running) {
          watermark = running.state.lastSeq;
          live = running.state;
        } else {
          await resumeAgentSession(id);
        }
        setHistoryCursor({
          oldest: detail.context.oldestEntryId,
          hasMore: detail.context.hasMore,
        });
        const stream = getAgentStream(id);
        stream.restore(live === null ? state : applyLiveRun(state, live), watermark);
        setCwd(detail.info.cwd);
        switchSession(id);
        return null;
      } catch (error) {
        return errorMessage(error);
      } finally {
        setStarting(false);
      }
    },
    [switchSession, queryClient],
  );

  /**
   * 会话被回收后的自愈（ADR-0013 把「要不要显式 resume」交给客户端）：server 重启、
   * idle 回收或其他标签页挤掉之后，注册表里已经没有这个会话，命令会 404。
   *
   * 为什么直接复用 `open()`：要恢复的不只是「建回 runtime」，还有
   * ①从磁盘重建历史 ②冷会话 resume ③**重置事件流水位线**——重建出来的 Entry 是新对象，
   * seq 从 1 重新计数，只 resume 不 restore 的话客户端会把后续事件全按 seq ≤ watermark 丢掉。
   */
  const revive = useCallback(
    async (id: string): Promise<void> => {
      const inFlight = reviveRef.current;
      if (inFlight !== null) return inFlight;
      const task = (async () => {
        await open(id);
        // resume 之后旧连接还在退避重连（1→8s）：主动重建，让「等 connected 再派发」
        // 立刻生效——否则重试的 prompt 又会赶在订阅之前发出，回显再次丢掉
        getAgentStream(id).connect();
      })();
      reviveRef.current = task;
      try {
        await task;
      } finally {
        reviveRef.current = null;
      }
    },
    [open],
  );

  // lease 续期：会话开着就不断续，防 idle 回收把观看中的会话收回（G2-12）；
  // renewed:false = 已被回收（server 重启 / idle 回收）→ 显式恢复，
  // 否则这个标签页会一直 404（命令失败 + SSE 无限重连，ADR-0013 13a）
  useEffect(() => {
    if (sessionId === null) return;
    const timer = setInterval(() => {
      void renewAgentLease(sessionId)
        .then(({ renewed }) => {
          if (!renewed) void revive(sessionId);
        })
        .catch(() => {
          // 网络失败：下一轮心跳再试
        });
    }, LEASE_RENEW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [sessionId, revive]);

  // runtime 被回收/服务重启的**即时**自愈：事件流会先送来 session_shutdown（fold 置 terminated），
  // 若不等心跳（最多 30s）才恢复，composer 会在这段时间里一直处于禁用状态——用户点什么都没反应。
  // 会话文件还在磁盘上，shutdown 只是「内存 runtime 没了」，resume 就能接着聊（ADR-0013）。
  const terminated = storeChat.terminated;
  useEffect(() => {
    if (!terminated) return;
    const id = sessionIdRef.current;
    if (id !== null) void revive(id);
  }, [terminated, revive]);

  /**
   * 未落盘会话补历史（只补一次）：首条 assistant 消息落盘那一刻会话文件才存在，
   * 重开就能拿回重启前那一段——包括 REST 根本给不出的用户消息与轮锚点。
   * 仍在跑时不重开（重开会把已 fold 的流式内容冲成历史快照）；确认落盘后本 ref 清空，
   * 再 404（这轮压根没产生消息）也不会反复重试。
   */
  useEffect(() => {
    const id = sessionIdRef.current;
    if (storeChat.streaming || id === null || transientRef.current !== id) return;
    transientRef.current = null;
    void open(id);
  }, [storeChat.streaming, open]);

  const loadOlder = useCallback(async (): Promise<void> => {
    const id = sessionId;
    const before = historyCursor.oldest;
    if (id === null || before === undefined) return;
    setLoadingOlder(true);
    try {
      const page = await getSessionContext(id, { before, tail: 50, deferMedia: true });
      getAgentStream(id).prependTurns(rebuildTurns(page.messages, page.entryIds, id));
      setHistoryCursor({ oldest: page.oldestEntryId, hasMore: page.hasMore });
    } finally {
      setLoadingOlder(false);
    }
  }, [sessionId, historyCursor.oldest]);

  /**
   * 派发前确保事件流已订阅（`waitUntilReady` 的注释里是原因：漏掉 user 消息回显
   * 等于整轮不渲染）。revive 之后也要等——那时的连接正在退避重连。
   */
  const waitStream = useCallback(async (id: string): Promise<void> => {
    await getAgentStream(id).waitUntilReady();
  }, []);

  const send = useCallback(
    async (text: string, images?: ImageContent[]): Promise<string | null> => {
      const id = sessionIdRef.current;
      if (id === null || (text.trim().length === 0 && (images?.length ?? 0) === 0)) return null;
      setSending(true);
      try {
        await dispatchWithRevive(
          async () => {
            await waitStream(id);
            return sendAgentCommand(id, {
              type: 'prompt',
              message: text,
              ...(images && images.length > 0 ? { images } : {}),
            });
          },
          () => revive(id),
        );
        return null;
      } catch (error) {
        return errorMessage(error);
      } finally {
        setSending(false);
      }
    },
    [revive, waitStream],
  );

  const abort = useCallback(async (): Promise<void> => {
    const id = sessionIdRef.current;
    if (id === null) return;
    try {
      await sendAgentCommand(id, { type: 'abort' });
    } catch {
      // 会话已 settle 时 abort 报错可忽略
    }
  }, []);

  const reset = useCallback((): void => {
    const previous = initializedRef.current;
    initializedRef.current = null;
    if (previous !== null) disposeAgentStream(previous);
    switchSession(null);
    setCwd(null);
    setHistoryCursor({ hasMore: false });
  }, [switchSession]);

  const requireSession = useCallback((): string | null => sessionIdRef.current, []);

  const loadCommands = useCallback(async (): Promise<void> => {
    const id = requireSession();
    if (id === null) return;
    setCommands(await getAgentCommands(id).catch(() => []));
  }, [requireSession]);

  const loadTools = useCallback(async (): Promise<void> => {
    const id = requireSession();
    if (id === null) return;
    setToolsState(await getAgentTools(id).catch(() => []));
  }, [requireSession]);

  const refreshStats = useCallback(async (): Promise<void> => {
    const id = requireSession();
    if (id === null) return;
    setStats(await getAgentStats(id).catch(() => null));
  }, [requireSession]);

  const refreshLiveState = useCallback(async (): Promise<void> => {
    const id = requireSession();
    if (id === null) return;
    setLiveState(await getAgentStateLight(id).catch(() => null));
  }, [requireSession]);

  const setThinkingLevel = useCallback(
    async (level: ThinkingLevel): Promise<string | null> => {
      const id = requireSession();
      if (id === null) return '没有活动会话';
      try {
        await sendAgentCommand(id, { type: 'set_thinking_level', level });
        await refreshLiveState();
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession, refreshLiveState],
  );

  const setModel = useCallback(
    async (provider: string, modelId: string): Promise<string | null> => {
      const id = requireSession();
      // 空态（尚未建会话）：没有 runtime 可切，先记住选择，建会话时由 start() 生效
      if (id === null) {
        pendingModelRef.current = { provider, modelId };
        setPendingModel(pendingModelRef.current);
        return null;
      }
      try {
        await setAgentModel(id, provider, modelId);
        await refreshLiveState();
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession, refreshLiveState],
  );

  const compact = useCallback(
    async (customInstructions?: string): Promise<string | null> => {
      const id = requireSession();
      if (id === null) return '没有活动会话';
      try {
        await compactAgent(id, customInstructions);
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession],
  );

  const abortCompaction = useCallback(async (): Promise<void> => {
    const id = requireSession();
    if (id === null) return;
    await abortAgentCompaction(id).catch(() => null);
  }, [requireSession]);

  const setTools = useCallback(
    async (preset: ToolPreset): Promise<string | null> => {
      const id = requireSession();
      if (id === null) return '没有活动会话';
      try {
        const result = await setAgentTools(id, preset);
        if (result !== null && result.sessionId !== id) {
          // 纯聊天边界重建会换会话 id（core 广播 session_replaced 后重 key）：
          // 跟到新 id 重建本地状态（同 fork 的重绑三件套）
          disposeAgentStream(id);
          initializedRef.current = result.sessionId;
          switchSession(result.sessionId);
          setHistoryCursor({ hasMore: false });
          return null;
        }
        await loadTools();
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession, loadTools, switchSession],
  );

  const autoName = useCallback(
    async (dryRun = false): Promise<{ title?: string; error?: string }> => {
      const id = requireSession();
      if (id === null) return { error: '没有活动会话' };
      try {
        // 落盘归服务端（resident → 命令通道 / 冷会话 → rename），这里不再补一次写，
        // 否则与 runtime 抢写同一会话文件（2026-09-26 BUG-1d）。
        const { title } = await autoNameSession(id, dryRun ? { dryRun: true } : {});
        return { title };
      } catch (error) {
        return { error: errorMessage(error) };
      }
    },
    [requireSession],
  );

  const setSessionName = useCallback(
    async (name: string): Promise<string | null> => {
      const id = requireSession();
      if (id === null) return '没有活动会话';
      try {
        await setAgentSessionName(id, name);
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession],
  );

  const steer = useCallback(
    async (text: string, images?: ImageContent[]): Promise<string | null> => {
      const id = requireSession();
      if (id === null) return '没有活动会话';
      try {
        await dispatchWithRevive(
          async () => {
            await waitStream(id);
            return steerAgent(id, text, images);
          },
          () => revive(id),
        );
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession, revive, waitStream],
  );

  const followUp = useCallback(
    async (text: string, images?: ImageContent[]): Promise<string | null> => {
      const id = requireSession();
      if (id === null) return '没有活动会话';
      try {
        await dispatchWithRevive(
          async () => {
            await waitStream(id);
            return followUpAgent(id, text, images);
          },
          () => revive(id),
        );
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession, revive, waitStream],
  );

  const clearQueue = useCallback(async (): Promise<void> => {
    const id = requireSession();
    if (id === null) return;
    await clearAgentQueue(id).catch(() => null);
  }, [requireSession]);

  /**
   * fork：**破坏性原地替换**——返回新 sessionId，旧 id 立即失效（docs/01 §8-1），
   * 所以这里要主动清理旧流并把当前会话切到新 id（调用方据此更新 URL）。
   */
  const fork = useCallback(
    async (entryId: string): Promise<string | null> => {
      const id = requireSession();
      if (id === null) return '没有活动会话';
      try {
        const result = await forkAgentSession(id, entryId);
        if (result.cancelled || result.newSessionId === undefined) return '分叉被取消';
        disposeAgentStream(id);
        initializedRef.current = result.newSessionId;
        switchSession(result.newSessionId);
        setHistoryCursor({ hasMore: false });
        return null;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [requireSession, switchSession],
  );

  const navigateTree = useCallback(
    async (
      targetId: string,
      options: { summarize?: boolean; label?: string } = {},
    ): Promise<{ error?: string; editorText?: string }> => {
      const id = requireSession();
      if (id === null) return { error: '没有活动会话' };
      try {
        const result = await navigateAgentTree(id, targetId, options);
        if (result.cancelled) return { error: '切换被取消' };
        return result.editorText === undefined ? {} : { editorText: result.editorText };
      } catch (error) {
        return { error: errorMessage(error) };
      }
    },
    [requireSession],
  );

  const respondExtensionUi = useCallback(
    async (
      id: string,
      response: { value?: string; confirmed?: boolean; cancelled?: true },
    ): Promise<void> => {
      const session = requireSession();
      if (session === null) return;
      await respondAgentExtensionUi(session, id, response).catch(() => null);
      // 本地立即收起对话框（服务端不再重发；extension_ui_closed 只是兜底）
      const stream = getAgentStream(session);
      const current = stream.getSnapshot();
      if (current.extensionRequest?.id === id) {
        stream.restore({ ...current, extensionRequest: null }, Number.MAX_SAFE_INTEGER);
      }
    },
    [requireSession],
  );

  return {
    sessionId,
    cwd,
    pendingModel,
    commands,
    tools,
    stats,
    liveState,
    loadCommands,
    loadTools,
    refreshStats,
    refreshLiveState,
    compact,
    setThinkingLevel,
    setModel,
    abortCompaction,
    setTools,
    autoName,
    setSessionName,
    steer,
    followUp,
    clearQueue,
    fork,
    navigateTree,
    respondExtensionUi,
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

/**
 * 命令派发 + 「会话已被回收」自愈重试（ADR-0013 的客户端侧责任）。
 *
 * 404 表示注册表里没有这个会话（server 重启 / idle 回收 / 另开标签页挤掉），重试同一份
 * 请求永远不会成功——必须先 revive（resume + 重建历史 + 重置流）再发一次。否则用户的
 * 消息就这样静默丢掉：composer 已清空，界面上只留一个「Session not found」的提示（2026-09-26）。
 *
 * 只重试一次：第二次仍 404 说明会话文件也不在了（真删除/真不存在），错误照常上抛。
 *
 * 导出只为单测（不属公开 API：`react/index.ts` 是显式列名导出）：404→revive→重发的
 * 顺序是「消息不丢」的全部依据，纯函数便于锁住。
 */
export async function dispatchWithRevive<T>(
  dispatch: () => Promise<T>,
  revive: () => Promise<void>,
): Promise<T> {
  try {
    return await dispatch();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    await revive();
    return await dispatch();
  }
}

const EMPTY_CHAT = emptyChatState();
const getEmptyChatState = (): ChatState => EMPTY_CHAT;
const noopSubscribe = (): (() => void) => () => {};
