import type { SessionStatsDisplay } from '../chat/usage-line';
import { formatCost, formatTokens } from '../lib/format';

/**
 * 会话统计浮层（原型 `#popStats`：`.stat-grid` 六格 `.stat-cell`(.sk/.sv) + `.ctx-row` 上下文条）。
 *
 * `.stat-grid` 与 `.ctx-row` 是 `.pop` 的平级子元素，故宿主 Popover 传 `bodyClassName={null}`。
 * 只渲染有数据的格子（docs/06 §11.2：冷会话无耗时/速度数据时字段必须可选，
 * `undefined` 的格子不出现——不拿 0 冒充）。
 */
export interface StatsCardGroupProps {
  performance?: {
    rounds?: number | undefined;
    steps?: number | undefined;
    llmMs?: number | undefined;
    toolMs?: number | undefined;
    tps?: number | undefined;
  };
  tokens?: SessionStatsDisplay;
}

export function StatsCardGroup({ performance, tokens }: StatsCardGroupProps) {
  const percent = tokens?.contextPercent;
  return (
    <>
      <div className="stat-grid">
        <StatCell label="轮数" value={performance?.rounds} />
        <StatCell label="工具步数" value={performance?.steps} />
        <StatCell label="LLM 耗时" value={seconds(performance?.llmMs)} unit="s" />
        <StatCell label="工具耗时" value={seconds(performance?.toolMs)} unit="s" />
        <StatCell label="吞吐" value={performance?.tps?.toFixed(0)} unit="t/s" />
        <StatCell label="费用" value={formatCost(tokens?.cost) ?? undefined} />
      </div>
      {percent === null || percent === undefined ? null : (
        <div className="ctx-row">
          <div className="ck">
            <span>上下文占用</span>
            <span className="num">
              {formatTokens(tokens?.contextTokens ?? 0)} /{' '}
              {formatTokens(tokens?.contextWindow ?? 0)} · {Math.round(percent)}%
            </span>
          </div>
          <div className="ctx-bar">
            <i style={{ width: `${Math.min(100, percent)}%` }} />
          </div>
        </div>
      )}
    </>
  );
}

function StatCell({
  label,
  value,
  unit,
}: {
  label: string;
  value?: string | number | undefined;
  unit?: string;
}) {
  if (value === undefined) return null;
  return (
    <div className="stat-cell">
      <div className="sk">{label}</div>
      <div className="sv num">
        {value}
        {unit === undefined ? null : <small>{` ${unit}`}</small>}
      </div>
    </div>
  );
}

function seconds(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : (ms / 1000).toFixed(1);
}
