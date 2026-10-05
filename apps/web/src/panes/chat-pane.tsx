import {
  applyAtInsertion,
  applySlashInsertion,
  buildEntriesFromFiles,
  extractAtQuery,
  extractSlashQuery,
  filterFileEntries,
  filterSlashCommands,
  getFileIndex,
  parseSlashSubmission,
  resolveChatContentWidth,
  shortPath,
  slashSourceLabel,
} from '@ice-ai/client';
import {
  queryKeys,
  useAgentSession,
  useGitStatusQuery,
  useModelsQuery,
  useSessionDetailQuery,
} from '@ice-ai/client/react';
import { presetForToolNames, type SessionDetailResponse, TOOL_PRESETS } from '@ice-ai/protocol';
import {
  BranchNavigator,
  Composer,
  ComposerMetrics,
  ComposerToolbar,
  ContentWidthHandles,
  EmptyState,
  ExtensionRequestDialog,
  ExtensionStatusBar,
  FileIcon,
  hasSessionBranches,
  MessageList,
  QueueBar,
  type SuggestionItem,
  ToastHost,
  type ToastItem,
  toastQueueReducer,
  useI18n,
  WorkspacePlaceholder,
} from '@ice-ai/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router';
import { fileTabsStore } from '../services/file-tabs-store';
import { useMentionInsertion } from '../services/mention-bus';
import { getLastModel, type LastModel, setLastModel } from '../services/model-memory';
import { attachedImageToContent, useAttachedImages } from '../services/use-attached-images';
import { useChatAppearance } from '../services/use-chat-appearance';
import { useInputHistory } from '../services/use-input-history';
import { registerAbortHandler } from '../services/use-keyboard-shortcuts';
import { useCompletionSignal } from '../services/use-notifications';
import { getLastCwd, setLastCwd } from '../services/workspace-memory';
import { type ActivePanel, PanelsHost } from './panels-host';
import { decideSessionNav } from './session-nav';

/**
 * 拖拽附加图片的整屏覆盖层（T2-2，设计规范 `ChatWindow.tsx` 同形）：
 * 背景淡蓝 + 三圈涟漪 + 相册图标；关键帧在 `web-ui.css` 的 `drop-zone-in` / `drop-ripple`。
 */
function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex animate-[drop-zone-in_0.15s_ease_both] items-center justify-center bg-[rgba(37,99,235,0.06)] backdrop-blur-[1px]">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {[0, 0.8, 1.6].map((delay) => (
          <div
            key={delay}
            className="absolute h-[720px] w-[720px] animate-[drop-ripple_2.4s_ease-out_infinite_backwards] rounded-full border-[1.5px] border-solid border-[rgba(37,99,235,0.5)]"
            style={{ transformOrigin: 'center', animationDelay: `${delay}s` }}
          />
        ))}
      </div>
      <svg
        width="280"
        height="280"
        viewBox="0 0 140 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_6px_18px_rgba(37,99,235,0.18)]"
        aria-hidden="true"
      >
        <rect
          x="28"
          y="44"
          width="84"
          height="60"
          rx="8"
          fill="rgba(37,99,235,0.08)"
          stroke="rgba(37,99,235,0.50)"
          strokeWidth="1.8"
        />
        <path
          d="M36 100 L54 72 L68 88 L80 74 L104 100Z"
          fill="rgba(37,99,235,0.16)"
          stroke="rgba(37,99,235,0.40)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle
          cx="96"
          cy="58"
          r="8"
          fill="rgba(37,99,235,0.22)"
          stroke="rgba(37,99,235,0.55)"
          strokeWidth="1.6"
        />
        <g stroke="rgba(37,99,235,0.45)" strokeWidth="1.4" strokeLinecap="round">
          <line x1="96" y1="46" x2="96" y2="43" />
          <line x1="96" y1="70" x2="96" y2="73" />
          <line x1="84" y1="58" x2="81" y2="58" />
          <line x1="108" y1="58" x2="111" y2="58" />
          <line x1="87.5" y1="49.5" x2="85.4" y2="47.4" />
          <line x1="104.5" y1="66.5" x2="106.6" y2="68.6" />
          <line x1="104.5" y1="49.5" x2="106.6" y2="47.4" />
          <line x1="87.5" y1="66.5" x2="85.4" y2="68.6" />
        </g>
      </svg>
    </div>
  );
}

/** 设计规范 `AppShell` 的 `TOP_BAR_ICON_BUTTON_SIZE` */
const TOP_BAR_ICON_BUTTON_SIZE = 36;

/**
 * 顶部下拉面板宽度（用户 2026 要求：不占满整个会话列，按设计规范 `.pop` 的 560px 口径）。
 * 左对齐锚在工具条左侧，列更窄时由宿主 `min(列宽, 该值)` 兜底。
 */
const SYSTEM_PANEL_WIDTH = 560;
const TOOLS_PANEL_WIDTH = 560;

/**
 * 工具条高度（36 图标高 + 顶部安全区）。工具条是**覆盖层**（见下），不占文档流，
 * 消息区靠这份高度做顶部内边距，消息才会滚到毛玻璃条下面（MessageList 的 topInset）。
 * 单一来源：工具条自身高度与 MessageList 内边距都引用它。
 */
const CHAT_TOOLBAR_HEIGHT = 'calc(44px + env(safe-area-inset-top))';

/** 中栏工具条最左侧的侧栏开关（按设计规范 `AppShell`：36×36 图标按钮） */
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
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* 原型 #i-panel */}
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M9.5 4v16" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M9.5 4v16" />
        </svg>
      )}
    </button>
  );
}

/**
 * ChatPane（F1→F5）：对话主面板。URL `?s=` 是会话的唯一真相（ADR-0019-5）。
 * 工具条按设计规范 `AppShell` 的桌面向：
 * 侧栏开关 → 信任警示 → 「对话」页签 / 分支 → 「系统 / 工具」芯片 → 文件面板开关；
 * 顶部面板为 `position:fixed` 贴顶下拉（T1-3），一次只开一个。
 */
export interface ChatPaneProps {
  /** 侧栏已选中项目（无会话且未请求新会话时的占位形态由它决定） */
  projectSelected?: boolean;
  preferredCwd?: string | null;
  /** 侧栏开关（页头左侧按钮，结构按设计规范 AppShell 的中栏工具条） */
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** 项目需要信任但未信任：在工具条上给一个常驻入口 */
  trustPending?: boolean;
  onTrustProject?: () => void;
  /** 右栏（文件面板）开合：工具条最右的 36×36 开关按钮（T1-1） */
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
  /** 右栏全宽展开时收起顶部面板（设计规范 `rightPanelFullWidth` 效果，T0-4） */
  rightPanelFullWidth?: boolean;
  /** 打开/新建的会话的 cwd 上抬给侧栏（侧栏据此定位项目，见 SidebarPaneProps.activeSessionCwd） */
  onSessionCwdChange?(cwd: string | null): void;
}

/**
 * 工具预设候选（T2-6）：与设计规范一致——标签就是预设 id，含义由面板右侧的描述行承担
 * （`chat.chatOnly` / `chat.readOnlyTools` / …，见 ToolPresetMenu）。值域单一来源是 protocol 的
 * `TOOL_PRESETS`，不再手写第二份中文标签。
 */
const TOOL_PRESET_OPTIONS = TOOL_PRESETS.map((value) => ({ value, label: value }));

/**
 * 视图页签（照 `docs/design/piboat-web-v3.html` 的 `.view-tabs` / `.vtab`）：
 * 13px 文案，`--accent` 字体 + 2px 底部 accent 下划线。
 * 目前只有「对话」一个视图：它常驻 `.on`，其余会话级入口走右侧的 `HeaderChip`。
 */
function ViewTab({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        padding: '0 2px',
        background: 'none',
        border: 'none',
        color: 'var(--accent)',
        cursor: 'pointer',
        flexShrink: 0,
        fontSize: 13,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        transition: 'color 0.12s',
      }}
    >
      {label}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          borderRadius: 2,
          background: 'var(--accent)',
        }}
      />
    </button>
  );
}

/**
 * 头部芯片按钮（照 `docs/design/piboat-web-v3.html` 的 `.hchip`）：
 * 26px 高、8px 圆角，图标 + 文案；hover 填充、选中 `--accent-weak` 底 + `--accent` 文字。
 * 承载「系统 / 工具」这两个弹出面板入口。
 */
function HeaderChip({
  label,
  title,
  icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  title: string;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 26,
        padding: '0 10px',
        background: active ? 'var(--accent-weak)' : 'none',
        border: 'none',
        borderRadius: 8,
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={(event) => {
        if (disabled || active) return;
        event.currentTarget.style.background = 'var(--bg-hover)';
        event.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(event) => {
        if (disabled || active) return;
        event.currentTarget.style.background = 'none';
        event.currentTarget.style.color = 'var(--text-muted)';
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** 工具条页签图标：14px 线性，颜色随页签 currentColor（原型 .ico.s14：stroke 1.8） */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
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
  onSessionCwdChange,
}: ChatPaneProps) {
  const session = useAgentSession();
  const { chat, sessionId } = session;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState<string[] | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  // 自动命名（触发时机见下方 effect）：每会话最多一次 + 流式边沿检测（按会话绑定，
  // 避免「A 流式中切到 B」被误判成 B 的结束沿，白白烧一次 token）
  const autoNamedRef = useRef(new Set<string>());
  const prevStreamRef = useRef<{ id: string | null; streaming: boolean }>({
    id: null,
    streaming: false,
  });
  /** 图片附件（T2-2）：按钮 / 粘贴 / 拖拽三个入口共用 */
  const attachments = useAttachedImages();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  /**
   * 内容区宽度把手（设计规范 §8.4）：偏好来自对话外观（与设置页同一份），
   * 实际宽再按当前列宽夹取（给两侧把手留位）。
   */
  const chatAppearance = useChatAppearance();
  const chatContentRef = useRef<HTMLDivElement>(null);
  const [chatColumnWidth, setChatColumnWidth] = useState(0);
  const resolvedContentWidth = resolveChatContentWidth(chatAppearance.width, chatColumnWidth);
  // 列宽随侧栏/右栏拖拽变化；依赖 sessionId 让会话/空态切换时重新观察新节点
  // biome-ignore lint/correctness/useExhaustiveDependencies: 会话/空态分支切换要重挂观察器
  useLayoutEffect(() => {
    const el = chatContentRef.current;
    if (el === null) return;
    el.style.setProperty('--chat-content-max-width', `${resolvedContentWidth}px`);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setChatColumnWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setChatColumnWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [resolvedContentWidth, sessionId]);
  // 拖动中直接写 CSS 变量（不落盘、不触发 React 重渲染）；松手才持久化
  const handleContentWidthDrag = useCallback((width: number) => {
    const el = chatContentRef.current;
    if (el === null) return;
    el.style.setProperty(
      '--chat-content-max-width',
      `${resolveChatContentWidth(width, el.clientWidth)}px`,
    );
  }, []);
  const handleContentWidthCommit = useCallback(
    (width: number) => {
      const el = chatContentRef.current;
      const resolved = resolveChatContentWidth(width, el?.clientWidth ?? 0);
      if (el !== null) el.style.setProperty('--chat-content-max-width', `${resolved}px`);
      chatAppearance.setWidth(resolved);
    },
    [chatAppearance],
  );
  /**
   * 「本次会话切换由本组件发起」（建会话 / fork：会话先行、URL 后跟），供对账决策用。
   * 用户点侧栏是 URL 先行，绝不置此标记——否则对账会把 URL 反向覆盖回当前会话，
   * 两个会话无限互切（2026-09-26 实测）。
   */
  const selfSwitchRef = useRef(false);
  /** 设计规范 `topBarRef`：顶部面板 fixed 下拉的定位基准（T1-3） */
  const topBarRef = useRef<HTMLDivElement>(null);
  /** 指标行（输入卡下方）的 DOM 基准：会话信息面板从它向上弹出（⑥b） */
  const metricsRef = useRef<HTMLDivElement>(null);
  /** 工具条上「系统 / 工具」芯片组：顶部面板的左对齐锚（原型 `.pop` 贴 `.tools-bar` 左缘） */
  const toolsBarRef = useRef<HTMLDivElement>(null);
  /** 面板宿主（fixed 容器）：外点关闭时算「内侧」⑦b */
  const panelHostRef = useRef<HTMLDivElement>(null);
  const [topPanelPos, setTopPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
    /** 左对齐锚（芯片组左缘）；窄列时与列右缘一起夹取，见顶部面板渲染处 */
    anchorLeft: number;
  } | null>(null);
  const [metricsPanelPos, setMetricsPanelPos] = useState<{
    /** 指标行水平中点（面板 left 用这个值 + translateX(-50%) 居中，面板宽度不用先量） */
    center: number;
    bottom: number;
    maxHeight: number;
  } | null>(null);
  const urlSessionId = searchParams.get('s');

  const history = useInputHistory(sessionId);
  const signal = useCompletionSignal();
  const { t } = useI18n();
  const models = useModelsQuery(session.cwd ?? undefined);
  const gitStatus = useGitStatusQuery(session.cwd);
  const detail = useSessionDetailQuery(sessionId);

  // 侧栏文件树的「提及」：把 @相对路径 追加进草稿（设计规范 AppShell → ChatInput 同款链路）
  const insertMentionText = useCallback((text: string) => {
    setDraft((previous) => (previous.length === 0 ? text : `${previous} ${text}`));
  }, []);
  useMentionInsertion(insertMentionText);

  // 会话 cwd 上抬给侧栏：它要据此定位项目（侧栏不再持有全量会话列表，见 SidebarPaneProps）
  useEffect(() => {
    onSessionCwdChange?.(session.cwd);
  }, [session.cwd, onSessionCwdChange]);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);

  // 设计规范 `showChat`：选中会话、或已选目录准备开新会话 → 显示完整工具条与对话区
  // （`preferredCwd` 由 workspace-layout 按 `effectiveNewSessionCwd` 回退到项目根，BUG-2）
  const showChat = sessionId !== null || preferredCwd !== null;

  // URL ⇄ 会话对账（单一决策处，规则与理由见 session-nav.ts）：
  // URL 发起的（点击/前进后退）→ 以 URL 为准去切会话；本组件发起的（建会话/fork）→ 补写 URL。
  // 拆成两个 effect 会在同一提交里互相覆盖，导致两会话互切。
  useEffect(() => {
    const selfInitiated = selfSwitchRef.current;
    if (urlSessionId === session.sessionId) selfSwitchRef.current = false;
    const decision = decideSessionNav({
      urlSessionId,
      sessionId: session.sessionId,
      selfInitiated,
    });
    if (decision.kind === 'reset') session.reset();
    else if (decision.kind === 'writeUrl') {
      setSearchParams({ s: decision.sessionId }, { replace: true });
    } else if (decision.kind === 'open') {
      void session.open(decision.sessionId).then((error) => {
        if (error !== null) pushToast(`打开会话失败：${error}`, 'error');
      });
    }
  }, [urlSessionId, session.sessionId, session.open, session.reset, setSearchParams, pushToast]);

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

  // ④b 外部写入被探测到（服务端已从磁盘重建 runtime，ADR-0013）：本标签页的历史与事件水位线要重来一遍。
  // 不重开的话，客户端 fold / 水位线仍是旧 runtime 的：另一个进程写的那些条目永远不会进视图，
  // 半截消息与队列也会残留。ref 记住已处理的那份响应，避开 StrictMode 双跑与重复 open。
  const rebuiltRef = useRef<SessionDetailResponse | null>(null);
  useEffect(() => {
    const data = detail.data;
    if (data?.wrapperRebuilt !== true || rebuiltRef.current === data) return;
    rebuiltRef.current = data;
    if (sessionId !== null) void session.open(sessionId);
  }, [detail.data, sessionId, session.open]);

  // ⑤ 全局 Esc 停止（设计规范 `registerAbortHandler`：只在运行中接管 Esc）
  useEffect(() => {
    registerAbortHandler(chat.streaming ? () => void session.abort() : null);
    return () => {
      registerAbortHandler(null);
    };
  }, [chat.streaming, session]);

  // ⑥ 顶部面板定位：fixed 贴顶下拉，位置由 topPanelPos 测量（T1-3）；
  // 会话信息面板挂在**输入卡下方**的指标行上，所以它走 ⑥b 的向上弹出
  useEffect(() => {
    if (activePanel === null || activePanel === 'branches' || topBarRef.current === null) return;
    if (activePanel === 'session') return;
    const update = () => {
      const topBarRect = topBarRef.current?.getBoundingClientRect();
      if (topBarRect === undefined) return;
      const anchorLeft = toolsBarRef.current?.getBoundingClientRect().left ?? topBarRect.left;
      setTopPanelPos({
        top: topBarRect.bottom,
        left: topBarRect.left,
        width: topBarRect.width,
        anchorLeft,
      });
    };
    update();
    const ro = new ResizeObserver(update);
    if (topBarRef.current !== null) ro.observe(topBarRef.current);
    return () => ro.disconnect();
  }, [activePanel]);

  // ⑥b 指标行面板定位：fixed 在指标行正上方居中弹出（用户 2026-09-28；原型里它在
  // `.statusline` 之外，免得被裁掉）。居中用 left + translateX(-50%)：不去量面板宽度。
  useEffect(() => {
    if (activePanel !== 'session' || metricsRef.current === null) return;
    const update = () => {
      const rect = metricsRef.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      setMetricsPanelPos({
        center: rect.left + rect.width / 2,
        bottom: viewportHeight - rect.top + 8,
        maxHeight: Math.max(160, rect.top - 12),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(metricsRef.current);
    return () => ro.disconnect();
  }, [activePanel]);

  // ⑦ 右栏全宽展开时收起顶部面板（T0-4）
  useEffect(() => {
    if (rightPanelFullWidth) setActivePanel(null);
  }, [rightPanelFullWidth]);

  // ⑦b 面板外点按 / Esc 关闭（对齐 DSH useDismissOnOutsidePointer：触发器与面板本体算「内」，
  // 其余任意位置 pointerdown 即收）。顶栏整体豁免：面板切换按钮的点击走各自的
  // setActivePanel，不能被先收后开；Esc 同步收口。
  useEffect(() => {
    if (activePanel === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const insidePanel = panelHostRef.current?.contains(target) ?? false;
      const insideTrigger =
        (metricsRef.current?.contains(target) ?? false) ||
        (topBarRef.current?.contains(target) ?? false);
      if (!insidePanel && !insideTrigger) setActivePanel(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActivePanel(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activePanel]);

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
    // 设计规范的 `@` 浮层每行带文件/目录图标（ChatInput:2060 getFileIcon）
    icon: <FileIcon name={entry.path.split('/').pop() ?? entry.path} isDir={entry.isDir} />,
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

  /** 模型选择器候选（T2-1）：来自 /api/models 的可用清单 */
  const modelOptions = useMemo(
    () =>
      (models.data?.modelList ?? []).map((model) => ({
        provider: model.provider,
        modelId: model.id,
        name: model.name,
      })),
    [models.data],
  );

  /**
   * 记住的模型选择（用户 2026-09-30：选过模型后，下一次新会话自动沿用）：
   * 上次选中的模型，但必须在当前候选清单里（provider 可能已停用）才生效，
   * 否则忽略、回落服务端默认。空态回显与建会话都走这一份，保证「看到的 = 生效的」。
   */
  const lastUsedModel = useMemo<LastModel | null>(() => {
    const remembered = getLastModel();
    if (remembered === null) return null;
    return modelOptions.some(
      (option) => option.provider === remembered.provider && option.modelId === remembered.modelId,
    )
      ? remembered
      : null;
  }, [modelOptions]);

  const startSession = useCallback(
    async (cwd: string) => {
      // 登记「本组件发起」：start() 一提交 sessionId，对账就负责把 URL 补上；
      // 其间也不能把刚建的会话当「URL 空态」而 reset（否则空态首条消息会把会话拆掉）
      selfSwitchRef.current = true;
      // 记住的模型选择：空态没动过模型选择时补记为 pending（setModel 空态同步写 ref，
      // start() 随后把它带进 agent/new）；动过则 pendingModel 就是用户刚选的，不覆盖
      if (session.pendingModel === null && lastUsedModel !== null) {
        void session.setModel(lastUsedModel.provider, lastUsedModel.modelId);
      }
      const error = await session.start(cwd);
      if (error !== null) {
        selfSwitchRef.current = false;
        pushToast(error, 'error');
        return;
      }
      setLastCwd(cwd);
    },
    [session, pushToast, lastUsedModel],
  );

  const handleSubmit = useCallback(
    (text: string) => {
      const images = attachments.images.map(attachedImageToContent);
      history.remember(text);
      attachments.clear();
      // 空态直接发消息：先按当前项目开一条新会话，再把这句话发出去（设计规范：发送即建会话）
      if (sessionId === null) {
        const cwd = preferredCwd ?? getLastCwd();
        if (cwd === null) {
          pushToast('请先在侧栏选择项目目录', 'error');
          return;
        }
        void startSession(cwd).then(() => {
          void session.send(text, images).then((error) => {
            if (error !== null) pushToast(error, 'error');
          });
        });
        return;
      }
      void session.send(text, images).then((error) => {
        if (error === null) return;
        const command = parseSlashSubmission(text);
        pushToast(command === null ? error : `命令 /${command.name} 发送失败：${error}`, 'error');
      });
    },
    [session, sessionId, preferredCwd, startSession, pushToast, history, attachments],
  );

  /** 流式中的 Steer / Follow-Up（T2-3）：与输入卡内的两个按钮同源，都带图片并清空输入 */
  const queueStreamingMessage = useCallback(
    (behavior: 'steer' | 'followUp') => {
      const text = draft.trim();
      const images = attachments.images.map(attachedImageToContent);
      if (text.length === 0 && images.length === 0) return;
      setDraft('');
      attachments.clear();
      const send = behavior === 'steer' ? session.steer : session.followUp;
      void send(text, images).then((error) => {
        if (error !== null) pushToast(error, 'error');
      });
    },
    [draft, attachments, session, pushToast],
  );

  // 助手消息末尾的「本轮改动」chip（docs/10 C14）：脏文件直接进 diff 视图
  const openWrittenFile = useCallback(
    (path: string) => {
      const relative = shortPath(path, session.cwd);
      const status = gitStatus.data?.files.find((file) => file.path === relative);
      fileTabsStore.open(path, status !== undefined && status.kind !== 'untracked');
    },
    [session.cwd, gitStatus.data],
  );

  // 生效模型：活动会话看 liveState；空态用户 pending 选择优先，再回落记住的模型选择，
  // 最后才是服务端默认——core 建会话不传 model 时正是用 /api/models 的 defaultModel，
  // 这里必须同源展示（BUG：空态恒显示「选择模型」）。记住的那份与 startSession 补记的
  // pending 同源（都是 lastUsedModel），保证「看到的 = 新会话生效的」
  const effectiveModel =
    sessionId !== null
      ? (session.liveState?.model ?? null)
      : (session.pendingModel ?? lastUsedModel ?? models.data?.defaultModel ?? null);
  // 思考档位候选：按生效模型取（服务端给的是 `provider:id` 键）——空态也须有候选（BUG：此前只看 liveState）
  const modelKey =
    effectiveModel === null ? null : `${effectiveModel.provider}:${effectiveModel.modelId}`;
  const thinkingLevels = modelKey === null ? [] : (models.data?.thinkingLevels[modelKey] ?? []);
  // 思考档位回显：会话看 liveState；空态先用户 pending，再回落服务端按**该模型**算出的生效档位
  // （pin → 按模型设置 → 全局默认 → medium，已按模型能力 clamp，与建会话同源）——
  // 不再只在「展示的就是默认模型」时才回显，否则切到别的模型档位会空着
  const thinkingLevel =
    sessionId !== null
      ? (session.liveState?.thinkingLevel ?? session.pendingThinkingLevel)
      : (session.pendingThinkingLevel ??
        (modelKey === null ? undefined : models.data?.thinkingLevelDefaults[modelKey]) ??
        null);
  /**
   * 工具预设回显：按**当前生效工具集**反查（`presetForToolNames` 的勾选口径），
   * 而不是「上次点了哪一项」。没匹配上（settings 被改过 / 扩展塞进了工具）则四项
   * 都不勾、按钮只剩图标——设计如此，不是 bug。
   * ⚠️ 不能拿 `tools.length > 0` 当门槛：chat-only 的 get_tools 本身就是空表。
   * 空态：用户已选 pending 预设则回显；否则回 `default`——core 建会话不传
   * toolNames 时走 pi settings.json 默认工具集，即 `default` 预设的口径。
   */
  const toolPreset =
    sessionId !== null
      ? presetForToolNames(session.tools.filter((tool) => tool.active).map((tool) => tool.name))
      : (session.pendingToolPreset ?? 'default');
  /**
   * 用户点过的预设（按会话记住）：反查不中（扩展塞进工具 → 自定义）时预设按钮文字保持
   * 用户的选择，不再闪「自定义」；下拉勾选仍按 toolPreset 反查（用户 2026-09-30 定案）。
   * 存生效会话 id 一起校验，切会话自动失效，按钮文字不带泄漏到下一个会话。
   */
  const [pickedPresetState, setPickedPresetState] = useState<{
    sessionId: string | null;
    value: string | null;
  }>({ sessionId, value: null });
  const pickedPreset = pickedPresetState.sessionId === sessionId ? pickedPresetState.value : null;

  /** 拖拽图片到窗口任意处即可附加（T2-2）：depth 计数避开子元素 dragleave 抖动 */
  const dragDepthRef = useRef(0);
  const dragHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setDragOver(true);
    },
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    },
    onDragLeave: () => {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragOver(false);
    },
    onDrop: (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragOver(false);
      attachments.addFiles(Array.from(event.dataTransfer.files));
    },
  };
  const dragOverlay = dragOver ? <DropOverlay /> : null;

  // —— 工具条数据（设计规范的 sessionStats / contextUsage / sessionHasBranches） ——
  // 统计口径 = **会话文件聚合**（详情里的 stats，`computeStats` 与 SDK 逐条对齐、含全部历史），
  // 不是 `session.stats`：后者是 SDK 内存里那份条目表的聚合，只包含本进程 resume 时读到的
  // 那一段 + 它自己写的（同一文件被别的进程写时永远追不上，见 ADR-0013 / 2026-09-28 实测：
  // 文件 566 条 vs 内存 261 条）。live 那份只当兜底（详情还没到时）。
  const sessionStats = detail.data?.stats ?? session.stats;
  const contextUsage = session.liveState?.contextUsage ?? null;
  const hasBranches = useMemo(
    () => hasSessionBranches(detail.data?.tree ?? []),
    [detail.data?.tree],
  );

  // 指标行（原型 §8：从顶栏搬到输入卡下方）的读数与悬停提示
  const tokens = sessionStats?.tokens;
  const cost = sessionStats?.cost ?? 0;
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
  const showMetrics = showChat && (sessionStats !== null || contextUsage !== null);

  // 指标行不渲染（空态 / 无统计）时，会话信息面板失去锚点（它的 ⑥b 定位基准就是指标行）：
  // 直接收起，否则它会悬在指标行消失前的老位置上（面板入口随之消失，用户关不掉）
  useEffect(() => {
    if (!showMetrics && activePanel === 'session') setActivePanel(null);
  }, [showMetrics, activePanel]);

  // 首轮回复结束（流式 true→false 沿）→ 自动生成会话标题：
  // 仅未命名会话、每会话最多一次；失败静默（标题维持默认，不打断对话）。
  // 落盘归服务端（resident 走命令通道 / 冷会话 rename），前端只发请求不写文件。
  useEffect(() => {
    const prev = prevStreamRef.current;
    prevStreamRef.current = { id: sessionId, streaming: chat.streaming };
    const settledEdge = prev.id === sessionId && prev.streaming && !chat.streaming;
    if (sessionId === null || !settledEdge) return;
    if (autoNamedRef.current.has(sessionId)) return;
    if ((detail.data?.info.name ?? '').trim() !== '') return;
    const hasMessages =
      (sessionStats?.userMessages ?? 0) > 0 || (session.liveState?.messageCount ?? 0) > 0;
    if (!hasMessages) return;
    autoNamedRef.current.add(sessionId);
    void session.autoName().then((result) => {
      if (result.error !== undefined) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    });
  }, [chat.streaming, sessionId, detail.data, session, sessionStats, queryClient]);

  const compacting = session.liveState?.isCompacting === true;

  /**
   * 输入区（空态与活动会话共用）：隐藏文件输入 + 排队条 + Composer + 指标行。
   * 控件条在输入卡**内**（`cardFoot`，原型 `.card-foot` 的左簇：附件 + 模型+等级 + 预设 + 压缩 + 提示音），
   * 指标行在输入卡**下方**（`belowInput`，原型 `.statusline`）。
   */
  const composerElement = (
    <div className="shrink-0">
      {/* 隐藏文件输入（附件按钮与拖拽共用，T2-2） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          attachments.addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      {sessionId !== null && (
        <QueueBar
          steering={chat.queued.steering}
          followUp={chat.queued.followUp}
          onClear={() => void session.clearQueue()}
        />
      )}
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        streaming={chat.streaming}
        disabled={chat.terminated}
        mentions={mentionItems}
        onPickMention={pickMention}
        slashCommands={slashItems}
        onPickSlashCommand={pickSlash}
        mentionActiveIndex={activeIndex}
        onMentionActiveIndexChange={setActiveIndex}
        onCaretChange={setCaret}
        historyItems={history.history}
        onPickHistory={setDraft}
        attachedImages={attachments.images}
        onRemoveImage={attachments.remove}
        onPasteImages={attachments.addFiles}
        onSteer={chat.streaming ? () => queueStreamingMessage('steer') : undefined}
        onFollowUp={chat.streaming ? () => queueStreamingMessage('followUp') : undefined}
        onAbort={chat.streaming ? () => void session.abort() : undefined}
        cardFoot={
          <ComposerToolbar
            attachedCount={attachments.images.length}
            onAttachClick={() => fileInputRef.current?.click()}
            modelOptions={modelOptions}
            model={effectiveModel}
            onModelChange={(provider, modelId) => {
              // 记住这次选择：下一次新会话（含别的项目）自动沿用（用户 2026-09-30）
              setLastModel({ provider, modelId });
              // 空态切模型：新模型没有当前档位就清掉 pending——胶囊随即回落到该模型的生效档位，
              // 与建会话时 pi 自己解析出的值一致（不清的话胶囊会显示一个该模型跑不出来的档位）
              const nextLevels = models.data?.thinkingLevels[`${provider}:${modelId}`] ?? [];
              const pendingLevel = session.pendingThinkingLevel;
              if (
                sessionId === null &&
                pendingLevel !== null &&
                nextLevels.length > 0 &&
                !nextLevels.includes(pendingLevel)
              ) {
                session.clearPendingThinkingLevel();
              }
              void session.setModel(provider, modelId).then((error) => {
                if (error !== null) pushToast(error, 'error');
              });
            }}
            busy={chat.streaming}
            thinkingLevel={thinkingLevel}
            thinkingLevels={thinkingLevels}
            onThinkingLevelChange={(level) =>
              void session.setThinkingLevel(level as never).then((error) => {
                if (error !== null) pushToast(error, 'error');
              })
            }
            toolPreset={toolPreset}
            toolPresets={[...TOOL_PRESET_OPTIONS]}
            pickedPreset={pickedPreset}
            onToolPresetChange={(preset) => {
              // 乐观记录：命令成功与否都按用户的选择显示（失败有 toast）；
              // 下拉勾选不受影响（仍按反查结果）
              setPickedPresetState({ sessionId, value: preset });
              void session.setTools(preset as never).then((error) => {
                if (error !== null) pushToast(error, 'error');
              });
            }}
            compacting={compacting}
            showCompact={sessionId !== null}
            onCompact={() =>
              void session.compact().then((error) => {
                if (error !== null) pushToast(error, 'error');
                else pushToast('已请求压缩上下文');
              })
            }
            onAbortCompaction={() => void session.abortCompaction()}
            soundEnabled={signal.soundEnabled}
            onToggleSound={signal.toggleSound}
          />
        }
        belowInput={
          // 指标行既是读数也是会话信息浮层的开关（点击上弹，T1-3 / ⑥b）
          showMetrics ? (
            <div ref={metricsRef}>
              <ComposerMetrics
                tokens={tokens ?? null}
                contextUsage={contextUsage}
                tooltip={statsTooltip}
                open={activePanel === 'session'}
                onToggle={() => {
                  const next = activePanel === 'session' ? null : 'session';
                  setActivePanel(next);
                  if (next === 'session') {
                    // 打开弹窗要当下最新：详情走文件口径（顺带 force 探测外部写入），
                    // live 那份只用来兜底 / 拿 contextUsage
                    void detail.refetch();
                    void session.refreshStats();
                  }
                }}
              />
            </div>
          ) : undefined
        }
      />
    </div>
  );

  // 顶部面板宽度（原型 `.pop` 560px）与左缘：左对齐到「系统 / 工具」芯片组，
  // 避免贴住左侧栏（用户 2026）；窄列时用 `Math.min/max` 夹在会话列内。
  const topPanelWidth =
    topPanelPos === null
      ? 0
      : Math.min(
          topPanelPos.width,
          activePanel === 'tools' ? TOOLS_PANEL_WIDTH : SYSTEM_PANEL_WIDTH,
        );
  const topPanelLeft =
    topPanelPos === null
      ? 0
      : Math.min(
          Math.max(topPanelPos.anchorLeft, topPanelPos.left),
          topPanelPos.left + topPanelPos.width - topPanelWidth,
        );

  const toolbar = (
    // 工具条：iOS 毛玻璃。必须是**覆盖层**（absolute）——只有消息区滚到它下方，
    // backdrop-filter 才有东西可模糊（用户 2026 反馈「看着没变化」：留在文档流里背板只有
    // 中栏实色 --bg，模糊白色仍是白色）。高度由 CHAT_TOOLBAR_HEIGHT 单一来源给出，
    // 消息区用同一值做 topInset 让位。
    <div
      ref={topBarRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
      }}
    >
      {/* 毛玻璃背板**单独一层**：backdrop-filter 会给 fixed 后代当包含块，而顶部面板宿主
          就渲染在本子树里（否则 fixed 面板会被再叠一次工具条偏移，2026-09-29 实测 left 翻倍）。
          背板当兄弟层后，宿主仍以视口为基准。 */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'var(--glass-pane)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          backdropFilter: 'blur(30px) saturate(180%)',
          boxShadow:
            'inset 0 1px 0 var(--glass-pop-rim), inset 0 0 0 0.5px color-mix(in srgb, var(--glass-pop-rim) 45%, transparent)',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          // 原型 .conv-header：0.5px 发丝线（--l3 档），这里用 --border
          borderBottom: '0.5px solid var(--border)',
          height: CHAT_TOOLBAR_HEIGHT,
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {onToggleSidebar !== undefined && (
          <SidebarToggleButton open={sidebarOpen} onToggle={onToggleSidebar} />
        )}
        {/* 项目信任警示（按设计规范 `renderProjectTrustWarning` 桌面分支） */}
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
              color: 'var(--amber)',
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
        {/* 工具条页签（照 docs/design/piboat-web-v3.html 的 `.tab-row`）：
            「对话」是 `.vtab` 视图页签；系统 / 工具是右侧的 `.hchip` 芯片入口。
            空态下系统 / 工具 disabled（T1-2）。 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            height: '100%',
            // 原型 .tab-row：与前一个控件间也是 20px 间距
            marginLeft: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 24, height: '100%' }}>
            <ViewTab label={t('view.chat')} onClick={() => setActivePanel(null)} />
          </div>
          <div ref={toolsBarRef} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <HeaderChip
              label={t('system.label')}
              title={t('system.prompt')}
              active={activePanel === 'system'}
              disabled={!showChat}
              onClick={() => {
                const next = activePanel === 'system' ? null : 'system';
                setActivePanel(next);
                if (next === 'system') void session.refreshLiveState();
              }}
              icon={
                <TabIcon>
                  {/* 原型 #i-book */}
                  <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
                  <path d="M4 19a2 2 0 0 1 2-2h13" />
                </TabIcon>
              }
            />
            <HeaderChip
              label={t('tools.label')}
              title={t('tools.title')}
              active={activePanel === 'tools'}
              disabled={!showChat}
              onClick={() => {
                const next = activePanel === 'tools' ? null : 'tools';
                setActivePanel(next);
                if (next === 'tools') void session.loadTools();
              }}
              icon={
                <TabIcon>
                  {/* 原型 #i-wrench */}
                  <path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 0 0 5.6-6L14.5 12 12 9.5l2.7-3.2Z" />
                </TabIcon>
              }
            />
          </div>
          {/* 分支：仅在会话存在分支时渲染（T1-7/T3-15，设计规范 `BranchNavigator inline`） */}
          {showChat && hasBranches && (
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
        </div>
        {/* 文件面板开合（T1-1，按设计规范 `renderMainFileToggle`） */}
        {onToggleRightPanel !== undefined && (
          <button
            type="button"
            onClick={onToggleRightPanel}
            aria-controls="file-panel"
            aria-expanded={rightPanelOpen}
            title={rightPanelOpen ? t('files.hidePanel') : t('files.showPanel')}
            aria-label={rightPanelOpen ? t('files.hidePanel') : t('files.showPanel')}
            style={{
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: TOP_BAR_ICON_BUTTON_SIZE,
              height: TOP_BAR_ICON_BUTTON_SIZE,
              padding: 0,
              background: rightPanelOpen
                ? 'color-mix(in srgb, var(--text) 10%, transparent)'
                : 'none',
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
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {/* 原型 #i-panel 的镜像（右侧面板） */}
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M14.5 4v16" />
            </svg>
          </button>
        )}
        {/* 顶部面板：fixed 贴顶下拉（T1-3，一次只开一个）；会话信息面板例外——
            它的入口在输入卡下方的指标行，所以从指标行**向上**弹出（⑥b）。面板（系统提示词 /
            工具定义）都是自带滚动与圆角投影的玻璃卡，故宿主**不能** overflow:auto——
            否则圆角外的投影会被裁（2026-09-28 用户报告）。宽度不占满会话列，
            系统 / 工具各按 `.pop` 的 560px 口径夹取（列更窄时用列宽）。 */}
        {activePanel !== null &&
          activePanel !== 'branches' &&
          (activePanel === 'session' ? metricsPanelPos !== null : topPanelPos !== null) &&
          (() => {
            const anchored: CSSProperties =
              activePanel === 'session' && metricsPanelPos !== null
                ? ({
                    left: metricsPanelPos.center,
                    bottom: metricsPanelPos.bottom,
                    // 面板 left 落在指标行中点上，靠这一步居中（宽度不用先量）
                    transform: 'translateX(-50%)',
                    // 可用高度交给弹窗自己滚（它内部 max-height: var(--popover-max-height)）——
                    // 宿主一旦 overflow:auto，弹窗的投影会被裁到弹窗自己的矩形里（四周无影、圆角外冒方角）
                    '--popover-max-height': `${metricsPanelPos.maxHeight}px`,
                  } as CSSProperties)
                : ({
                    // 与工具条留 8px 间隙，卡片浮在下方；左缘对齐芯片组
                    top: topPanelPos?.top !== undefined ? topPanelPos.top + 8 : 0,
                    left: topPanelLeft,
                    width: topPanelWidth,
                    // 卡片可用高度 = 视口 − 面板顶 − 底部留白
                    '--panel-max-height': `calc(100dvh - ${(topPanelPos?.top ?? 0) + 8}px - 12px)`,
                  } as CSSProperties);
            return (
              <div
                ref={panelHostRef}
                style={{
                  position: 'fixed',
                  ...anchored,
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
                  stats={sessionStats}
                  contextUsage={contextUsage}
                  onClose={() => setActivePanel(null)}
                />
              </div>
            );
          })()}
      </div>
    </div>
  );

  if (sessionId === null) {
    return (
      <div className="chat-content relative flex min-h-0 flex-1 flex-col" {...dragHandlers}>
        {dragOverlay}
        {toolbar}
        {showChat ? (
          <EmptyState
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
    <div
      ref={chatContentRef}
      className="chat-content relative flex min-h-0 flex-1 flex-col"
      {...dragHandlers}
    >
      {dragOverlay}
      {toolbar}

      <div className="relative flex min-h-0 flex-1 flex-col">
        <MessageList
          chat={chat}
          hasOlder={session.hasOlder}
          loadingOlder={session.loadingOlder}
          onLoadOlder={() => void session.loadOlder()}
          onOpenWrittenFile={openWrittenFile}
          topInset={CHAT_TOOLBAR_HEIGHT}
        />
        <ContentWidthHandles
          width={resolvedContentWidth}
          onChange={handleContentWidthDrag}
          onCommit={handleContentWidthCommit}
          label={t('chat.resizeContentWidth')}
        />
      </div>

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
