import { Outlet } from 'react-router';
import { useAppState } from '../lib/app-state';
import { SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from '../lib/prefs';
import { Sidebar } from './sidebar';

/**
 * 应用外壳（原型 `.app` 三栏骨架，docs/06 §4.4/§4.5：布局与拖拽留在 apps/web）。
 *
 * M1 只有两栏：左侧栏 + 中栏。原型右栏（文件浏览器 dock）依赖 `GET /api/files/*`，
 * 该域在 M3（docs/01 §6）——**不放假面板**，没有的东西不画（AGENTS.md：命名/界面
 * 不得暗示它做不到的事）。
 *
 * 侧栏宽度拖拽照原型 `makeDrag("dragL","--sb-w",200,440)`；这里额外把最小/最大
 * 暴露给键盘操作（左右方向键 ±16px），`role="separator"` 是可聚焦的分隔条语义。
 */
export function AppShell() {
  const { sidebarCollapsed, sidebarWidth, setSidebarWidth } = useAppState();

  return (
    <div className="relative flex h-dvh w-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>

      {sidebarCollapsed ? null : (
        <hr
          aria-label="拖拽调整侧边栏宽度（左右方向键微调）"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth}
          aria-valuemin={SIDEBAR_MIN_PX}
          aria-valuemax={SIDEBAR_MAX_PX}
          tabIndex={0}
          className="absolute top-0 bottom-0 z-40 m-0 w-2.5 cursor-col-resize border-0 bg-center bg-no-repeat opacity-0 outline-none transition-opacity hover:opacity-85 focus-visible:opacity-85"
          style={{
            left: sidebarWidth - 5,
            backgroundImage:
              'linear-gradient(to bottom, var(--accent) 0%, var(--accent) 72%, transparent)',
            backgroundSize: '2px 100%',
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            event.currentTarget.dataset.drag = String(event.clientX);
            event.currentTarget.dataset.start = String(sidebarWidth);
          }}
          onPointerMove={(event) => {
            const { drag, start } = event.currentTarget.dataset;
            if (drag === undefined || start === undefined) return;
            setSidebarWidth(Number(start) + event.clientX - Number(drag));
          }}
          onPointerUp={(event) => {
            delete event.currentTarget.dataset.drag;
            delete event.currentTarget.dataset.start;
          }}
          onKeyDown={(event) => {
            const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
            if (step === 0) return;
            event.preventDefault();
            setSidebarWidth(sidebarWidth + step);
          }}
        />
      )}
    </div>
  );
}

/** 供 UI 显示上下限（将来设置面板用；导出避免魔法数字散落） */
export const SIDEBAR_LIMITS = { min: SIDEBAR_MIN_PX, max: SIDEBAR_MAX_PX } as const;
