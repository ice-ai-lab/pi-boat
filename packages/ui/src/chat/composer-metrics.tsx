import type { ContextUsage } from '@ice-ai/protocol';
import { useI18n } from '../i18n/i18n-provider';

/**
 * ComposerMetrics：输入卡**下方**的会话指标行 ——
 * `Σ total tok · 缓存命中 pct% │ ◐ pct / window`，点它开「会话信息」面板（由调用方渲染）。
 *
 * 从顶栏工具条搬到输入卡下方（原型 §8「指标行并入底部」）：指标是「本轮消耗」的读数，
 * 跟发送动作同处一地比挂在顶栏更好找；顶栏因此只剩会话级入口。
 * 行**居中**（用户 2026-09-28 指定；原型是右对齐）——输入卡与排队条都是通宽块，
 * 居中的读数行看起来与它们同轴。
 * 2026-09-28（用户）：收敛为「总 token + 缓存命中率」一处读数，去掉 in/out/cost 三个碎片指标；
 * 明细（in/out/cache read/write/cost）仍在悬停提示与会话信息面板。
 */
export interface ComposerMetricsProps {
  /** 形状对齐 SDK `SessionStats['tokens']`（total/cacheWrite 由调用方从 sessionStats.tokens 原样传入） */
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  } | null;
  contextUsage: ContextUsage | null;
  /** 悬停提示（in/out/cache/cost/context 的精确值，由调用方拼） */
  tooltip: string;
  open: boolean;
  onToggle(): void;
}

/** 设计规范 `formatCompact`（AppShell：1200 → "1k"，1_200_000 → "1.2M"） */
function formatCompact(value: number): string {
  return value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1000
      ? `${(value / 1000).toFixed(0)}k`
      : String(value);
}

const ICON = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function ComposerMetrics({
  tokens,
  contextUsage,
  tooltip,
  open,
  onToggle,
}: ComposerMetricsProps) {
  const { t } = useI18n();
  let contextColor = 'var(--text-muted)';
  let contextText: string | null = null;
  if (contextUsage?.contextWindow) {
    const percent = contextUsage.percent;
    if (percent !== null && percent > 90) contextColor = 'var(--red)';
    else if (percent !== null && percent > 70) contextColor = 'var(--amber)';
    contextText =
      percent !== null
        ? `${percent.toFixed(0)}%`
        : `? / ${formatCompact(contextUsage.contextWindow)}`;
  }
  const total = tokens?.total ?? 0;
  const cacheRead = tokens?.cacheRead ?? 0;
  const cacheHitPct = total > 0 ? Math.round((cacheRead / total) * 100) : 0;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0 2px' }}>
      <button
        type="button"
        onClick={onToggle}
        title={tooltip || t('session.title')}
        aria-label={t('session.title')}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 9,
          height: 24,
          marginLeft: 2,
          padding: '0 10px',
          border: 'none',
          borderRadius: 999,
          background: open ? 'var(--bg-hover)' : 'none',
          color: 'var(--text-dim)',
          cursor: 'pointer',
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          transition: 'background 0.14s, color 0.14s',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'var(--bg-hover)';
          event.currentTarget.style.color = 'var(--text-muted)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = open ? 'var(--bg-hover)' : 'none';
          event.currentTarget.style.color = 'var(--text-dim)';
        }}
      >
        {total > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <svg {...ICON} aria-hidden="true">
              {/* Σ（sigma）：total = 各类 token 之和 */}
              <path d="M18 7V4H6l6 8-6 8h12v-3" />
            </svg>
            <b style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
              {formatCompact(total)} tok
            </b>
            {cacheRead > 0 && (
              <span>
                · {t('chat.cacheHit')} {cacheHitPct}%
              </span>
            )}
          </span>
        )}
        {contextText !== null && (
          <>
            <span
              aria-hidden="true"
              style={{ width: 1, height: 11, flexShrink: 0, background: 'var(--border)' }}
            />
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: contextColor }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  background: `conic-gradient(${contextColor} ${(contextUsage?.percent ?? 0) * 1}%, color-mix(in srgb, var(--text-dim) 25%, transparent) 0)`,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: 'var(--bg)',
                  }}
                />
              </span>
              <b style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{contextText}</b>
              {contextUsage?.percent !== null && contextUsage?.percent !== undefined && (
                <span> / {formatCompact(contextUsage.contextWindow)}</span>
              )}
            </span>
          </>
        )}
      </button>
    </div>
  );
}
