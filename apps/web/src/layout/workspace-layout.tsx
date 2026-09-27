import {
  getDefaultRightPanelWidth,
  getFileName,
  getRightPanelMaxWidth,
  getSidebarMaxWidth,
  RIGHT_PANEL_FALLBACK_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  type ThemePreference,
} from '@ice-ai/client';
import { useProjectTrustQuery, useUpdateProjectTrustMutation } from '@ice-ai/client/react';
import {
  cn,
  ProjectTrustDialog,
  SettingsSectionIcon,
  ToastHost,
  type ToastItem,
  toastQueueReducer,
  useI18n,
} from '@ice-ai/ui';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChatPane } from '../panes/chat-pane';
import { FilesPane } from '../panes/files-pane';
import { SettingsHost } from '../panes/settings-host';
import { SidebarPane } from '../panes/sidebar-pane';
import { setLastSettingsSection } from '../services/settings-navigation';
import { useTheme } from '../services/theme';
import { useFileTabs } from '../services/use-file-tabs';
import { useGlobalKeyboardShortcuts } from '../services/use-keyboard-shortcuts';
import { useResizablePanel } from '../services/use-resizable-panel';
import workspace from './workspace.module.css';

/** 侧栏宽度持久化 key */
const SIDEBAR_WIDTH_STORAGE_KEY = 'piboat:sidebar-width';
/**
 * 一次性迁移（2026-09-27）：默认宽度 260 → 340。
 * 存着旧默认值（260）的缓存不是用户拖出来的选择，直接丢弃以落到新默认；
 * 用户真改过的其他宽度保留。
 */
if (typeof window !== 'undefined') {
  try {
    if (window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) === '260') {
      window.localStorage.removeItem(SIDEBAR_WIDTH_STORAGE_KEY);
    }
  } catch {
    // 存储不可用是尽力而为
  }
}

/**
 * 三栏工作区：左栏会话/项目、中栏对话、右栏文件。
 * **结构按设计规范 `AppShell`**（ADR-0020）：
 * 根容器（视口高度 + safe-area 内边距）→ `workspace.sidebarBackdrop` → `workspace.sidebar`
 * → `panel-resize-handle` → 中栏 → `workspace.rightPanelBackdrop`
 * → `panel-resize-handle workspace.rightPanelResizeHandle` → `workspace.rightPanel`。
 * 布局类在 `workspace.module.css`（web 自有）；`panel-resize-handle` 是 ui 的全局原语。
 * 宽度走 CSS 变量 `--sidebar-width` / `--right-panel-width`（由拖拽写入，见 use-resizable-panel）。
 * URL `?s=` 是当前会话的唯一真相——侧栏与对话面板都只改它（ADR-0019-5）。
 */
export function WorkspaceLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSessionId = searchParams.get('s');
  const [preferredCwd, setPreferredCwd] = useState<string | null>(null);
  /**
   * 活动会话的 cwd（中栏上抬）：侧栏据此定位项目。会话列表按项目取数之后，
   * 侧栏不再持有全量列表，无法自己反推「`?s=` 那个会话属于哪个项目」。
   */
  const [activeSessionCwd, setActiveSessionCwd] = useState<string | null>(null);
  /** 当前项目根：文件树/查看器的相对路径基准（由侧栏回传，见下方 onProjectRootChange） */
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  /**
   * 文件树解析出的真实根（符号链接路径下与传入 root 不同）：右栏 explorer 上抛，
   * 全局替代 projectRoot 使用（与旧侧栏内合成等价）；切换项目时重置。
   */
  const [resolvedRoot, setResolvedRoot] = useState<string | null>(null);
  const effectiveProjectRoot = resolvedRoot ?? projectRoot;
  /** 项目根回传 + 真实根缓存复位（切项目时旧 resolvedRoot 不再有效） */
  const handleProjectRootChange = useCallback((root: string | null) => {
    setResolvedRoot(null);
    setProjectRoot(root);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trustDialogOpen, setTrustDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 右栏开合：与设计规范一致——有打开的页签才展开，关闭时宽度动画到 0（容器仍挂载）
  const { tab: activeFileTab } = useFileTabs();
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const rightPanelFullWidth = rightPanelOpen && rightPanelExpanded;
  useEffect(() => {
    if (activeFileTab !== null) setRightPanelOpen(true);
  }, [activeFileTab]);
  // 关闭右栏时复位展开态（按设计规范，T0-4）
  useEffect(() => {
    if (!rightPanelOpen) setRightPanelExpanded(false);
  }, [rightPanelOpen]);
  // 订阅主题（auto 跟随系统时改配色能即时生效）；切换入口在侧栏品牌行的循环按钮
  const { preference: themePreference, setPreference } = useTheme();
  const cycleTheme = useCallback(() => {
    const cycle: ThemePreference[] = ['light', 'dark', 'auto'];
    const next = cycle[(cycle.indexOf(themePreference) + 1) % cycle.length] ?? 'auto';
    setPreference(next);
  }, [themePreference, setPreference]);
  const { t } = useI18n();
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);
  // 项目信任：需要信任但未信任时给出一个常驻提示（项目级资源未加载）
  const trust = useProjectTrustQuery(effectiveProjectRoot);
  const updateTrust = useUpdateProjectTrustMutation(effectiveProjectRoot);
  const trustPending = trust.data?.requiresTrust === true && trust.data.trusted === false;

  // —— 面板宽度（设计规范 `useResizablePanel` 的两处调用：侧栏向右生长、右栏向左生长） ——
  const sidebarWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const rightPanelWidthRef = useRef(RIGHT_PANEL_FALLBACK_WIDTH);
  const getResponsiveRightPanelWidth = useCallback(
    () =>
      typeof window === 'undefined'
        ? RIGHT_PANEL_FALLBACK_WIDTH
        : getDefaultRightPanelWidth(window.innerWidth),
    [],
  );
  const getResponsiveSidebarMaxWidth = useCallback(
    () =>
      typeof window === 'undefined'
        ? SIDEBAR_MAX_WIDTH
        : getSidebarMaxWidth({
            viewportWidth: window.innerWidth,
            rightPanelOpen,
            rightPanelWidth: rightPanelWidthRef.current,
          }),
    [rightPanelOpen],
  );
  const getResponsiveRightPanelMaxWidth = useCallback(
    () =>
      typeof window === 'undefined'
        ? RIGHT_PANEL_MAX_WIDTH
        : getRightPanelMaxWidth({
            viewportWidth: window.innerWidth,
            sidebarOpen,
            sidebarWidth: sidebarWidthRef.current,
          }),
    [sidebarOpen],
  );
  const sidebarResizer = useResizablePanel({
    ariaLabel: '调整侧栏宽度',
    cssVariable: '--sidebar-width',
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    getMaxWidth: getResponsiveSidebarMaxWidth,
    growthDirection: 'right',
    maxWidth: SIDEBAR_MAX_WIDTH,
    minWidth: SIDEBAR_MIN_WIDTH,
    storageKey: SIDEBAR_WIDTH_STORAGE_KEY,
    widthRef: sidebarWidthRef,
  });
  const rightPanelResizer = useResizablePanel({
    ariaLabel: '调整文件面板宽度',
    cssVariable: '--right-panel-width',
    defaultWidth: RIGHT_PANEL_FALLBACK_WIDTH,
    getDefaultWidth: getResponsiveRightPanelWidth,
    getMaxWidth: getResponsiveRightPanelMaxWidth,
    growthDirection: 'left',
    maxWidth: RIGHT_PANEL_MAX_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    storageKey: 'piboat:right-panel-width',
    widthRef: rightPanelWidthRef,
  });
  const { reclampWidth: reclampSidebarWidth } = sidebarResizer;
  const { reclampWidth: reclampRightPanelWidth } = rightPanelResizer;
  useEffect(() => {
    if (!rightPanelOpen) return;
    reclampSidebarWidth();
    reclampRightPanelWidth();
  }, [reclampRightPanelWidth, reclampSidebarWidth, rightPanelOpen]);

  useGlobalKeyboardShortcuts({
    onNewSession: (cwd) => {
      setPreferredCwd(cwd);
      setSearchParams({});
    },
    activeCwd: effectiveProjectRoot,
  });

  const sidebarContent = (
    <>
      <SidebarPane
        activeSessionId={activeSessionId}
        activeSessionCwd={activeSessionCwd}
        themePreference={themePreference}
        onCycleTheme={cycleTheme}
        onProjectRootChange={handleProjectRootChange}
        onSelectSession={(id) => setSearchParams({ s: id })}
        onNewSession={(cwd) => {
          setPreferredCwd(cwd);
          setSearchParams({});
        }}
      />
      {/* 侧栏底栏：设置（通宽居中，原型 `.sb-foot`：顶部发丝线 + 向上渐变） */}
      <div
        style={{
          padding: '8px',
          flexShrink: 0,
          display: 'flex',
          borderTop: '1px solid var(--border)',
          background: 'linear-gradient(to top, var(--glass-2), transparent)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setLastSettingsSection('general');
            setSettingsOpen(true);
          }}
          title={t('common.settings')}
          aria-label={t('common.settings')}
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 30,
            padding: '0 8px',
            background: 'none',
            border: 'none',
            borderRadius: 9,
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontSize: 12,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'var(--bg-hover)';
            event.currentTarget.style.color = 'var(--text)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'none';
            event.currentTarget.style.color = 'var(--text-2)';
          }}
        >
          <SettingsSectionIcon section="general" size={14} strokeWidth={2} />
          <span>{t('common.settings')}</span>
        </button>
      </div>
    </>
  );

  // 窗口标题（设计规范 `AppShell` 的 windowTitle）：`<项目目录名> - PiBoat`，无项目时为 `PiBoat`
  useEffect(() => {
    const activeCwdName =
      effectiveProjectRoot === null
        ? null
        : getFileName(effectiveProjectRoot) || effectiveProjectRoot;
    const windowTitle = activeCwdName === null ? 'PiBoat' : `${activeCwdName} - PiBoat`;
    const syncWindowTitle = () => {
      if (document.title !== windowTitle) document.title = windowTitle;
    };
    syncWindowTitle();
    const observer = new MutationObserver(syncWindowTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [effectiveProjectRoot]);

  // 设计规范 `effectiveNewSessionCwd`（AppShell）：未选会话但有激活项目 → 回退到项目根，
  // 否则「有项目无会话」时中栏会退化成占位文案（2026-09-26 BUG-2）。
  const effectiveNewSessionCwd =
    preferredCwd ?? (activeSessionId === null ? effectiveProjectRoot : null);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: 'var(--app-viewport-height, 100dvh)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        overflow: 'hidden',
        background: 'var(--app-bg)',
      }}
    >
      {/* 移动端遮罩（设计规范同款；宽屏下 CSS 已 display:none，桌面语义下保留结构）
          biome-ignore lint/a11y/noStaticElementInteractions: 按设计规范的遮罩层（纯鼠标交互的装饰元素）
          biome-ignore lint/a11y/useKeyWithClickEvents: 同上——键盘用户由 Esc / 侧栏开关按钮提供等价操作 */}
      <div
        className={workspace.sidebarBackdrop}
        onClick={() => setSidebarOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 199,
          background: 'rgba(0,0,0,0.4)',
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* 左栏 */}
      <div
        ref={sidebarResizer.panelRef}
        id="session-sidebar"
        inert={rightPanelExpanded}
        className={cn(
          workspace.sidebar,
          sidebarOpen ? workspace.isOpen : workspace.isClosed,
          sidebarResizer.isResizing && workspace.isResizing,
        )}
        style={
          {
            '--sidebar-width': `${sidebarResizer.width}px`,
            background: 'var(--glass-pane)',
            WebkitBackdropFilter: 'blur(30px) saturate(150%)',
            backdropFilter: 'blur(30px) saturate(150%)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            zIndex: 200,
          } as React.CSSProperties
        }
      >
        {sidebarContent}
      </div>
      {sidebarOpen && (
        <div
          {...sidebarResizer.separatorProps}
          inert={rightPanelExpanded}
          aria-controls="session-sidebar"
          className={cn('panel-resize-handle', sidebarResizer.isResizing && 'is-resizing')}
          data-resize-handle="sidebar"
          title="调整侧栏宽度：拖拽或方向键（双击复位）"
        />
      )}

      {/* 中栏：对话 */}
      <div
        inert={rightPanelExpanded}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
        <ChatPane
          preferredCwd={effectiveNewSessionCwd}
          projectSelected={effectiveProjectRoot !== null}
          onSessionCwdChange={setActiveSessionCwd}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((previous) => !previous)}
          trustPending={trustPending}
          onTrustProject={() => setTrustDialogOpen(true)}
          rightPanelOpen={rightPanelOpen}
          onToggleRightPanel={() => setRightPanelOpen((previous) => !previous)}
          rightPanelFullWidth={rightPanelFullWidth}
        />
      </div>

      <div
        aria-hidden="true"
        className={cn(workspace.rightPanelBackdrop, rightPanelOpen && workspace.isOpen)}
        onClick={() => setRightPanelOpen(false)}
      />
      {rightPanelOpen && (
        <div
          {...rightPanelResizer.separatorProps}
          inert={rightPanelExpanded}
          aria-controls="file-panel"
          className={cn(
            'panel-resize-handle',
            workspace.rightPanelResizeHandle,
            rightPanelResizer.isResizing && 'is-resizing',
          )}
          data-resize-handle="right-panel"
          title="调整文件面板宽度：拖拽或方向键（双击复位）"
        />
      )}

      {/* 右栏：文件查看器——始终挂载，宽度由 CSS 动画（设计规范同款） */}
      <div
        ref={rightPanelResizer.panelRef}
        id="file-panel"
        className={cn(
          workspace.rightPanel,
          rightPanelOpen ? workspace.isOpen : workspace.isClosed,
          rightPanelFullWidth && workspace.isFullWidth,
          rightPanelResizer.isResizing && workspace.isResizing,
        )}
        style={
          {
            '--right-panel-width': `${rightPanelResizer.width}px`,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid var(--border)',
            background: 'var(--glass-pane)',
            WebkitBackdropFilter: 'blur(30px) saturate(150%)',
            backdropFilter: 'blur(30px) saturate(150%)',
          } as React.CSSProperties
        }
      >
        <FilesPane
          root={effectiveProjectRoot}
          sessionId={activeSessionId}
          open={rightPanelOpen}
          expanded={rightPanelExpanded}
          onToggleExpand={() => setRightPanelExpanded((previous) => !previous)}
          onHide={() => setRightPanelOpen(false)}
          onResolvedRoot={setResolvedRoot}
        />
      </div>

      {settingsOpen && (
        <SettingsHost
          projectRoot={effectiveProjectRoot}
          sessionId={activeSessionId}
          onClose={() => setSettingsOpen(false)}
          onNotice={(message, tone) => pushToast(message, tone ?? 'info')}
        />
      )}
      {trustDialogOpen && effectiveProjectRoot !== null && (
        <ProjectTrustDialog
          cwd={effectiveProjectRoot}
          busy={updateTrust.isPending}
          error={null}
          onCancel={() => setTrustDialogOpen(false)}
          onConfirm={() =>
            updateTrust.mutate(true, {
              onSuccess: () => {
                setTrustDialogOpen(false);
                pushToast('已信任该项目，项目级资源已加载');
              },
              onError: (error) => pushToast(`信任失败：${error.message}`, 'error'),
            })
          }
        />
      )}
      <ToastHost items={toasts} />
    </div>
  );
}
