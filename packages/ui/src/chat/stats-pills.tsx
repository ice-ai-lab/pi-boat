import { formatCost, formatTokens } from '../lib/format';
import { Icon } from '../primitives/icon';
import { ProgressRing } from '../primitives/progress-ring';
import type { SessionStatsDisplay } from './usage-line';
import { cacheHitPercent } from './usage-line';

/**
 * footer 统计 pills（原型 `#statsRow`，docs/06 §4.2）：in / out / cache / tps / cost / ctx ring。
 * 点击任一 pill → `onSelect(kind)`（M1 打开统计弹窗是 M2，先留回调）。
 * 缺省字段（冷会话无耗时数据）**不渲染该 pill**（docs/06 §11.2 约束）。
 */
export type StatsPillKind = 'input' | 'output' | 'cache' | 'tps' | 'cost' | 'context';

export interface StatsPillsProps {
  stats: SessionStatsDisplay;
  onSelect?: (kind: StatsPillKind) => void;
}

export function StatsPills({ stats, onSelect }: StatsPillsProps) {
  const hit = cacheHitPercent(stats);
  const groups: {
    kind: StatsPillKind;
    icon: 'send' | 'db' | 'gauge' | 'coin';
    label: string;
    rotate?: boolean;
  }[][] = [
    [
      ...(stats.input === undefined
        ? []
        : [
            {
              kind: 'input' as const,
              icon: 'send' as const,
              label: formatTokens(stats.input) ?? '',
            },
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
    ],
    [
      ...(stats.cost === undefined
        ? []
        : [{ kind: 'cost' as const, icon: 'coin' as const, label: formatCost(stats.cost) ?? '' }]),
    ],
  ];

  const hasContext = stats.contextPercent !== undefined && stats.contextPercent !== null;
  if (groups.every((group) => group.length === 0) && !hasContext) return null;

  return (
    <div className="mx-auto mt-[5px] flex min-h-[26px] max-w-[var(--chat-w,760px)] items-center justify-center">
      {groups.map((group, groupIndex) => (
        <div
          key={group.map((pill) => pill.kind).join('+') || 'empty'}
          className="flex items-center"
        >
          {groupIndex > 0 && group.length > 0 ? (
            <span className="mx-[5px] h-[11px] w-px bg-line-2" />
          ) : null}
          {group.map((pill) => (
            <button
              key={pill.kind}
              type="button"
              onClick={() => onSelect?.(pill.kind)}
              title={pillTitle(pill.kind)}
              className="inline-flex h-[26px] items-center gap-1 rounded-full px-1.5 text-[11.5px] tabular-nums text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
            >
              <Icon
                name={pill.icon}
                size={13}
                className={pill.rotate === true ? 'rotate-180 text-fg-faint' : 'text-fg-faint'}
              />
              <span>{pill.label}</span>
            </button>
          ))}
        </div>
      ))}
      {hasContext ? (
        <button
          type="button"
          onClick={() => onSelect?.('context')}
          title="上下文占用"
          className="inline-flex h-[26px] items-center gap-1 rounded-full px-1.5 text-[11.5px] tabular-nums text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        >
          {groups.some((group) => group.length > 0) ? (
            <span className="mx-[5px] h-[11px] w-px bg-line-2" />
          ) : null}
          <ProgressRing value={stats.contextPercent ?? 0} />
          <span>
            {(stats.contextPercent ?? 0).toFixed(0)}% / {formatTokens(stats.contextWindow ?? 0)}
          </span>
        </button>
      ) : null}
    </div>
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
