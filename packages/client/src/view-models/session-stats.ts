import type { ContextUsage, SessionStatsInfo } from '@ice-ai/protocol';

/** 统计与用量的展示派生（纯函数） */

export function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

export function formatCost(total: number): string {
  if (total <= 0) return '$0';
  if (total < 0.01) return `$${total.toFixed(4)}`;
  return `$${total.toFixed(2)}`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m${seconds}s`;
}

/** 上下文占用百分比（usage 可能缺省 = 未知窗口；ContextUsage 形状见 SDK） */
export function contextPercent(usage: ContextUsage | undefined | null): number | null {
  if (usage === undefined || usage === null) return null;
  const window = usage.contextWindow;
  const tokens = usage.tokens;
  if (typeof window !== 'number' || window <= 0) return null;
  if (typeof tokens !== 'number') return null;
  return Math.min(100, Math.max(0, (tokens / window) * 100));
}

export interface StatsSummary {
  input: number;
  output: number;
  cacheRead: number;
  cost: number;
  rounds: number | null;
  steps: number | null;
  llmMs: number | null;
  toolMs: number | null;
  tokensPerSecond: number | null;
}

/**
 * 汇总统计（形状对齐 SDK `SessionStats`：扁平 tokens + cost + contextUsage）。
 * `perf` 只在**本进程跑过**的会话上有值（冷会话 undefined）——此时性能四项为 null，
 * UI 不展示而不是显示 0（docs/02 §11.1）。
 */
export function summarizeStats(
  stats: SessionStatsInfo | null,
  fallback?: { input: number; output: number; cacheRead: number; cost: number },
): StatsSummary {
  const perf = stats?.perf;
  return {
    input: stats?.tokens.input ?? fallback?.input ?? 0,
    output: stats?.tokens.output ?? fallback?.output ?? 0,
    cacheRead: stats?.tokens.cacheRead ?? fallback?.cacheRead ?? 0,
    cost: stats?.cost ?? fallback?.cost ?? 0,
    rounds: perf?.rounds ?? null,
    steps: perf?.steps ?? null,
    llmMs: perf?.llmMs ?? null,
    toolMs: perf?.toolMs ?? null,
    tokensPerSecond: perf?.tokensPerSecond ?? null,
  };
}
