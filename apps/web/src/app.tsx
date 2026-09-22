import { PROTOCOL_VERSION } from '@ice-ai/protocol';
import { EmptyState } from '@ice-ai/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/app-shell';
import { AppStateProvider } from './lib/app-state';
import { ToastProvider } from './lib/toast';
import { useNarrow } from './lib/use-narrow';
import { NewSessionRoute } from './routes/new-session';
import { SessionRoute } from './routes/session';

/**
 * 应用装配（docs/06 §4.5：AppShell / 路由 / QueryClient / 边界留在 apps/web）。
 *
 * 路由用 **React Router v7 library 模式**（`createBrowserRouter` + `RouterProvider`，ADR-0009）：
 * 两条路由共享 `AppShell` 布局路由——左侧栏（含文件夹空间与会话列表）在**两页都常驻**，
 * 与原型一致（原型里 hero 只是中栏的一个状态，侧栏不重建）。SPA fallback 由 server 的
 * 静态托管提供（docs/04 §7）。
 *
 * Provider 顺序：QueryClient（REST 查询）→ AppState（文件夹空间/侧栏）→ Toast → Router。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <NewSessionRoute /> },
      { path: 'session/:sessionId', element: <SessionRoute /> },
    ],
  },
]);

export function App() {
  const narrow = useNarrow();
  // M1 只保大屏（docs/06 §9.1）：窄屏不做 drawer/重排，直接给门禁提示
  if (narrow) {
    return (
      <div className="flex h-dvh flex-col bg-surface">
        <EmptyState
          title="窗口过窄（< 880px）"
          subtitle="M1 只针对大屏；请加宽窗口（移动端形态随 M3 排期）"
          inertBoat
          version={`web v${__APP_VERSION__} · protocol v${PROTOCOL_VERSION}`}
        />
      </div>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AppStateProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AppStateProvider>
    </QueryClientProvider>
  );
}
