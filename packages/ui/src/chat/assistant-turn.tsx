import type { Turn } from '@ice-ai/client';
import { groupTrail, isLiveTail } from '@ice-ai/client';
import type { Usage } from '@ice-ai/protocol';
import { memo } from 'react';
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

/** 每轮用量行（in · out · cache R）——结构对齐 pi-web `formatUsage`（11px / text-dim） */
export function UsageLine({ usage }: { usage: Usage }) {
  const parts = [
    `in ${usage.input.toLocaleString()}`,
    `out ${usage.output.toLocaleString()}`,
    usage.cacheRead > 0 ? `cache R ${usage.cacheRead.toLocaleString()}` : null,
  ].filter((part): part is string => part !== null);
  return <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{parts.join(' · ')}</div>;
}

/** 用户气泡：照抄 pi-web `MessageView` 的 UserMessageView（12px 圆角 / 8×12 内边距 / 14px 字 / 1.6 行高） */
export function UserBubble({ turn }: { turn: Turn }) {
  return (
    <div
      style={{
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          minWidth: 0,
          background: 'var(--user-bg)',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 12,
          padding: '8px 12px',
          fontSize: 'calc(14px + var(--chat-font-size-offset, 0px))',
          lineHeight: 1.6,
          color: 'var(--text)',
          wordBreak: 'break-word',
        }}
      >
        <div className="markdown-body markdown-user-message">
          <MarkdownView markdown={turn.user.text} />
        </div>
      </div>
    </div>
  );
}

/**
 * AssistantTurn：模型标签 + 轨迹（流式平铺 / 静止后成组）+ 回答 + 用量。
 * 布局照抄 pi-web `MessageView` 的 AssistantMessageView：标签 11px text-dim，
 * 块间距 8，底部用量 11px text-dim。
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
    <div style={{ marginBottom: 16 }}>
      {turn.model !== null && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{turn.model.modelId}</span>
          {liveTail && <span className="shimmer">生成中…</span>}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        {streamingText && turn.model === null && <p className="shimmer text-[12px]">生成中…</p>}
        {turn.final !== null && turn.final.markdown.length > 0 && (
          <div className="min-w-0">
            <MarkdownView markdown={turn.final.markdown} />
          </div>
        )}
        {turn.status === 'stopped' && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--text-dim)',
              borderRadius: 7,
              padding: '6px 10px',
              background: 'var(--bg-subtle)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            已停止
          </div>
        )}
        {turn.status === 'error' && (
          <div
            role="alert"
            style={{
              padding: '7px 10px',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              background: 'rgba(239,68,68,0.07)',
              color: '#ef4444',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            本轮出错（详见处理详情）
          </div>
        )}
        {turn.usage !== null && !liveTail && <UsageLine usage={turn.usage} />}
      </div>
    </div>
  );
});

/** 会话级末轮判定（供列表层传给 AssistantTurn） */
export { isLiveTail };
