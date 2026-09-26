import type { SessionTreeNode } from '@ice-ai/protocol';
import {
  BranchNavigator,
  type BranchNodeView,
  SessionStatsPanel,
  SystemPromptPanel,
  ToolDefinitionsPanel,
} from '@ice-ai/ui';
import { type ComponentProps, useMemo } from 'react';

/**
 * PanelsHost（F5）：顶部活动面板（分支 / 系统提示词 / 工具 / 统计）。
 * 一次只开一个（与原型一致）；数据由 ChatPane 传入，动作经回调上抛。
 */
export type ActivePanel = 'branches' | 'system' | 'tools' | 'stats' | null;

export interface PanelsHostProps {
  active: ActivePanel;
  onClose(): void;
  tree: SessionTreeNode[];
  activeLeafId: string | null;
  branchesBusy: boolean;
  onNavigateNode(nodeId: string): void;
  onForkNode(nodeId: string): void;
  onCloneSession(): void;
  systemPrompt: string | null;
  systemLoading: boolean;
  onReloadSystemPrompt(): void;
  tools: {
    name: string;
    description: string;
    active: boolean;
    parameters?: unknown;
    promptGuidelines?: string[];
  }[];
  toolsLoading: boolean;
  stats: ComponentProps<typeof SessionStatsPanel>['summary'];
  statsInfo: ComponentProps<typeof SessionStatsPanel>['info'] | null;
  contextPercent: number | null;
  statsLoading: boolean;
  onReloadStats(): void;
}

/** 会话树 → 扁平节点视图（仅保留摘要与路径标记；树形缩进由深度控制） */
export function treeToNodes(
  tree: readonly SessionTreeNode[],
  activeLeafId: string | null,
): BranchNodeView[] {
  const leafPath = new Set<string>();
  const byId = new Map<string, SessionTreeNode>();
  const walk = (nodes: readonly SessionTreeNode[]) => {
    for (const node of nodes) {
      byId.set(node.entry.id, node);
      walk(node.children);
    }
  };
  walk(tree);
  // 从当前叶回溯标记活动路径
  let cursor = activeLeafId === null ? undefined : byId.get(activeLeafId);
  while (cursor !== undefined) {
    leafPath.add(cursor.entry.id);
    const parentId = cursor.entry.parentId;
    cursor = parentId === null ? undefined : byId.get(parentId);
  }
  const flat: BranchNodeView[] = [];
  const emit = (nodes: readonly SessionTreeNode[], depth: number) => {
    for (const node of nodes) {
      flat.push({
        id: node.entry.id,
        parentId: node.entry.parentId,
        label: node.label ?? summarizeEntry(node.entry),
        onActivePath: leafPath.has(node.entry.id),
        isLeaf: node.children.length === 0,
        depth,
        forkable: node.entry.type === 'message' && node.entry.message.role === 'user',
      });
      emit(node.children, depth + 1);
    }
  };
  emit(tree, 0);
  return flat;
}

function summarizeEntry(entry: SessionTreeNode['entry']): string {
  if (entry.type === 'message') {
    const message = entry.message;
    if (message.role === 'user') return `用户：${textOf(message.content)}`;
    if (message.role === 'assistant') return `助手：${textOf(message.content)}`;
    if (message.role === 'toolResult') return `工具结果：${message.toolName}`;
    return message.role;
  }
  return entry.type;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content.replace(/\s+/g, ' ').slice(0, 60);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (
        block !== null &&
        typeof block === 'object' &&
        (block as { type?: string }).type === 'text' &&
        typeof (block as { text?: string }).text === 'string'
      ) {
        return (block as { text: string }).text.replace(/\s+/g, ' ').slice(0, 60);
      }
    }
  }
  return '(无文本)';
}

export function PanelsHost(props: PanelsHostProps) {
  const nodes = useMemo(
    () => treeToNodes(props.tree, props.activeLeafId),
    [props.tree, props.activeLeafId],
  );
  const leafCount = nodes.filter((node) => node.isLeaf).length;

  if (props.active === 'system') {
    return (
      <SystemPromptPanel
        prompt={props.systemPrompt}
        loading={props.systemLoading}
        onClose={props.onClose}
        onReload={props.onReloadSystemPrompt}
      />
    );
  }
  if (props.active === 'tools') {
    return <ToolDefinitionsPanel tools={props.tools} loading={props.toolsLoading} />;
  }
  if (props.active === 'branches') {
    return (
      <BranchNavigator
        nodes={nodes}
        leafCount={leafCount}
        activeLeafId={props.activeLeafId}
        busy={props.branchesBusy}
        onNavigate={props.onNavigateNode}
        onFork={props.onForkNode}
        onClone={props.onCloneSession}
        onClose={props.onClose}
      />
    );
  }
  if (props.active === 'stats' && props.statsInfo !== null) {
    return (
      <SessionStatsPanel
        summary={props.stats}
        info={props.statsInfo}
        contextPercent={props.contextPercent}
        loading={props.statsLoading}
        onClose={props.onClose}
        onReload={props.onReloadStats}
      />
    );
  }
  return null;
}
