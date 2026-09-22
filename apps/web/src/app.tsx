import { PROTOCOL_VERSION } from '@ice-ai/protocol';
import { EmptyState, IconSprite } from '@ice-ai/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/app-shell';
import { AppStateProvider } from './lib/app-state';
import { ToastProvider } from './lib/toast';
import { useNarrow } from './lib/use-narrow';
import { NewSessionRoute } from './routes/new-session';
import { SessionRoute } from './routes/session';

/**
 * 应用装配（原型：单页三栏 + 路由切换中栏）。
 *
 * 路由用 React Router v7 library 模式：两条路由共享 `AppShell` 布局路由——
 * 左右栏在**两页都常驻**（原型里 hero 只是中栏的一个状态，侧栏不重建）。
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
      <div className="relative flex h-dvh flex-col bg-surface">
        <IconSprite />
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
          <IconSprite />
          <RouterProvider router={router} />
        </ToastProvider>
      </AppStateProvider>
    </QueryClientProvider>
  );
}
