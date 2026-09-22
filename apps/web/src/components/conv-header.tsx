import { IconButton } from '@ice-ai/ui';
import type { ReactNode } from 'react';
import { useAppState } from '../lib/app-state';

/**
 * 中栏头部（原型 `.conv-header`，docs/06 §4.4（AppShell 三件套：AppShell / Sidebar / ConvHeader））。
 *
 * 结构：`[展开侧边栏（仅折叠时）] [对话 vtab] [系统/工具/统计 chips] [会话标题] …`
 * 原型把标题放在 `#convTitle`（默认 `hide`），这里改为用右侧的淡色标题承载——
 * 打开多个会话时「我现在在哪条会话里」是需要一直可见的信息，不值得为了照抄隐藏它。
 *
 * 原型的 `工具` / `统计` chips 与右栏（文件 dock）分别是 M2 / M3 的内容（docs/01 §6），
 * 因此这里只留 `系统`（M1 已在契约内）。
 */
export interface ConvHeaderProps {
  title?: ReactNode;
  children?: ReactNode;
}

export function ConvHeader({ title, children }: ConvHeaderProps) {
  const { sidebarCollapsed, toggleSidebar } = useAppState();

  return (
    <header className="relative z-20 flex-none border-b-[0.5px] border-line-3 bg-surface px-5">
      <div className="flex h-11 items-center gap-4">
        {sidebarCollapsed ? (
          <IconButton icon="panel" title="展开侧边栏" onClick={toggleSidebar} />
        ) : (
          <nav className="flex h-full items-stretch gap-6">
            <span className="relative flex items-center px-0.5 text-[13px] font-medium text-accent after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm after:bg-accent">
              对话
            </span>
          </nav>
        )}
        <div className="flex items-center gap-1.5">{children}</div>
        <span className="flex-1" />
        {title === undefined ? null : (
          <span
            className="min-w-0 max-w-[38vw] truncate text-[13px] text-fg-muted"
            title={typeof title === 'string' ? title : undefined}
          >
            {title}
          </span>
        )}
      </div>
    </header>
  );
}
