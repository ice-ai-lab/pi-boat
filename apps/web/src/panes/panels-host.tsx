import type { ContextUsage, SessionStatsInfo } from '@ice-ai/protocol';
import { SessionInfoPopover, SystemPromptPanel, ToolDefinitionsPanel } from '@ice-ai/ui';

/**
 * PanelsHost（F5）：顶部活动面板（系统提示词 / 工具定义 / 会话信息）。
 * 一次只开一个（与设计规范一致）；系统 / 工具由 ChatPane 装进 `position:fixed` 贴顶下拉（T1-3），
 * 会话信息由底部指标行向上弹出，分支面板（BranchNavigator inline）自带 fixed 下拉。
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
  /** 供系统提示词面板估算「占上下文 x%」与会话信息浮层 */
  contextUsage: ContextUsage | null;
  /** 收起当前面板（卡片头右侧的 chevron） */
  onClose(): void;
}

export function PanelsHost(props: PanelsHostProps) {
  if (props.active === 'system') {
    return (
      <SystemPromptPanel
        prompt={props.systemPrompt}
        loading={props.systemLoading}
        contextWindow={props.contextUsage?.contextWindow ?? null}
        onClose={props.onClose}
      />
    );
  }
  if (props.active === 'tools') {
    return (
      <ToolDefinitionsPanel
        tools={props.tools}
        loading={props.toolsLoading}
        onClose={props.onClose}
      />
    );
  }
  if (props.active === 'session') {
    return <SessionInfoPopover stats={props.stats} contextUsage={props.contextUsage} />;
  }
  return null;
}
