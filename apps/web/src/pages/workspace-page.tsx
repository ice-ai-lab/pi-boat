import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MobileGate } from '../layout/mobile-gate';
import { WorkspaceLayout } from '../layout/workspace-layout';

/** REST 查询客户端（ADR-0009：Query 只管 REST，事件流走 client 的 AgentStream）。
 * staleTime / retry 随 F1 首个消费方按域配置（不预置投机默认值）。 */
const queryClient = new QueryClient();

export function WorkspacePage() {
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceLayout />
      <MobileGate />
    </QueryClientProvider>
  );
}
