import { groupTrail, type Turn } from '@ice-ai/client';
import { formatTokens } from '../lib/format';
import { StoppedTag } from './collapse-row';
import { MarkdownView } from './markdown-view';
import { ModelTag } from './model-badge';
import { ProcessGroup, SystemRow, TrailRowView } from './process-group';
import type { SessionStatsDisplay } from './usage-line';
import { UsageLine } from './usage-line';

/**
 * 助手一轮（原型 `.mline` → 处理轨迹 → `.md` → `.usage`）。
 *
 * 分组由 `groupTrail` 派生：**末轮流式期间平铺**（`liveTail`），
 * 轮结束（不再 busy/streaming）才一次性成组并收起——与刷新后的历史形状一致。
 */
export interface AssistantTurnProps {
  turn: Turn;
  /** 末轮且仍在流式（方案 2 的 isLiveTail） */
  liveTail?: boolean;
  /** 思考档位展示（如 `thinking low`，来自会话偏好） */
  thinkingLabel?: string;
  /** 流式徽标数据（缓存命中 / 速度；来自会话级统计） */
  liveStats?: SessionStatsDisplay;
}

export function AssistantTurn({
  turn,
  liveTail = false,
  thinkingLabel,
  liveStats,
}: AssistantTurnProps) {
  const items = groupTrail(turn.trail, { isLiveTail: liveTail });
  const statusTag =
    turn.status === 'stopped' ? (
      <StoppedTag />
    ) : turn.status === 'error' ? (
      <StoppedTag label="本轮出错" />
    ) : null;

  return (
    <div className="asst">
      <ModelTag
        model={turn.model}
        thinkingLabel={thinkingLabel}
        shimmer={liveTail}
        badges={liveTail && liveStats !== undefined ? <LiveBadges stats={liveStats} /> : undefined}
      />
      {items.map((item) =>
        item.kind === 'group' ? (
          <ProcessGroup key={item.id} group={item} hasFinal={turn.final !== null} />
        ) : item.kind === 'system' ? (
          <SystemRow key={item.id} row={item} />
        ) : (
          <TrailRowView key={item.id} row={item} />
        ),
      )}
      {turn.final === null ? null : <MarkdownView markdown={turn.final.markdown} />}
      {statusTag}
      <UsageLine usage={turn.usage} />
    </div>
  );
}

/** `.livebadge`：流式期间的缓存命中 / 速度徽标 */
function LiveBadges({ stats }: { stats: SessionStatsDisplay }) {
  return (
    <>
      {stats.cacheRead === undefined || stats.cacheRead <= 0 ? null : (
        <span className="livebadge">↓ {formatTokens(stats.cacheRead)}</span>
      )}
      {stats.tps === undefined || stats.tps <= 0 ? null : (
        <span className="livebadge fast">{Math.round(stats.tps)} t/s</span>
      )}
    </>
  );
}
