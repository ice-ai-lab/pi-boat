import { formatCost, formatTokens } from '../lib/format';
import { Icon, type IconName } from '../primitives/icon';
import { ProgressRing } from '../primitives/progress-ring';
import type { SessionStatsDisplay } from './usage-line';
import { cacheHitPercent } from './usage-line';

/**
 * footer 统计 pills（原型 `#statsRow`）：in / out / cache / tps / cost / ctx ring。
 * 点击任一 pill → `onSelect(kind)`（打开统计弹窗）。
 * 缺省字段（冷会话无耗时数据）**不渲染该 pill**。
 */
export type StatsPillKind = 'input' | 'output' | 'cache' | 'tps' | 'cost' | 'context';

export interface StatsPillsProps {
  stats: SessionStatsDisplay;
  onSelect?: (kind: StatsPillKind) => void;
}

interface Pill {
  kind: StatsPillKind;
  icon: IconName;
  label: string;
  rotate?: boolean;
}

export function StatsPills({ stats, onSelect }: StatsPillsProps) {
  const hit = cacheHitPercent(stats);
  const groupOne: Pill[] = [
    ...(stats.input === undefined
      ? []
      : [
          { kind: 'input' as const, icon: 'send' as const, label: formatTokens(stats.input) ?? '' },
        ]),
    ...(stats.output === undefined
      ? []
      : [
          {
            kind: 'output' as const,
            icon: 'send' as const,
            label: formatTokens(stats.output) ?? '',
            rotate: true,
          },
        ]),
    ...(hit === null ? [] : [{ kind: 'cache' as const, icon: 'db' as const, label: `${hit}%` }]),
    ...(stats.tps === undefined
      ? []
      : [{ kind: 'tps' as const, icon: 'gauge' as const, label: `${stats.tps.toFixed(1)} t/s` }]),
  ];
  const groupTwo: Pill[] = [
    ...(stats.cost === undefined
      ? []
      : [{ kind: 'cost' as const, icon: 'coin' as const, label: formatCost(stats.cost) ?? '' }]),
  ];
  const hasContext = stats.contextPercent !== undefined && stats.contextPercent !== null;
  if (groupOne.length === 0 && groupTwo.length === 0 && !hasContext) return null;

  return (
    <div className="stats-row">
      {groupOne.length === 0 ? null : (
        <div className="stats-group">
          {groupOne.map((pill) => (
            <PillButton key={pill.kind} pill={pill} onSelect={onSelect} />
          ))}
        </div>
      )}
      {groupTwo.length === 0 && !hasContext ? null : (
        <div className="stats-group">
          {groupTwo.map((pill) => (
            <PillButton key={pill.kind} pill={pill} onSelect={onSelect} />
          ))}
          {hasContext ? (
            <button
              type="button"
              className="spill sq"
              title="上下文占用"
              onClick={() => onSelect?.('context')}
            >
              <ProgressRing value={stats.contextPercent ?? 0} />
              <span className="num">
                {(stats.contextPercent ?? 0).toFixed(0)}% / {formatTokens(stats.contextWindow ?? 0)}
              </span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PillButton({ pill, onSelect }: { pill: Pill; onSelect?: (kind: StatsPillKind) => void }) {
  return (
    <button
      type="button"
      className="spill sq"
      title={pillTitle(pill.kind)}
      onClick={() => onSelect?.(pill.kind)}
    >
      <Icon
        name={pill.icon}
        size={14}
        style={pill.rotate === true ? { transform: 'rotate(180deg)' } : undefined}
      />
      <span className="num">{pill.label}</span>
    </button>
  );
}

function pillTitle(kind: StatsPillKind): string {
  switch (kind) {
    case 'input':
      return '输入 token（未缓存）';
    case 'output':
      return '输出 token';
    case 'cache':
      return '缓存命中率 = 缓存读 /（缓存读 + 输入）';
    case 'tps':
      return '生成速度（token / 秒）';
    case 'cost':
      return '累计费用';
    case 'context':
      return '上下文占用';
  }
}
