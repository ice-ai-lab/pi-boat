import { cn, FileDock } from '@ice-ai/ui';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { useAppState } from '../lib/app-state';
import { SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from '../lib/prefs';
import { Sidebar } from './sidebar';

/**
 * 左栏拖拽把手（原型 `#dragL`）。
 *
 * 把手样式与拖拽态（`body.resizing`）由 additions.css 兜底——v4 静态稿是固定栏宽。
 */
function DragHandle({
  min,
  max,
  onResize,
}: {
  min: number;
  max: number;
  onResize: (width: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const clamp = (value: number): number => Math.min(Math.max(value, min), max);
  const stop = (): void => {
    document.body.classList.remove('resizing');
    setDragging(false);
  };
  return (
    <div
      id="dragL"
      className={cn('drag-handle', dragging && 'dragging')}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('resizing');
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (dragging) onResize(clamp(event.clientX + 4));
      }}
      onPointerUp={stop}
      onLostPointerCapture={stop}
    />
  );
}

/**
 * 应用外壳（原型 `.app` 三栏骨架：`.side` / `.main` / `.dock`）。
 *
 * - 左栏宽度走 v4 变量 `--sbw`（内联给出，折叠时为 0，`.sb-collapsed` 只负责隐藏内容）；
 * - 右栏 `.dock` 沿用 v4 形态：默认收起（width 0），`.open` 时 302px，不参与拖拽。
 */
export function AppShell() {
  const {
    sidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    rightbarCollapsed,
    setRightbarCollapsed,
  } = useAppState();

  return (
    <div
      className={cn('app', sidebarCollapsed && 'sb-collapsed')}
      style={{ '--sbw': `${sidebarCollapsed ? 0 : sidebarWidth}px` } as React.CSSProperties}
    >
      <DragHandle min={SIDEBAR_MIN_PX} max={SIDEBAR_MAX_PX} onResize={setSidebarWidth} />
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
      <aside className={cn('dock', !rightbarCollapsed && 'open')}>
        <FileDock onClose={() => setRightbarCollapsed(true)} />
      </aside>
    </div>
  );
}
