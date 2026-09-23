import { cn } from '../lib/cn';
import { formatTokens } from '../lib/format';
import { Icon } from '../primitives/icon';
import { ProgressRing } from '../primitives/progress-ring';
import { cacheHitPercent, formatCost, type SessionStatsDisplay } from './usage-line';

/**
 * 会话统计行（原型 `.stats`：`it`（图标 + 数值 + 单位）×5 + `.grow` + `it`（环 + 占比））。
 * 顺序固定为 in / out / cache / tps / cost；缺数据的项整项不渲染，M1 冷会话退化为仅 [环]。
 */
export interface StatsPillsProps {
  stats: SessionStatsDisplay;
  className?: string;
}

export function StatsPills({ stats, className }: StatsPillsProps) {
  const ctx = stats.contextPercent;
  const contextWindow = stats.contextWindow ?? null;
  return (
    <div className={cn('stats', className)}>
      {stats.input === undefined ? null : (
        <span className="it" title="输入 tokens">
          <Icon name="arrowup" />
          <b className="num">{formatTokens(stats.input)}</b>
          {'\u00a0'}in
        </span>
      )}
      {stats.output === undefined ? null : (
        <span className="it" title="输出 tokens">
          <Icon name="arrowdn" />
          <b className="num">{formatTokens(stats.output)}</b>
          {'\u00a0'}out
        </span>
      )}
      {stats.cacheRead === undefined ? null : (
        <span className="it" title="缓存读取 tokens">
          <Icon name="cache" />
          <b className="num">{formatTokens(stats.cacheRead)}</b>
          {'\u00a0'}cache
        </span>
      )}
      {stats.tps === undefined ? null : (
        <span className="it" title="生成速度">
          <Icon name="tps" />
          <b className="num">{Math.round(stats.tps)}</b>
          {'\u00a0'}tps
        </span>
      )}
      {stats.cost === undefined ? null : (
        <span className="it" title="花费">
          <Icon name="cost" />
          <b className="num">{formatCost(stats.cost)}</b>
        </span>
      )}
      <span className="grow" />
      <span className="it" title="上下文占用">
        <ProgressRing value={ctx ?? 0} />
        {ctx === null || ctx === undefined ? null : (
          <>
            <b className="num">{Math.round(ctx)}%</b>
            {contextWindow === null ? null : (
              <>
                {'\u00a0'}of {formatTokens(contextWindow)}
              </>
            )}
          </>
        )}
      </span>
    </div>
  );
}

export type { SessionStatsDisplay };
export { cacheHitPercent, formatCost, formatTokens };
