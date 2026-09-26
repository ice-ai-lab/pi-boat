import {
  applyAtInsertion,
  applySlashInsertion,
  buildEntriesFromFiles,
  buildMinimapBars,
  extractAtQuery,
  extractSlashQuery,
  extractTurnWrittenFiles,
  filterFileEntries,
  filterSlashCommands,
  getFileIndex,
  parseSlashSubmission,
  sessionExportUrl,
  shortPath,
  slashSourceLabel,
} from '@ice-ai/client';
import {
  useAgentSession,
  useGitStatusQuery,
  useModelsQuery,
  useSessionDetailQuery,
} from '@ice-ai/client/react';
import {
  BranchNavigator,
  ChatMinimap,
  Composer,
  ComposerToolbar,
  EmptyState,
  ExtensionRequestDialog,
  ExtensionStatusBar,
  hasSessionBranches,
  MessageList,
  type MessageListHandle,
  QueueBar,
  type SuggestionItem,
  ToastHost,
  type ToastItem,
  TurnWrittenFiles,
  toastQueueReducer,
  useI18n,
  WorkspacePlaceholder,
} from '@ice-ai/ui';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router';
import { APP_VERSION, useServerInfo } from '../layout/health';
import { fileTabsStore } from '../services/file-tabs-store';
import { useMentionInsertion } from '../services/mention-bus';
import { useInputHistory } from '../services/use-input-history';
import { registerAbortHandler } from '../services/use-keyboard-shortcuts';
import { useCompletionSignal } from '../services/use-notifications';
import { getLastCwd, setLastCwd } from '../services/workspace-memory';
import { type ActivePanel, PanelsHost } from './panels-host';

/** pi-web `AppShell` 的 `TOP_BAR_ICON_BUTTON_SIZE` */
const TOP_BAR_ICON_BUTTON_SIZE = 36;

/** 中栏工具条最左侧的侧栏开关（逐字照抄 pi-web `AppShell`：36×36 图标按钮） */
function SidebarToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? t('sidebar.hide') : t('sidebar.show')}
      aria-label={open ? t('sidebar.hide') : t('sidebar.show')}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: TOP_BAR_ICON_BUTTON_SIZE,
        height: TOP_BAR_ICON_BUTTON_SIZE,
        padding: 0,
        background: 'none',
        border: 'none',
        borderRight: '1px solid var(--border)',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'color 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      {open ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      )}
    </button>
  );
}

/** 生成标题的三态（pi-web `autoNameStatus`） */
type AutoNameStatus = {
  kind: 'idle' | 'naming' | 'success' | 'error';
  message?: string;
};

/**
 * ChatPane（F1→F5）：对话主面板。URL `?s=` 是会话的唯一真相（ADR-0019-5）。
 * 工具条逐字照抄 pi-web `AppShell` 的桌面向：
 * 侧栏开关 → 信任警示 → 历史/生成标题/分支/系统/工具 → 会话统计 → 文件面板开关；
 * 顶部面板为 `position:fixed` 贴顶下拉（T1-3），一次只开一个。
 */
export interface ChatPaneProps {
  /** 侧栏已选中项目（无会话且未请求新会话时的占位形态由它决定） */
  projectSelected?: boolean;
  preferredCwd?: string | null;
  /** 侧栏开关（页头左侧按钮，结构对齐 pi-web AppShell 的中栏工具条） */
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** 项目需要信任但未信任：在工具条上给一个常驻入口 */
  trustPending?: boolean;
  onTrustProject?: () => void;
  /** 右栏（文件面板）开合：工具条最右的 36×36 开关按钮（T1-1） */
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
  /** 右栏全宽展开时收起顶部面板（pi-web `rightPanelFullWidth` 效果，T0-4） */
  rightPanelFullWidth?: boolean;
}

const TOOL_PRESET_OPTIONS = [
  { value: 'configured', label: '跟随设置' },
  { value: 'none', label: '纯聊天' },
  { value: 'read-only', label: '只读' },
  { value: 'default', label: '默认' },
  { value: 'full', label: '全部工具' },
] as const;

/** pi-web `formatCompact`（AppShell：1200 → "1k"，1_200_000 → "1.2M"） */
function formatCompact(value: number): string {
  return value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1000
      ? `${(value / 1000).toFixed(0)}k`
      : String(value);
}

/**
 * pi-web 中栏工具条按钮（`AppShell` 的 `renderChatToolbarActions`）：
 * 2px 顶部描边表示激活态，右侧 1px 分隔线，图标 12–13px + 11px 文案。
 */
function TopBarAction({
  label,
  title,
  pressed = false,
  disabled = false,
  onClick,
  icon,
  trailing,
  style,
}: {
  label?: string;
  title: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick(): void;
  icon?: ReactNode;
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: '100%',
        padding: '0 12px',
        background: pressed ? 'var(--bg-selected)' : 'none',
        border: 'none',
        borderTop: `2px solid ${pressed ? 'var(--accent)' : 'transparent'}`,
        borderRight: '1px solid var(--border)',
        color: pressed ? 'var(--text)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
        fontSize: 11,
        whiteSpace: 'nowrap',
        transition: 'color 0.1s, background 0.1s, opacity 0.1s',
        ...style,
      }}
      onMouseEnter={(event) => {
        if (disabled) return;
        event.currentTarget.style.color = 'var(--text)';
        event.currentTarget.style.background = pressed ? 'var(--bg-selected)' : 'var(--bg-hover)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.color = pressed ? 'var(--text)' : 'var(--text-muted)';
        event.currentTarget.style.background = pressed ? 'var(--bg-selected)' : 'none';
      }}
    >
      {icon}
      {label !== undefined && <span>{label}</span>}
      {trailing}
    </button>
  );
}

export function ChatPane({
  preferredCwd = null,
  projectSelected = false,
  sidebarOpen = true,
  onToggleSidebar,
  trustPending = false,
  onTrustProject,
  rightPanelOpen = false,
  onToggleRightPanel,
  rightPanelFullWidth = false,
}: ChatPaneProps) {
  const session = useAgentSession();
  const { chat, sessionId } = session;
  const [draft, setDraft] = useState('');
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState<string[] | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [autoNameStatus, setAutoNameStatus] = useState<AutoNameStatus>({ kind: 'idle' });
  const [steeringMode, setSteeringMode] = useState(false);
  /** minimap 视口跟踪（T0-1：替换硬编码的 0,1,1） */
  const [viewport, setViewport] = useState({ scrollTop: 0, clientHeight: 1, scrollHeight: 1 });
  const selfNavigationRef = useRef<string | null>(null);
  const minimapController = useRef<MessageListHandle | null>(null);
  /** pi-web `topBarRef`：顶部面板 fixed 下拉的定位基准（T1-3） */
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topPanelPos, setTopPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const urlSessionId = searchParams.get('s');

  const history = useInputHistory(sessionId);
  const signal = useCompletionSignal();
  const { t } = useI18n();
  const models = useModelsQuery(session.cwd ?? undefined);
  const gitStatus = useGitStatusQuery(session.cwd);
  const detail = useSessionDetailQuery(sessionId);
  const serverInfo = useServerInfo();

  // 侧栏文件树的「提及」：把 @相对路径 追加进草稿（pi-web AppShell → ChatInput 同款链路）
  const insertMentionText = useCallback((text: string) => {
    setDraft((previous) => (previous.length === 0 ? text : `${previous} ${text}`));
  }, []);
  useMentionInsertion(insertMentionText);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);

  // pi-web `showChat`：选中会话、或已选目录准备开新会话 → 显示完整工具条与对话区
  const showChat = sessionId !== null || preferredCwd !== null;

  // ① URL → 会话
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

  // ② 会话 id → URL
  useEffect(() => {
    if (sessionId === null || urlSessionId === sessionId) return;
    selfNavigationRef.current = sessionId;
    setSearchParams({ s: sessionId }, { replace: true });
  }, [sessionId, urlSessionId, setSearchParams]);

  // ③ 切会话后预取：命令 / 工具 / 统计 / 运行时状态（systemPrompt）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在会话切换时预取一次
  useEffect(() => {
    if (sessionId === null) return;
    void session.loadCommands();
    void session.loadTools();
    void session.refreshStats();
    void session.refreshLiveState();
  }, [sessionId]);

  // ④ 一轮结束：提示音/通知 + 统计与状态刷新，并刷新会话详情（分支树/条目数会变）
  const wasStreamingRef = useRef(false);
  // 只在 streaming 的下降沿触发：读取的 turns/sessionName 都通过闭包取「当次渲染」的值，
  // 把它们放进依赖会在流式期间反复触发（每帧 effect），故显式豁免
  // biome-ignore lint/correctness/useExhaustiveDependencies: 见上行说明
  useEffect(() => {
    if (wasStreamingRef.current && !chat.streaming) {
      const lastTurn = chat.turns[chat.turns.length - 1];
      signal.notifyDone(
        chat.sessionName ?? 'Pi Web',
        lastTurn?.final?.markdown.slice(0, 120) ?? '本轮已完成',
      );
      void session.refreshStats();
      void session.refreshLiveState();
      void detail.refetch();
    }
    wasStreamingRef.current = chat.streaming;
  }, [chat.streaming]);

  // ⑤ 全局 Esc 停止（pi-web `registerAbortHandler`：只在运行中接管 Esc）
  useEffect(() => {
    registerAbortHandler(chat.streaming ? () => void session.abort() : null);
    return () => {
      registerAbortHandler(null);
    };
  }, [chat.streaming, session]);

  // ⑥ 顶部面板定位：fixed 贴顶下拉（T1-3，照抄 AppShell 的 topPanelPos effect）
  useEffect(() => {
    if (activePanel === null || activePanel === 'branches' || topBarRef.current === null) return;
    const update = () => {
      const topBarRect = topBarRef.current?.getBoundingClientRect();
      if (topBarRect === undefined) return;
      setTopPanelPos({ top: topBarRect.bottom, left: topBarRect.left, width: topBarRect.width });
    };
    update();
    const ro = new ResizeObserver(update);
    if (topBarRef.current !== null) ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activePanel]);

  // ⑦ 右栏全宽展开时收起顶部面板（T0-4，照抄 AppShell `rightPanelFullWidth` 效果）
  useEffect(() => {
    if (rightPanelFullWidth) setActivePanel(null);
  }, [rightPanelFullWidth]);

  // ⑧ 斜杠 / 提及候选（斜杠优先：命令在行首，提及在词中）
  const textBeforeCaret = draft.slice(0, Math.min(caret, draft.length));
  const slashMatch = extractSlashQuery(textBeforeCaret);
  const mentionMatch = slashMatch === null ? extractAtQuery(textBeforeCaret) : null;

  useEffect(() => {
    if (mentionMatch === null || fileIndex !== null || session.cwd === null) return;
    void getFileIndex(session.cwd)
      .then((index) => setFileIndex(index.files))
      .catch(() => setFileIndex([]));
  }, [mentionMatch, fileIndex, session.cwd]);

  const mentionEntries = useMemo(
    () =>
      mentionMatch === null || fileIndex === null
        ? []
        : filterFileEntries(buildEntriesFromFiles(fileIndex), mentionMatch.query),
    [mentionMatch, fileIndex],
  );

  const mentionItems: SuggestionItem[] = mentionEntries.map((entry) => ({
    label: entry.path,
    hint: entry.isDir ? '目录' : undefined,
  }));

  const slashCandidates = useMemo(
    () =>
      slashMatch === null || slashMatch.hasArgs
        ? []
        : filterSlashCommands(session.commands, slashMatch.name),
    [slashMatch, session.commands],
  );

  const slashItems: SuggestionItem[] = slashCandidates.map((command) => ({
    label: `/${command.name}`,
    hint: slashSourceLabel(command.source),
    description: command.description,
  }));

  const pickMention = useCallback(
    (index: number) => {
      const entry = mentionEntries[index];
      if (entry === undefined || mentionMatch === null) return;
      const inserted = applyAtInsertion(draft, mentionMatch, entry);
      setDraft(inserted.text);
      setCaret(inserted.caret);
      setActiveIndex(0);
    },
    [mentionEntries, mentionMatch, draft],
  );

  const pickSlash = useCallback(
    (index: number) => {
      const command = slashCandidates[index];
      if (command === undefined || slashMatch === null) return;
      const inserted = applySlashInsertion(draft, slashMatch, command.name);
      setDraft(inserted.text);
      setCaret(inserted.caret);
      setActiveIndex(0);
    },
    [slashCandidates, slashMatch, draft],
  );

  const startSession = useCallback(
    async (cwd: string) => {
      const error = await session.start(cwd);
      if (error !== null) {
        pushToast(error, 'error');
        return;
      }
      setLastCwd(cwd);
    },
    [session, pushToast],
  );

  /** 生成标题（工具条与 composer 工具行共用；三态照抄 pi-web `autoNameStatus`，T1-6） */
  const runAutoName = useCallback(() => {
    if (sessionId === null) return;
    setAutoNameStatus({ kind: 'naming' });
    void session.autoName().then((result) => {
      if (result.error !== undefined) {
        setAutoNameStatus({ kind: 'error', message: result.error });
        pushToast(result.error, 'error');
      } else {
        setAutoNameStatus({ kind: 'success' });
        pushToast(`${t('title.updated')}：${result.title ?? ''}`);
      }
    });
  }, [session, sessionId, pushToast, t]);

  const handleSubmit = useCallback(
    (text: string) => {
      history.remember(text);
      // 空态直接发消息：先按当前项目开一条新会话，再把这句话发出去（pi-web：发送即建会话）
      if (sessionId === null) {
        const cwd = preferredCwd ?? getLastCwd();
        if (cwd === null) {
          pushToast('请先在侧栏选择项目目录', 'error');
          return;
        }
        void startSession(cwd).then(() => {
          void session.send(text).then((error) => {
            if (error !== null) pushToast(error, 'error');
          });
        });
        return;
      }
      if (steeringMode && chat.streaming) {
        void session.steer(text).then((error) => {
          if (error !== null) pushToast(error, 'error');
        });
        return;
      }
      void session.send(text).then((error) => {
        if (error === null) return;
        const command = parseSlashSubmission(text);
        pushToast(command === null ? error : `命令 /${command.name} 发送失败：${error}`, 'error');
      });
    },
    [
      session,
      sessionId,
      preferredCwd,
      startSession,
      pushToast,
      history,
      steeringMode,
      chat.streaming,
    ],
  );

  const lastTurnId = chat.turns[chat.turns.length - 1]?.id;
  const writtenPaths = useMemo(() => {
    const groups = extractTurnWrittenFiles(chat.turns);
    return groups.find((group) => group.turnId === lastTurnId)?.paths ?? [];
  }, [chat.turns, lastTurnId]);

  // T0-1：minimap 视口区间由 MessageList 回传（替换硬编码 0,1,1）
  const minimapBars = useMemo(
    () =>
      buildMinimapBars(
        chat.turns,
        viewport.scrollTop,
        viewport.clientHeight,
        viewport.scrollHeight,
      ),
    [chat.turns, viewport],
  );

  // 思考档位候选：按当前模型取（服务端给的是 `provider:id` 键）
  const modelKey =
    session.liveState?.model === null || session.liveState?.model === undefined
      ? null
      : `${session.liveState.model.provider}:${session.liveState.model.modelId}`;
  const thinkingLevels = modelKey === null ? [] : (models.data?.thinkingLevels[modelKey] ?? []);

  // —— 工具条数据（pi-web 的 sessionStats / contextUsage / sessionHasBranches） ——
  const sessionStats = session.stats;
  const contextUsage = session.liveState?.contextUsage ?? null;
  const hasBranches = useMemo(
    () => hasSessionBranches(detail.data?.tree ?? []),
    [detail.data?.tree],
  );

  // 会话统计按钮内容（照抄 pi-web `renderSessionStatsButton` 桌面分支，T1-5）
  const tokens = sessionStats?.tokens;
  const cost = sessionStats?.cost ?? 0;
  const costText = cost > 0 ? (cost >= 0.01 ? `$${cost.toFixed(2)}` : '<$0.01') : null;
  let contextColor = 'var(--text-muted)';
  let desktopContextText: string | null = null;
  if (contextUsage?.contextWindow) {
    const percent = contextUsage.percent;
    if (percent !== null && percent > 90) contextColor = '#ef4444';
    else if (percent !== null && percent > 70) contextColor = 'rgba(234,179,8,0.95)';
    desktopContextText =
      percent !== null
        ? `${percent.toFixed(0)}% / ${formatCompact(contextUsage.contextWindow)}`
        : `? / ${formatCompact(contextUsage.contextWindow)}`;
  }
  const tooltipParts: string[] = [];
  if (tokens) {
    tooltipParts.push(`in: ${tokens.input.toLocaleString()}`);
    tooltipParts.push(`out: ${tokens.output.toLocaleString()}`);
    tooltipParts.push(`cache read: ${tokens.cacheRead.toLocaleString()}`);
    tooltipParts.push(`cache write: ${tokens.cacheWrite.toLocaleString()}`);
    if (cost > 0) tooltipParts.push(`cost: $${cost.toFixed(4)}`);
  }
  if (contextUsage?.contextWindow) {
    const percent = contextUsage.percent;
    tooltipParts.push(
      `context: ${percent !== null ? `${percent.toFixed(1)}%` : 'unknown'} of ${contextUsage.contextWindow.toLocaleString()} tokens`,
    );
  }
  const statsTooltip = tooltipParts.join('  |  ');
  const showStatsButton = showChat && (sessionStats !== null || contextUsage !== null);

  // 生成标题按钮状态（照抄 pi-web：hasMessages 参考 userMessages 与消息总数）
  const hasMessages =
    sessionId !== null &&
    ((sessionStats?.userMessages ?? 0) > 0 || (session.liveState?.messageCount ?? 0) > 0);
  const autoNameDisabled = sessionId === null || !hasMessages || autoNameStatus.kind === 'naming';
  const autoNameIsSuccess = autoNameStatus.kind === 'success';
  const autoNameIsError = autoNameStatus.kind === 'error';
  const autoNameLabel =
    autoNameStatus.kind === 'naming'
      ? t('title.generating')
      : autoNameIsSuccess
        ? t('title.updated')
        : autoNameIsError
          ? t('title.failed')
          : t('title.generate');
  const autoNameTitle = !sessionId
    ? t('title.unsaved')
    : !hasMessages
      ? t('title.noMessages')
      : autoNameIsError
        ? (autoNameStatus.message ?? t('title.generateSession'))
        : t('title.generateSession');

  const compacting = session.liveState?.isCompacting === true;

  /**
   * 输入区（空态与活动会话共用）：排队条 + Composer。
   * 工具行（T3-4 的几何纠正）放在输入卡**下方**（`belowInput`，pi-web ChatInput 底部行）：
   * 左=模型/思考，右=工具预设/压缩/导出/统计/插队/声音。完整图标化形态见 T3-4 剩余项。
   */
  const composerElement = (
    <div className="shrink-0 pb-4">
      {sessionId !== null && (
        <div style={{ padding: '0 16px' }}>
          <QueueBar
            steering={chat.queued.steering}
            followUp={chat.queued.followUp}
            onClear={() => void session.clearQueue()}
          />
        </div>
      )}
      <Composer
        value={draft}
        onChange={(next) => {
          setDraft(next);
          history.resetCursor();
        }}
        onSubmit={handleSubmit}
        onAbort={() => void session.abort()}
        streaming={chat.streaming}
        disabled={chat.terminated}
        mentions={mentionItems}
        onPickMention={pickMention}
        slashCommands={slashItems}
        onPickSlashCommand={pickSlash}
        mentionActiveIndex={activeIndex}
        onMentionActiveIndexChange={setActiveIndex}
        onCaretChange={setCaret}
        onHistoryPrev={
          draft.length === 0 || history.cursor.index !== -1
            ? () => setDraft(history.prevValue(draft))
            : undefined
        }
        onHistoryNext={
          history.cursor.index !== -1 ? () => setDraft(history.nextValue(draft)) : undefined
        }
        belowInput={
          <div className="flex items-center gap-1.5">
            <ComposerToolbar
              modelLabel={session.liveState?.model?.modelId ?? null}
              thinkingLevel={session.liveState?.thinkingLevel ?? null}
              thinkingLevels={thinkingLevels}
              onThinkingLevelChange={(level) =>
                void session.setThinkingLevel(level as never).then((error) => {
                  if (error !== null) pushToast(error, 'error');
                })
              }
              toolPreset={null}
              toolPresets={[...TOOL_PRESET_OPTIONS]}
              onToolPresetChange={(preset) =>
                void session.setTools(preset as never).then((error) => {
                  if (error !== null) pushToast(error, 'error');
                })
              }
              compacting={compacting}
              onCompact={() =>
                void session.compact().then((error) => {
                  if (error !== null) pushToast(error, 'error');
                  else pushToast('已请求压缩上下文');
                })
              }
              onAbortCompaction={() => void session.abortCompaction()}
              onAutoName={runAutoName}
              autoNaming={autoNameStatus.kind === 'naming'}
              onExport={() =>
                sessionId !== null && window.open(sessionExportUrl(sessionId), '_blank')
              }
              onOpenStats={() => {
                setActivePanel('session');
                void session.refreshStats();
              }}
              busy={chat.streaming}
            />
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                aria-pressed={steeringMode}
                onClick={() => setSteeringMode((previous) => !previous)}
                title="开启后发送的消息会插队（steer）而不是排队"
                className={
                  steeringMode
                    ? 'sq bg-accent-weak px-1.5 py-0.5 text-[11px] text-accent'
                    : 'sq px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg'
                }
              >
                插队
              </button>
              <button
                type="button"
                aria-pressed={signal.soundEnabled}
                onClick={signal.toggleSound}
                title="一轮完成时响铃（页面存活期有效；ADR-0016 不做后台推送）"
                className="sq px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg"
              >
                {signal.soundEnabled ? '🔔' : '🔕'}
              </button>
            </div>
          </div>
        }
      />
    </div>
  );

  const toolbar = (
    <div ref={topBarRef} style={{ flexShrink: 0, background: 'var(--bg-panel)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          borderBottom: '1px solid var(--border)',
          height: 'calc(36px + env(safe-area-inset-top))',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {onToggleSidebar !== undefined && (
          <SidebarToggleButton open={sidebarOpen} onToggle={onToggleSidebar} />
        )}
        {/* 项目信任警示（逐字照抄 pi-web `renderProjectTrustWarning` 桌面分支） */}
        {trustPending && (
          <button
            type="button"
            onClick={onTrustProject}
            title={t('trust.resourcesNotLoaded')}
            aria-label={t('trust.resourcesNotLoaded')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: '100%',
              padding: '0 12px',
              background: 'none',
              border: 'none',
              borderRight: '1px solid var(--border)',
              color: '#d97706',
              cursor: 'pointer',
              flexShrink: 0,
              fontSize: 11,
              lineHeight: 1.35,
              textAlign: 'left',
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
            <span>{t('trust.resourcesNotLoaded')}</span>
          </button>
        )}
        {/* 历史 / 生成标题 / 分支 / 系统 / 工具（空态也渲染，页签 disabled，T1-2） */}
        {showChat && (
          <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
            {/* 完整历史（pi-web `handleViewFullHistory`：导出的内联页） */}
            <TopBarAction
              title={sessionId !== null ? t('history.full') : t('history.unsaved')}
              label={t('history.label')}
              disabled={sessionId === null}
              onClick={() =>
                sessionId !== null &&
                window.open(sessionExportUrl(sessionId), '_blank', 'noopener,noreferrer')
              }
              icon={
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    color: sessionId !== null ? 'var(--text-muted)' : 'var(--text-dim)',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M12 7v5l3 2" />
                </svg>
              }
            />
            {/* 生成标题（三态 + hasMessages 禁用，T1-6） */}
            <button
              type="button"
              onClick={runAutoName}
              disabled={autoNameDisabled}
              title={autoNameTitle}
              aria-label={autoNameLabel}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: '100%',
                padding: '0 12px',
                background: 'none',
                border: 'none',
                borderTop: '2px solid transparent',
                borderRight: '1px solid var(--border)',
                color: autoNameIsError
                  ? '#dc2626'
                  : autoNameIsSuccess
                    ? 'var(--accent)'
                    : autoNameDisabled
                      ? 'var(--text-dim)'
                      : 'var(--text-muted)',
                cursor: autoNameDisabled ? 'not-allowed' : 'pointer',
                opacity: autoNameDisabled && autoNameStatus.kind !== 'naming' ? 0.45 : 1,
                flexShrink: 0,
                fontSize: 11,
                whiteSpace: 'nowrap',
                transition: 'color 0.1s, background 0.1s, opacity 0.1s',
              }}
              onMouseEnter={(event) => {
                if (autoNameDisabled) return;
                event.currentTarget.style.color = autoNameIsError ? '#dc2626' : 'var(--text)';
                event.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.color = autoNameIsError
                  ? '#dc2626'
                  : autoNameIsSuccess
                    ? 'var(--accent)'
                    : autoNameDisabled
                      ? 'var(--text-dim)'
                      : 'var(--text-muted)';
                event.currentTarget.style.background = 'none';
              }}
            >
              {autoNameStatus.kind === 'naming' ? (
                <svg
                  className="animate-spin"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="2"
                    opacity="0.25"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : autoNameIsSuccess ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 4 5 5L7 22l-5-5Z" />
                  <path d="m14 5 5 5" />
                  <path d="M6 4V2M5 3H3M19 19v3M17.5 20.5h3" />
                </svg>
              )}
              <span>{autoNameLabel}</span>
            </button>
            {/* 分支：仅在会话存在分支时渲染（T1-7/T3-15，pi-web `BranchNavigator inline`） */}
            {hasBranches && (
              <BranchNavigator
                tree={detail.data?.tree ?? []}
                activeLeafId={detail.data?.leafId ?? null}
                onLeafChange={(leafId) => {
                  if (leafId === null) return;
                  void session.navigateTree(leafId).then((result) => {
                    if (result.error !== undefined) pushToast(result.error, 'error');
                    else if (result.editorText !== undefined) setDraft(result.editorText);
                    void detail.refetch();
                  });
                }}
                inline
                containerRef={topBarRef}
                open={activePanel === 'branches'}
                onToggle={() => setActivePanel(activePanel === 'branches' ? null : 'branches')}
                hasSession
              />
            )}
            <TopBarAction
              title={t('system.prompt')}
              label={t('system.label')}
              pressed={activePanel === 'system'}
              onClick={() => {
                const next = activePanel === 'system' ? null : 'system';
                setActivePanel(next);
                if (next === 'system') void session.refreshLiveState();
              }}
              icon={
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    color:
                      session.liveState?.systemPrompt !== null &&
                      session.liveState?.systemPrompt !== undefined
                        ? 'var(--accent)'
                        : 'var(--text-dim)',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
              }
            />
            <TopBarAction
              title={t('tools.title')}
              label={t('tools.label')}
              pressed={activePanel === 'tools'}
              onClick={() => {
                const next = activePanel === 'tools' ? null : 'tools';
                setActivePanel(next);
                if (next === 'tools') void session.loadTools();
              }}
              icon={
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    color: session.tools.some((tool) => tool.active)
                      ? 'var(--accent)'
                      : 'var(--text-dim)',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />
                </svg>
              }
            />
          </div>
        )}
        {/* 会话统计（T1-5：cacheRead 图标 + context `pct% / window`，ml-auto，无统计时隐藏） */}
        {showStatsButton && (
          <button
            type="button"
            onClick={() => {
              const next = activePanel === 'session' ? null : 'session';
              setActivePanel(next);
              if (next === 'session') void session.refreshStats();
            }}
            title={statsTooltip || t('session.title')}
            aria-label={t('session.title')}
            aria-pressed={activePanel === 'session'}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              minWidth: 0,
              gap: 10,
              paddingLeft: 12,
              paddingRight: 12,
              height: '100%',
              overflow: 'hidden',
              background: activePanel === 'session' ? 'var(--bg-selected)' : 'none',
              border: 'none',
              borderTop:
                activePanel === 'session' ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: 11,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color =
                activePanel === 'session' ? 'var(--text)' : 'var(--text-muted)';
            }}
          >
            {tokens && tokens.input > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="5" y1="8.5" x2="5" y2="1.5" />
                  <polyline points="2 4 5 1.5 8 4" />
                </svg>
                {formatCompact(tokens.input)}
              </span>
            )}
            {tokens && tokens.output > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="5" y1="1.5" x2="5" y2="8.5" />
                  <polyline points="2 6 5 8.5 8 6" />
                </svg>
                {formatCompact(tokens.output)}
              </span>
            )}
            {tokens && tokens.cacheRead > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8.5 5a3.5 3.5 0 1 1-1-2.45" />
                  <polyline points="6.5 1.5 8.5 2.5 7.5 4.5" />
                </svg>
                {formatCompact(tokens.cacheRead)}
              </span>
            )}
            {costText && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text)',
                  fontWeight: 500,
                }}
              >
                {costText}
              </span>
            )}
            {desktopContextText && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: contextColor }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 9 L1 5 Q1 1 5 1 Q9 1 9 5 L9 9" />
                  <line x1="1" y1="9" x2="9" y2="9" />
                </svg>
                {desktopContextText}
              </span>
            )}
          </button>
        )}
        {/* 文件面板开合（T1-1，照抄 pi-web `renderMainFileToggle`） */}
        {onToggleRightPanel !== undefined && (
          <button
            type="button"
            onClick={onToggleRightPanel}
            aria-controls="file-panel"
            aria-expanded={rightPanelOpen}
            title={rightPanelOpen ? t('files.hidePanel') : t('files.showPanel')}
            aria-label={rightPanelOpen ? t('files.hidePanel') : t('files.showPanel')}
            style={{
              marginLeft: !showStatsButton ? 'auto' : 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: TOP_BAR_ICON_BUTTON_SIZE,
              height: TOP_BAR_ICON_BUTTON_SIZE,
              padding: 0,
              background: rightPanelOpen ? 'var(--bg-selected)' : 'none',
              border: 'none',
              borderLeft: '1px solid var(--border)',
              color: rightPanelOpen ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'color 0.12s, background 0.12s',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.color = rightPanelOpen
                ? 'var(--text)'
                : 'var(--text-muted)';
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        )}
        {/* 顶部面板：fixed 贴顶下拉（T1-3，一次只开一个） */}
        {activePanel !== null && activePanel !== 'branches' && topPanelPos !== null && (
          <div
            style={{
              position: 'fixed',
              top: topPanelPos.top,
              left: topPanelPos.left,
              width: topPanelPos.width,
              maxHeight: `calc(100dvh - ${topPanelPos.top}px)`,
              overflowY: 'auto',
              zIndex: 500,
            }}
          >
            <PanelsHost
              active={activePanel}
              systemPrompt={session.liveState?.systemPrompt ?? null}
              systemLoading={false}
              tools={session.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                active: tool.active === true,
                parameters: tool.parameters,
                promptGuidelines: tool.promptGuidelines,
              }))}
              toolsLoading={false}
              stats={session.stats}
              contextUsage={contextUsage}
              project={
                session.cwd === null
                  ? null
                  : {
                      cwd: session.cwd,
                      branch: detail.data?.info.branch,
                      isWorktree: detail.data?.info.isWorktree,
                    }
              }
            />
          </div>
        )}
      </div>
    </div>
  );

  if (sessionId === null) {
    return (
      <div className="chat-content relative flex min-h-0 flex-1 flex-col">
        {toolbar}
        {showChat ? (
          <EmptyState
            appVersion={APP_VERSION}
            piVersion={serverInfo.piVersion}
            shelf={
              <ExtensionStatusBar
                statuses={session.liveState?.extensionStatuses ?? []}
                widgets={session.liveState?.extensionWidgets ?? []}
              />
            }
          >
            {composerElement}
          </EmptyState>
        ) : (
          <WorkspacePlaceholder hasCwd={projectSelected} />
        )}
        <ToastHost items={toasts} />
      </div>
    );
  }

  return (
    <div className="chat-content flex min-h-0 flex-1 flex-col">
      {toolbar}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <MessageList
          chat={chat}
          hasOlder={session.hasOlder}
          loadingOlder={session.loadingOlder}
          onLoadOlder={() => void session.loadOlder()}
          controllerRef={minimapController}
          onViewportChange={setViewport}
        />
        <ChatMinimap
          bars={minimapBars}
          onJump={(index) => minimapController.current?.scrollToTurn(index)}
        />
      </div>

      <TurnWrittenFiles
        paths={writtenPaths}
        className="mx-auto w-(--chat-w) max-w-full px-5 pb-1"
        displayPath={(path) => shortPath(path, session.cwd)}
        onOpen={(path) => {
          const relative = shortPath(path, session.cwd);
          const status = gitStatus.data?.files.find((file) => file.path === relative);
          fileTabsStore.open(path, status !== undefined && status.kind !== 'untracked');
        }}
      />

      {composerElement}

      {/* 扩展货架：composer 之下（消息区 → composer → 货架，T6-3/P5）；单一 shelf，widgets 在前 */}
      <ExtensionStatusBar
        statuses={session.liveState?.extensionStatuses ?? []}
        widgets={session.liveState?.extensionWidgets ?? []}
      />

      <ToastHost items={toasts} />
      {chat.extensionRequest !== null && (
        <ExtensionRequestDialog
          request={chat.extensionRequest}
          onRespond={(response) => {
            void session.respondExtensionUi(chat.extensionRequest?.id ?? '', response);
          }}
        />
      )}
    </div>
  );
}
