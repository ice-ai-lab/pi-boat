import type { ContextUsage, SessionStatsInfo } from '@ice-ai/protocol';
import { SessionInfoPopover, SystemPromptPanel, ToolDefinitionsPanel } from '@ice-ai/ui';

/**
 * PanelsHost（F5）：顶部活动面板（系统提示词 / 工具 / 会话信息）。
 * 一次只开一个（与 pi-web 一致）；由 ChatPane 装进 `position:fixed` 贴顶下拉（T1-3）。
 * 分支面板（BranchNavigator inline）自带 fixed 下拉，不经过这里。
 */
export type ActivePanel = 'branches' | 'system' | 'tools' | 'session' | null;

export interface PanelsHostProps {
  active: Exclude<ActivePanel, 'branches'>;
  systemPrompt: string | null;
  systemLoading: boolean;
  tools: {
    name: string;
    description: string;
    active: boolean;
    parameters?: unknown;
    promptGuidelines?: string[];
  }[];
  toolsLoading: boolean;
  stats: SessionStatsInfo | null;
  contextUsage: ContextUsage | null;
  project?: {
    cwd: string;
    branch?: string;
    isWorktree?: boolean;
  } | null;
}

export function PanelsHost(props: PanelsHostProps) {
  if (props.active === 'system') {
    return <SystemPromptPanel prompt={props.systemPrompt} loading={props.systemLoading} />;
  }
  if (props.active === 'tools') {
    return <ToolDefinitionsPanel tools={props.tools} loading={props.toolsLoading} />;
  }
  if (props.active === 'session') {
    return (
      <SessionInfoPopover
        stats={props.stats}
        contextUsage={props.contextUsage}
        project={props.project ?? null}
      />
    );
  }
  return null;
}
