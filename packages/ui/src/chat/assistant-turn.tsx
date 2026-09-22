import { groupTrail, type Turn } from '@ice-ai/client';
import { StoppedTag } from './collapse-row';
import { MarkdownView } from './markdown-view';
import { ModelTag } from './model-badge';
import { ProcessGroup, SystemRow, TrailRowView } from './process-group';
import { UsageLine } from './usage-line';

/**
 * 助手一轮（原型 `.msg-asst` → `.flow` + `.model-tag` + `.md` + `.usage-line`）。
 *
 * 分组由 `groupTrail` 派生：**末轮流式期间平铺**（`liveTail`），
 * 轮结束（不再 busy/streaming）才一次性成组并收起——与刷新后的历史形状一致。
 */
export interface AssistantTurnProps {
  turn: Turn;
  /** 末轮且仍在流式（方案 2 的 isLiveTail） */
  liveTail?: boolean;
}

export function AssistantTurn({ turn, liveTail = false }: AssistantTurnProps) {
  const items = groupTrail(turn.trail, { isLiveTail: liveTail });
  const statusTag =
    turn.status === 'stopped' ? (
      <StoppedTag />
    ) : turn.status === 'error' ? (
      <StoppedTag label="本轮出错" />
    ) : null;

  return (
    <div className="msg-asst">
      <div className="flow">
        {items.map((item) =>
          item.kind === 'group' ? (
            <ProcessGroup key={item.id} group={item} hasFinal={turn.final !== null} />
          ) : item.kind === 'system' ? (
            <SystemRow key={item.id} row={item} />
          ) : (
            <TrailRowView key={item.id} row={item} />
          ),
        )}
        <ModelTag model={turn.model} />
        {turn.final === null ? null : (
          <div aria-live={liveTail ? 'polite' : 'off'}>
            <MarkdownView markdown={turn.final.markdown} />
          </div>
        )}
        {statusTag}
        <UsageLine usage={turn.usage} />
      </div>
    </div>
  );
}
