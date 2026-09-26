import { I18nProvider } from '@ice-ai/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceLayout } from '../layout/workspace-layout';

/** REST 查询客户端（ADR-0009：Query 只管 REST，事件流走 client 的 AgentStream）。
 * staleTime / retry 随 F1 首个消费方按域配置（不预置投机默认值）。 */
const queryClient = new QueryClient();

export function WorkspacePage() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* i18n 必须包住设置浮层与所有 ui 组件（§5.9.3） */}
      <I18nProvider>
        <WorkspaceLayout />
      </I18nProvider>
    </QueryClientProvider>
  );
}
