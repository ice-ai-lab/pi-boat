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
} from '@ice-ai/client';
import { useProjectTrustQuery, useUpdateProjectTrustMutation } from '@ice-ai/client/react';
import {
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

/**
 * 三栏工作区：左栏会话/项目、中栏对话、右栏文件。
 * **结构逐字照抄 pi-web `AppShell`**（ADR-0020）：
 * 根容器（视口高度 + safe-area 内边距）→ `sidebar-overlay-backdrop` → `sidebar-container`
 * → `panel-resize-handle sidebar-resize-handle` → 中栏 → `right-panel-overlay-backdrop`
 * → `panel-resize-handle right-panel-resize-handle` → `right-panel-container`。
 * 宽度走 CSS 变量 `--sidebar-width` / `--right-panel-width`（由拖拽写入，见 use-resizable-panel）。
 * URL `?s=` 是当前会话的唯一真相——侧栏与对话面板都只改它（ADR-0019-5）。
 */
export function WorkspaceLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSessionId = searchParams.get('s');
  const [preferredCwd, setPreferredCwd] = useState<string | null>(null);
  /** 当前项目根：文件树/查看器的相对路径基准（由侧栏回传，见下方 onProjectRootChange） */
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trustDialogOpen, setTrustDialogOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // 右栏开合：与 pi-web 一致——有打开的页签才展开，关闭时宽度动画到 0（容器仍挂载）
  const { tab: activeFileTab } = useFileTabs();
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);
  const rightPanelFullWidth = rightPanelOpen && rightPanelExpanded;
  useEffect(() => {
    if (activeFileTab !== null) setRightPanelOpen(true);
  }, [activeFileTab]);
  // 关闭右栏时复位展开态（照抄 pi-web `AppShell.tsx:184-186`，T0-4）
  useEffect(() => {
    if (!rightPanelOpen) setRightPanelExpanded(false);
  }, [rightPanelOpen]);
  // 订阅主题（pi-web 的 AppShell 也常驻订阅，保证 auto 跟随系统时改配色能即时生效）
  useTheme();
  const { t } = useI18n();
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);
  // 项目信任：需要信任但未信任时给出一个常驻提示（项目级资源未加载）
  const trust = useProjectTrustQuery(projectRoot);
  const updateTrust = useUpdateProjectTrustMutation(projectRoot);
  const trustPending = trust.data?.requiresTrust === true && trust.data.trusted === false;

  // —— 面板宽度（pi-web `useResizablePanel` 的两处调用：侧栏向右生长、右栏向左生长） ——
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
    storageKey: 'piboat:sidebar-width',
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
    activeCwd: projectRoot,
  });

  const sidebarContent = (
    <>
      <SidebarPane
        activeSessionId={activeSessionId}
        onProjectRootChange={setProjectRoot}
        onSelectSession={(id) => setSearchParams({ s: id })}
        onNewSession={(cwd) => {
          setPreferredCwd(cwd);
          setSearchParams({});
        }}
      />
      {/* 侧栏底栏：模型 / Skills / 设置（逐字照抄 pi-web AppShell 的 settings 行：内联样式 + 悬停处理） */}
      <div
        style={{
          padding: '8px',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        {(
          [
            ['models', t('common.models')],
            ['skills', t('common.skills')],
          ] as const
        ).map(([section, label]) => {
          const disabled = section !== 'models' && projectRoot === null;
          return (
            <button
              key={section}
              type="button"
              onClick={() => {
                setLastSettingsSection(section);
                setSettingsOpen(true);
              }}
              disabled={disabled}
              title={disabled ? t('settings.projectRequired') : label}
              aria-label={label}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                height: 32,
                padding: 0,
                background: 'none',
                border: 'none',
                borderRadius: 9,
                color: 'var(--text-muted)',
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 12,
                opacity: disabled ? 0.35 : 1,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={(event) => {
                if (!disabled) {
                  event.currentTarget.style.background = 'var(--bg-hover)';
                  event.currentTarget.style.color = 'var(--text)';
                }
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'none';
                event.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <SettingsSectionIcon section={section} size={14} strokeWidth={2} />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setLastSettingsSection('general');
            setSettingsOpen(true);
          }}
          title={t('common.settings')}
          aria-label={t('common.settings')}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            height: 32,
            padding: 0,
            background: 'none',
            border: 'none',
            borderRadius: 9,
            color: 'var(--text-muted)',
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
            event.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <SettingsSectionIcon section="general" size={14} strokeWidth={2} />
          <span>{t('common.settings')}</span>
        </button>
      </div>
    </>
  );

  // 窗口标题（pi-web `AppShell` 的 windowTitle）：`<项目目录名> - Pi Web`，无项目时为 `Pi Web`
  useEffect(() => {
    const activeCwdName = projectRoot === null ? null : getFileName(projectRoot) || projectRoot;
    const windowTitle = activeCwdName === null ? 'Pi Web' : `${activeCwdName} - Pi Web`;
    const syncWindowTitle = () => {
      if (document.title !== windowTitle) document.title = windowTitle;
    };
    syncWindowTitle();
    const observer = new MutationObserver(syncWindowTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [projectRoot]);

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: 'var(--app-viewport-height, 100dvh)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      {/* 移动端遮罩（pi-web 同款；宽屏下 CSS 已 display:none，桌面语义下保留结构）
          biome-ignore lint/a11y/noStaticElementInteractions: 逐字照抄 pi-web 的遮罩层（纯鼠标交互的装饰元素）
          biome-ignore lint/a11y/useKeyWithClickEvents: 同上——键盘用户由 Esc / 侧栏开关按钮提供等价操作 */}
      <div
        className="sidebar-overlay-backdrop"
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
        className={`sidebar-container${sidebarOpen ? ' sidebar-open' : ' sidebar-closed'}${sidebarResizer.isResizing ? ' sidebar-resizing' : ''}`}
        style={
          {
            '--sidebar-width': `${sidebarResizer.width}px`,
            background: 'var(--bg-panel)',
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
          className={`panel-resize-handle sidebar-resize-handle${sidebarResizer.isResizing ? ' is-resizing' : ''}`}
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
          preferredCwd={preferredCwd}
          projectSelected={projectRoot !== null}
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
        className={`right-panel-overlay-backdrop${rightPanelOpen ? ' is-open' : ''}`}
        onClick={() => setRightPanelOpen(false)}
      />
      {rightPanelOpen && (
        <div
          {...rightPanelResizer.separatorProps}
          inert={rightPanelExpanded}
          aria-controls="file-panel"
          className={`panel-resize-handle right-panel-resize-handle${rightPanelResizer.isResizing ? ' is-resizing' : ''}`}
          data-resize-handle="right-panel"
          title="调整文件面板宽度：拖拽或方向键（双击复位）"
        />
      )}

      {/* 右栏：文件查看器——始终挂载，宽度由 CSS 动画（pi-web 同款） */}
      <div
        ref={rightPanelResizer.panelRef}
        id="file-panel"
        className={`right-panel-container${rightPanelOpen ? ' right-panel-open' : ' right-panel-closed'}${rightPanelFullWidth ? ' right-panel-full-width' : ''}${rightPanelResizer.isResizing ? ' right-panel-resizing' : ''}`}
        style={
          {
            '--right-panel-width': `${rightPanelResizer.width}px`,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid var(--border)',
            background: 'var(--bg)',
          } as React.CSSProperties
        }
      >
        <FilesPane
          root={projectRoot}
          sessionId={activeSessionId}
          open={rightPanelOpen}
          expanded={rightPanelExpanded}
          onToggleExpand={() => setRightPanelExpanded((previous) => !previous)}
          onHide={() => setRightPanelOpen(false)}
        />
      </div>

      {settingsOpen && (
        <SettingsHost
          projectRoot={projectRoot}
          onClose={() => setSettingsOpen(false)}
          onNotice={(message, tone) => pushToast(message, tone ?? 'info')}
        />
      )}
      {trustDialogOpen && projectRoot !== null && (
        <ProjectTrustDialog
          cwd={projectRoot}
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
