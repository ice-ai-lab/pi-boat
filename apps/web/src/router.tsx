import { createBrowserRouter } from 'react-router';
import { WorkspacePage } from './pages/workspace-page';

/** 单路由 + `?s=<sessionId>`（ADR-0019）；设置与顶部面板均为浮层，不占路由 */
export const router = createBrowserRouter([{ path: '/', element: <WorkspacePage /> }]);
