import { FileDock } from '@ice-ai/ui';
import type { CSSProperties } from 'react';
import { useRef } from 'react';
import { Outlet } from 'react-router';
import { useAppState } from '../lib/app-state';
import { RIGHTBAR_MAX_PX, RIGHTBAR_MIN_PX, SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from '../lib/prefs';
import { Sidebar } from './sidebar';

/**
 * 应用外壳（原型 `.app` 三栏骨架 + `#dragL`/`#dragR` 拖拽 handle）。
 *
 * 三栏：`.sidebar` / `.center`（路由出口）/ `.rightbar`（文件 dock，默认收起）。
 * 折叠态是 `.app` 上的 `sb-collapsed` / `rb-collapsed` 类——与原型一致，
 * 宽度走 `--sb-w` / `--rb-w` CSS 变量，handle 的定位由 CSS 的 `calc()` 负责。
 */
export function AppShell() {
  const {
    sidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    rightbarCollapsed,
    rightbarWidth,
    setRightbarWidth,
    setRightbarCollapsed,
  } = useAppState();

  const style = {
    '--sb-w': `${sidebarWidth}px`,
    '--rb-w': `${rightbarWidth}px`,
  } as CSSProperties;

  return (
    <div
      className={[
        'app',
        sidebarCollapsed ? 'sb-collapsed' : '',
        rightbarCollapsed ? 'rb-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      <DragHandle
        id="dragL"
        side="left"
        min={SIDEBAR_MIN_PX}
        max={SIDEBAR_MAX_PX}
        onResize={setSidebarWidth}
      />
      <DragHandle
        id="dragR"
        side="right"
        min={RIGHTBAR_MIN_PX}
        max={RIGHTBAR_MAX_PX}
        onResize={setRightbarWidth}
      />

      <Sidebar />

      <main className="center">
        <Outlet />
      </main>

      <FileDock onClose={() => setRightbarCollapsed(true)} />
    </div>
  );
}

/** 原型 `makeDrag()`：左栏跟 clientX、右栏取 `innerWidth - clientX` */
function DragHandle({
  id,
  side,
  min,
  max,
  onResize,
}: {
  id: string;
  side: 'left' | 'right';
  min: number;
  max: number;
  onResize: (px: number) => void;
}) {
  const dragging = useRef(false);

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: 原型即用 div 做拖拽 handle（pointer 事件 + 自定义光条） */}
      <div
        id={id}
        className="drag-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖拽调整栏宽"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          document.body.classList.add('resizing');
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          const raw = side === 'left' ? event.clientX : window.innerWidth - event.clientX;
          onResize(Math.max(min, Math.min(max, raw)));
        }}
        onPointerUp={(event) => {
          dragging.current = false;
          document.body.classList.remove('resizing');
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onLostPointerCapture={() => {
          dragging.current = false;
          document.body.classList.remove('resizing');
        }}
      />
    </>
  );
}

/** 供 UI 显示上下限（将来设置面板用；导出避免魔法数字散落） */
export const SIDEBAR_LIMITS = { min: SIDEBAR_MIN_PX, max: SIDEBAR_MAX_PX } as const;
