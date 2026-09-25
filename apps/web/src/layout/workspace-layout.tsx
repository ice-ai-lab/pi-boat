import { CLIENT_VERSION, nextTheme, themeLabel } from '@ice-ai/client';
import { useProjectTrustQuery, useUpdateProjectTrustMutation } from '@ice-ai/client/react';
import { ToastHost, type ToastItem, toastQueueReducer } from '@ice-ai/ui';
import { useCallback, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChatPane } from '../panes/chat-pane';
import { FilesPane } from '../panes/files-pane';
import { SettingsHost } from '../panes/settings-host';
import { SidebarPane } from '../panes/sidebar-pane';
import { useTheme } from '../services/theme';
import { useKeyboardShortcuts } from '../services/use-keyboard-shortcuts';
import { useServerHealth } from './health';

const HEALTH_LABEL = { checking: '检测中', up: '连接正常', down: '连接中断' } as const;
const HEALTH_DOT_CLASS = {
  checking: 'bg-fg-faint',
  up: 'bg-success',
  down: 'bg-danger',
} as const;

/**
 * 三栏工作区（docs/08 §3.3）：左栏会话/项目（F2）、中栏对话（F1）、右栏文件（F3）。
 * URL `?s=` 是当前会话的唯一真相——侧栏与对话面板都只改它（ADR-0019-5）。
 */
export function WorkspaceLayout() {
  const health = useServerHealth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSessionId = searchParams.get('s');
  const [preferredCwd, setPreferredCwd] = useState<string | null>(null);
  /** 当前项目根：文件树/查看器的相对路径基准（由侧栏回传，见下方 onProjectRootChange） */
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const theme = useTheme();
  const composerFocusRef = useRef<(() => void) | null>(null);
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

  useKeyboardShortcuts({
    onToggleSidebar: () => setSidebarOpen((previous) => !previous),
    onToggleStats: () => setSettingsOpen(false),
    onFocusComposer: () => composerFocusRef.current?.(),
    onOpenSettings: () => setSettingsOpen(true),
  });

  return (
    <div className="app-shell flex h-dvh flex-col bg-surface">
      <header className="hairline-b flex h-12 shrink-0 items-center gap-2 border-line-2 px-3">
        <span aria-hidden className="text-lg">
          🚢
        </span>
        <span className="text-sm font-semibold text-fg">PiBoat</span>
        {trustPending && (
          <button
            type="button"
            onClick={() =>
              updateTrust.mutate(true, {
                onSuccess: () => pushToast('已信任该项目，项目级资源已加载'),
                onError: (error) => pushToast(`信任失败：${error.message}`, 'error'),
              })
            }
            className="sq ml-2 bg-warn-soft px-2 py-0.5 text-[11px] text-warn hover:brightness-95"
            title="该项目有需要信任的资源（skills / 扩展）；未信任则不会加载"
          >
            ⚠ 项目未信任 — 点击信任
          </button>
        )}
        <button
          type="button"
          onClick={() => theme.setPreference(nextTheme(theme.preference))}
          title={`主题：${themeLabel(theme.preference)}（点击切换）`}
          aria-label="切换主题"
          className="sq ml-auto px-2 py-0.5 text-[11.5px] text-fg-subtle hover:bg-hover hover:text-fg"
        >
          {theme.preference === 'system' ? '◐' : theme.resolved === 'dark' ? '🌙' : '☀️'}
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="设置"
          aria-label="打开设置"
          className="sq px-2 py-0.5 text-[11.5px] text-fg-subtle hover:bg-hover hover:text-fg"
        >
          设置
        </button>
        <div className="ml-2 flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${HEALTH_DOT_CLASS[health]}`}
          />
          <span className="text-fg-subtle">{HEALTH_LABEL[health]}</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="hairline-r w-(--sb-w) shrink-0 border-line-2 bg-surface-side">
            <SidebarPane
              activeSessionId={activeSessionId}
              onProjectRootChange={setProjectRoot}
              onSelectSession={(id) => setSearchParams({ s: id })}
              onNewSession={(cwd) => {
                setPreferredCwd(cwd);
                setSearchParams({});
              }}
            />
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <ChatPane preferredCwd={preferredCwd} />
        </main>
        <aside className="hairline-l w-(--rb-w) shrink-0 border-line-2 bg-surface">
          <FilesPane root={projectRoot} sessionId={activeSessionId} />
        </aside>
      </div>
      {settingsOpen && (
        <SettingsHost
          projectRoot={projectRoot}
          version={CLIENT_VERSION}
          onClose={() => setSettingsOpen(false)}
          onNotice={(message, tone) => pushToast(message, tone ?? 'info')}
        />
      )}
      <ToastHost items={toasts} />
    </div>
  );
}
