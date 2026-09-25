import type { Turn } from '@ice-ai/client';
import { groupTrail, isLiveTail } from '@ice-ai/client';
import type { Usage } from '@ice-ai/protocol';
import { memo } from 'react';
import { cn } from '../utils/cn';
import { MarkdownView } from './markdown-view';
import { ProcessGroup } from './process-group';
import { SystemRowView, ThinkingRowView } from './thinking-row';
import { ToolRowView } from './tool-row';

/**
 * 轨迹项的 React key：trail 是**仅追加**列表（流式补丁就地替换、从不重排），
 * 所以位置即稳定标识；工具行用 toolCallId（跨实例稳定）。
 */
function trailKey(item: { kind: string; toolCallId?: string }, index: number): string {
  return item.kind === 'tool' && item.toolCallId !== undefined
    ? item.toolCallId
    : `${item.kind}-${index}`;
}

/** 每轮用量行（in · out · cache R）——usage 在 message_end 定稿快照 */
export function UsageLine({ usage }: { usage: Usage }) {
  const parts = [
    `in ${usage.input.toLocaleString()}`,
    `out ${usage.output.toLocaleString()}`,
    usage.cacheRead > 0 ? `cache R ${usage.cacheRead.toLocaleString()}` : null,
  ].filter((part): part is string => part !== null);
  return <p className="mt-1 font-mono text-[10.5px] text-fg-faint">{parts.join(' · ')}</p>;
}

/** 用户气泡（docs/06 §4.2：.msg-user .bub） */
export function UserBubble({ turn }: { turn: Turn }) {
  return (
    <div className="flex justify-end">
      <div className="sq max-w-[85%] bg-bubble px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-fg">
        {turn.user.text}
      </div>
    </div>
  );
}

/**
 * AssistantTurn（docs/06 §4.2）：模型标签 + 轨迹（流式平铺 / 静止后成组）+ 回答 + 用量。
 * 成组是渲染期派生（groupTrail），流式末轮平铺不分组（docs/05 §6.5 方案 2）。
 */
export const AssistantTurn = memo(function AssistantTurn({
  turn,
  streaming,
}: {
  turn: Turn;
  /** 会话整体是否仍在跑（决定末轮 isLiveTail） */
  streaming: boolean;
}) {
  const liveTail = turn.status === 'streaming' && streaming;
  const grouped = groupTrail(turn.trail, liveTail);
  const hasFinal = turn.final !== null && turn.final.markdown.trim().length > 0;
  const streamingText = liveTail && turn.final === null;

  return (
    <div className="flex flex-col gap-2">
      {turn.model !== null && (
        <span
          className={cn(
            'sq self-start bg-accent-weak px-1.5 py-0.5 font-mono text-[10.5px] text-accent',
          )}
        >
          {turn.model.modelId}
        </span>
      )}
      {grouped.map((item, index) => {
        if (item.kind === 'group') {
          return (
            <ProcessGroup
              key={trailKey(item.items[0] ?? { kind: 'group' }, index)}
              group={item}
              defaultExpanded={!hasFinal}
            />
          );
        }
        if (item.kind === 'thinking')
          return <ThinkingRowView key={trailKey(item, index)} row={item} />;
        if (item.kind === 'tool') return <ToolRowView key={item.toolCallId} row={item} />;
        return <SystemRowView key={trailKey(item, index)} text={item.text} tone={item.tone} />;
      })}
      {streamingText && <p className="shimmer text-[12px]">生成中…</p>}
      {turn.final !== null && turn.final.markdown.length > 0 && (
        <div className="min-w-0">
          <MarkdownView markdown={turn.final.markdown} />
          {turn.usage !== null && !liveTail && <UsageLine usage={turn.usage} />}
        </div>
      )}
      {turn.status === 'stopped' && (
        <p className="sq self-start bg-surface-side px-2 py-1 text-[11.5px] text-fg-faint">
          已停止
        </p>
      )}
      {turn.status === 'error' && (
        <p className="sq self-start bg-danger-soft px-2 py-1 text-[11.5px] text-danger">
          本轮出错（详见处理详情）
        </p>
      )}
    </div>
  );
});

/** 会话级末轮判定（供列表层传给 AssistantTurn） */
export { isLiveTail };
