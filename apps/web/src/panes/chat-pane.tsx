import {
  applyAtInsertion,
  applySlashInsertion,
  buildEntriesFromFiles,
  buildMinimapBars,
  contextPercent,
  extractAtQuery,
  extractSlashQuery,
  extractTurnWrittenFiles,
  filterFileEntries,
  filterSlashCommands,
  formatCost,
  formatTokens,
  getFileIndex,
  parseSlashSubmission,
  sessionExportUrl,
  shortPath,
  slashSourceLabel,
  summarizeStats,
} from '@ice-ai/client';
import {
  useAgentSession,
  useGitStatusQuery,
  useModelsQuery,
  useSessionDetailQuery,
} from '@ice-ai/client/react';
import {
  ChatMinimap,
  Composer,
  ComposerToolbar,
  EmptyState,
  ExtensionRequestDialog,
  ExtensionStatusBar,
  ExtensionWidgets,
  MessageList,
  type MessageListHandle,
  QueueBar,
  type SuggestionItem,
  ToastHost,
  type ToastItem,
  TurnWrittenFiles,
  toastQueueReducer,
  useI18n,
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
import { useServerHealth } from '../layout/health';
import { fileTabsStore } from '../services/file-tabs-store';
import { useInputHistory } from '../services/use-input-history';
import { useCompletionSignal } from '../services/use-notifications';
import { getLastCwd, setLastCwd } from '../services/workspace-memory';
import { type ActivePanel, PanelsHost } from './panels-host';

/** 中栏工具条最左侧的侧栏开关（pi-web AppShell 的 36×36 图标按钮） */
function SidebarToggleButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? '隐藏侧栏' : '显示侧栏'}
      aria-label={open ? '隐藏侧栏' : '显示侧栏'}
      className="flex h-9 w-9 shrink-0 items-center justify-center border-0 border-r border-r-border bg-transparent text-text-muted transition-colors hover:text-text"
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

/**
 * ChatPane（F1→F5）：对话主面板。URL `?s=` 是会话的唯一真相（ADR-0019-5）。
 * F5 增补：斜杠命令 / 输入历史 / 排队条 / 压缩与自动命名 / 统计与分支面板 /
 * minimap / 本轮改动文件 / 扩展 UI（状态栏·widgets·阻塞对话框）/ 完成提示音。
 */
export interface ChatPaneProps {
  preferredCwd?: string | null;
  /** 侧栏开关（页头左侧按钮，结构对齐 pi-web AppShell 的中栏工具条） */
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** 项目需要信任但未信任：在工具条上给一个常驻入口 */
  trustPending?: boolean;
  onTrustProject?: () => void;
}

const TOOL_PRESET_OPTIONS = [
  { value: 'configured', label: '跟随设置' },
  { value: 'none', label: '纯聊天' },
  { value: 'read-only', label: '只读' },
  { value: 'default', label: '默认' },
  { value: 'full', label: '全部工具' },
] as const;

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
  sidebarOpen = true,
  onToggleSidebar,
  trustPending = false,
  onTrustProject,
}: ChatPaneProps) {
  const session = useAgentSession();
  const { chat, sessionId } = session;
  const [draft, setDraft] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState<string[] | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [autoNaming, setAutoNaming] = useState(false);
  const [steeringMode, setSteeringMode] = useState(false);
  const selfNavigationRef = useRef<string | null>(null);
  const minimapController = useRef<MessageListHandle | null>(null);
  const urlSessionId = searchParams.get('s');

  const history = useInputHistory(sessionId);
  const signal = useCompletionSignal();
  const { t } = useI18n();
  const detail = useSessionDetailQuery(sessionId);
  const models = useModelsQuery(session.cwd ?? undefined);
  const gitStatus = useGitStatusQuery(session.cwd);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);

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
        chat.sessionName ?? 'PiBoat',
        lastTurn?.final?.markdown.slice(0, 120) ?? '本轮已完成',
      );
      void session.refreshStats();
      void session.refreshLiveState();
      void detail.refetch();
    }
    wasStreamingRef.current = chat.streaming;
  }, [chat.streaming]);

  // ⑤ 斜杠 / 提及候选（斜杠优先：命令在行首，提及在词中）
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

  /** 生成标题（工具条与 composer 工具行共用；实现在一处避免两遍状态机） */
  const runAutoName = useCallback(() => {
    setAutoNaming(true);
    void session.autoName().then((result) => {
      setAutoNaming(false);
      if (result.error !== undefined) pushToast(result.error, 'error');
      else pushToast(`${t('title.updated')}：${result.title ?? ''}`);
      void detail.refetch();
    });
  }, [session, pushToast, detail, t]);

  const handleSubmit = useCallback(
    (text: string) => {
      history.remember(text);
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
    [session, pushToast, history, steeringMode, chat.streaming],
  );

  const lastTurnId = chat.turns[chat.turns.length - 1]?.id;
  const writtenPaths = useMemo(() => {
    const groups = extractTurnWrittenFiles(chat.turns);
    return groups.find((group) => group.turnId === lastTurnId)?.paths ?? [];
  }, [chat.turns, lastTurnId]);

  const minimapBars = useMemo(() => buildMinimapBars(chat.turns, 0, 1, 1), [chat.turns]);
  const statsSummary = useMemo(() => summarizeStats(session.stats), [session.stats]);
  const contextPct = useMemo(
    () => contextPercent(session.liveState?.contextUsage),
    [session.liveState],
  );

  // 思考档位候选：按当前模型取（服务端给的是 `provider:id` 键）
  const modelKey =
    session.liveState?.model === null || session.liveState?.model === undefined
      ? null
      : `${session.liveState.model.provider}:${session.liveState.model.modelId}`;
  const thinkingLevels = modelKey === null ? [] : (models.data?.thinkingLevels[modelKey] ?? []);

  const health = useServerHealth();

  if (sessionId === null) {
    return (
      <>
        {onToggleSidebar !== undefined && (
          <div className="flex h-9 shrink-0 items-center border-b border-border bg-bg-panel">
            <SidebarToggleButton open={sidebarOpen} onToggle={onToggleSidebar} />
          </div>
        )}
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

  const compacting = session.liveState?.isCompacting === true;

  return (
    <div className="chat-content flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 bg-bg-panel">
        <div className="hairline-b relative flex h-9 items-center border-border">
          {onToggleSidebar !== undefined && (
            <SidebarToggleButton open={sidebarOpen} onToggle={onToggleSidebar} />
          )}
          {trustPending && (
            <button
              type="button"
              onClick={onTrustProject}
              title="该项目有需要信任的资源（skills / 扩展）；未信任则不会加载"
              className="flex h-full shrink-0 items-center gap-1.5 border-0 border-r border-r-border bg-transparent px-3 text-[11px] text-warn hover:bg-bg-hover"
            >
              ⚠ 项目未信任 — 点击信任
            </button>
          )}
          <span className="truncate px-3 text-[12px] text-text-dim">
            {chat.sessionName ?? sessionId.slice(0, 8)}
          </span>
          {health === 'down' && <span className="text-[11px] text-danger">· 服务连接中断</span>}
          <div className="ml-auto flex h-full items-stretch">
            {chat.streaming && (
              <span className="flex items-center px-3 text-[11px] text-accent">
                {t('chat.thinking')}
              </span>
            )}
            {/* 完整历史（pi-web `handleViewFullHistory`：直接开导出的内联页） */}
            <TopBarAction
              title={t('history.full')}
              label={t('history.label')}
              onClick={() =>
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
                  aria-hidden="true"
                >
                  <path d="M3 3v5h5" />
                  <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                  <path d="M12 7v5l4 2" />
                </svg>
              }
            />
            {/* 生成标题（pi-web 工具条的 auto-name 按钮） */}
            <TopBarAction
              title={t('title.generateSession')}
              label={t('title.generate')}
              disabled={autoNaming}
              onClick={runAutoName}
              icon={
                autoNaming ? (
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
                )
              }
            />
            {/* 分支 / 系统 / 工具：工具条 inline 触发的顶部面板 */}
            {(
              [
                ['branches', t('i18n.branches')],
                ['system', t('system.label')],
                ['tools', t('tools.label')],
              ] as const
            ).map(([panel, label]) => (
              <TopBarAction
                key={panel}
                label={label}
                title={label}
                pressed={activePanel === panel}
                onClick={() => {
                  const next = activePanel === panel ? null : panel;
                  setActivePanel(next);
                  if (next === 'system') void session.refreshLiveState();
                  if (next === 'tools') void session.loadTools();
                }}
                icon={
                  panel === 'branches' ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: 'var(--accent)', flexShrink: 0 }}
                      aria-hidden="true"
                    >
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 0 1-9 9" />
                    </svg>
                  ) : panel === 'system' ? (
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
                  ) : (
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
                  )
                }
              />
            ))}
            {/* 会话统计（S4：tokens / cost / context 内联显示 + popover 宿主） */}
            <TopBarAction
              title={t('session.title')}
              pressed={activePanel === 'stats'}
              onClick={() => {
                const next = activePanel === 'stats' ? null : 'stats';
                setActivePanel(next);
                if (next === 'stats') void session.refreshStats();
              }}
              trailing={
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {statsSummary.input > 0 && (
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
                      {formatTokens(statsSummary.input)}
                    </span>
                  )}
                  {statsSummary.output > 0 && (
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
                      {formatTokens(statsSummary.output)}
                    </span>
                  )}
                  {statsSummary.cost > 0 && (
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                      {formatCost(statsSummary.cost)}
                    </span>
                  )}
                  {contextPct !== null && (
                    <span
                      style={{
                        color:
                          contextPct > 90
                            ? '#ef4444'
                            : contextPct > 70
                              ? 'rgba(234,179,8,0.95)'
                              : 'var(--text-muted)',
                      }}
                    >
                      {contextPct.toFixed(0)}%
                    </span>
                  )}
                </span>
              }
            />
          </div>
        </div>
      </div>

      <PanelsHost
        active={activePanel}
        onClose={() => setActivePanel(null)}
        tree={detail.data?.tree ?? []}
        activeLeafId={detail.data?.leafId ?? null}
        branchesBusy={false}
        onNavigateNode={(nodeId) =>
          void session.navigateTree(nodeId).then((result) => {
            if (result.error !== undefined) pushToast(result.error, 'error');
            else if (result.editorText !== undefined) setDraft(result.editorText);
          })
        }
        onForkNode={(nodeId) =>
          void session.fork(nodeId).then((error) => {
            if (error !== null) pushToast(error, 'error');
            else pushToast('已从该节点分叉（旧会话已被替换）');
          })
        }
        onCloneSession={() =>
          void session.fork(chat.turns[chat.turns.length - 1]?.id ?? '').then(() => {
            pushToast('克隆能力由 navigate_tree + 分叉组合提供，当前按分叉处理');
          })
        }
        systemPrompt={session.liveState?.systemPrompt ?? null}
        systemLoading={false}
        onReloadSystemPrompt={() => void session.refreshLiveState()}
        tools={session.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          active: tool.active === true,
          parameters: tool.parameters,
          promptGuidelines: tool.promptGuidelines,
        }))}
        toolsLoading={false}
        stats={session.stats === null ? null : statsSummary}
        statsInfo={
          detail.data === undefined
            ? null
            : {
                sessionId: detail.data.sessionId,
                filePath: detail.data.filePath,
                messageCount: detail.data.info.messageCount,
                branch: detail.data.info.branch,
                isWorktree: detail.data.info.isWorktree,
                model: session.liveState?.model?.modelId,
                created: detail.data.info.created,
                modified: detail.data.info.modified,
              }
        }
        contextPercent={contextPct}
        statsLoading={false}
        onReloadStats={() => void session.refreshStats()}
      />

      <ExtensionStatusBar statuses={session.liveState?.extensionStatuses ?? []} />
      <ExtensionWidgets widgets={session.liveState?.extensionWidgets ?? []} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <MessageList
          chat={chat}
          hasOlder={session.hasOlder}
          loadingOlder={session.loadingOlder}
          onLoadOlder={() => void session.loadOlder()}
          controllerRef={minimapController}
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

      <div className="shrink-0 pb-4">
        <div style={{ padding: '0 16px' }}>
          <QueueBar
            steering={chat.queued.steering}
            followUp={chat.queued.followUp}
            onClear={() => void session.clearQueue()}
          />
        </div>
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
          aboveInput={
            <div
              className="mx-auto flex items-center gap-1.5 pb-1"
              style={{ maxWidth: 'var(--chat-content-max-width, 820px)' }}
            >
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
                autoNaming={autoNaming}
                onExport={() => window.open(sessionExportUrl(sessionId), '_blank')}
                onOpenStats={() => {
                  setActivePanel('stats');
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
