import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChatPane } from '../panes/chat-pane';
import { FilesPane } from '../panes/files-pane';
import { SidebarPane } from '../panes/sidebar-pane';
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

  return (
    <div className="app-shell flex h-dvh flex-col bg-surface">
      <header className="hairline-b flex h-12 shrink-0 items-center gap-2 border-line-2 px-3">
        <span aria-hidden className="text-lg">
          🚢
        </span>
        <span className="text-sm font-semibold text-fg">PiBoat</span>
        <div className="ml-auto flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${HEALTH_DOT_CLASS[health]}`}
          />
          <span className="text-fg-subtle">{HEALTH_LABEL[health]}</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
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
        <main className="flex min-w-0 flex-1 flex-col">
          <ChatPane preferredCwd={preferredCwd} />
        </main>
        <aside className="hairline-l w-(--rb-w) shrink-0 border-line-2 bg-surface">
          <FilesPane root={projectRoot} sessionId={activeSessionId} />
        </aside>
      </div>
    </div>
  );
}
