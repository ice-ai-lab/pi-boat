import type { Usage } from '@ice-ai/protocol';
import { Fragment } from 'react';
import { cn } from '../lib/cn';
import { formatCost, formatTokens } from '../lib/format';

/**
 * 每轮用量行（原型 `.usage`：`8.2k in · 1.6k out · cache 96% · $0.21 … 19:02`）。
 * 分隔点用 `.sep`（t4 弱化），时间 `margin-left:auto` 落在 `.tm`。
 * 数据来自 `Turn.usage`（`message.usage`）。
 */
export interface UsageLineProps {
  usage: Usage | null;
  at?: number;
  className?: string;
}

export function UsageLine({ usage, at, className }: UsageLineProps) {
  if (usage === null) return null;
  const cachePercent = cacheHitPercent({ input: usage.input, cacheRead: usage.cacheRead });
  const parts = [
    `${formatTokens(usage.input) ?? '0'} in`,
    `${formatTokens(usage.output) ?? '0'} out`,
    cachePercent === null ? null : `cache ${cachePercent}%`,
    formatCost(usage.cost.total),
  ].filter((part): part is string => part !== null);
  return (
    <div className={cn('usage', className)}>
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 ? <span className="sep">·</span> : null}
          <span className="num">{part}</span>
        </Fragment>
      ))}
      {at === undefined ? null : <span className="tm num">{formatClockSafe(at)}</span>}
    </div>
  );
}

function formatClockSafe(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 会话级 token 汇总（StatsPills 入参；都允许缺省——冷会话没有耗时/速度数据） */
export interface SessionStatsDisplay {
  input?: number | undefined;
  output?: number | undefined;
  cacheRead?: number | undefined;
  cacheWrite?: number | undefined;
  cost?: number | undefined;
  /** 生成速度 t/s：需要 LLM 耗时（core 累加，M1 冷会话为 undefined） */
  tps?: number | undefined;
  contextTokens?: number | null | undefined;
  contextWindow?: number | null | undefined;
  contextPercent?: number | null | undefined;
}

export function cacheHitPercent(stats: SessionStatsDisplay): number | null {
  const read = stats.cacheRead ?? 0;
  const input = stats.input ?? 0;
  const total = read + input;
  if (total === 0) return null;
  return Math.round((read / total) * 100);
}

export { formatCost };
