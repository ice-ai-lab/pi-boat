import type { Usage } from '@ice-ai/protocol';
import { formatCost, formatTokens } from '../lib/format';

/**
 * 每轮用量行（原型 `.usage-line`：`755 in · 1,377 out · 20,096 cache R · $0.0123 … 16:33`）。
 * 数据来自 `Turn.usage`（`message.usage`，docs/06 §11.2 已覆盖，无需协议改动）。
 */
export interface UsageLineProps {
  usage: Usage | null;
  at?: number;
  className?: string;
}

export function UsageLine({ usage, at, className }: UsageLineProps) {
  if (usage === null) return null;
  const parts = [
    `${usage.input.toLocaleString()} in`,
    `${usage.output.toLocaleString()} out`,
    `${usage.cacheRead.toLocaleString()} cache R`,
    formatCost(usage.cost.total),
  ].filter((part): part is string => part !== null);
  return (
    <div
      className={`flex items-center gap-2 text-[11px] tabular-nums text-fg-faint ${className ?? ''}`}
    >
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-2">
          {index > 0 ? <span>·</span> : null}
          {part}
        </span>
      ))}
      <span className="flex-1" />
      {at === undefined ? null : <span>{formatClockSafe(at)}</span>}
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

export { formatCost, formatTokens };
