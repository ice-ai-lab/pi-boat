import type { ProviderUsageResponse } from '@ice-ai/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUpdatedTime } from '../i18n/format';
import { useI18n } from '../i18n/i18n-provider';

/**
 * ProviderUsageSummary（对齐 参考实现）：用量/余额摘要——标题 + 刷新按钮 +
 * 「更新于 HH:MM」+ 两列栅格。快照缓存在 localStorage（键里带 providerId），
 * 选中其他 provider 再回来时展示上次结果；真正的取数由宿主注入的回调完成
 * （ui 不取数边界不变）。
 */

type UsageBucket = {
  id: string;
  label: string;
  groupLabel?: string;
  used?: number;
  remaining?: number;
  limit?: number;
  unit: 'percent' | 'currency' | 'count';
  currency?: string;
  windowMinutes?: number;
  resetsAt?: number;
  period?: string;
};

type UsageMetric = {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  currency?: string;
};

type UsageReport = {
  capturedAt: number;
  buckets: UsageBucket[];
  metrics: UsageMetric[];
};

const STORAGE_PREFIX = 'piboat:provider-usage:';

function isUsageResponse(value: unknown): value is { status: 'ready'; report: UsageReport } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { status?: unknown; report?: unknown };
  if (record.status !== 'ready' || typeof record.report !== 'object' || record.report === null) {
    return false;
  }
  const report = record.report as { capturedAt?: unknown; buckets?: unknown; metrics?: unknown };
  return (
    typeof report.capturedAt === 'number' &&
    Array.isArray(report.buckets) &&
    Array.isArray(report.metrics)
  );
}

export function ProviderUsageSummary({
  providerId,
  enabled,
  onQuery,
}: {
  providerId: string;
  enabled: boolean;
  onQuery(providerId: string): Promise<ProviderUsageResponse>;
}) {
  const { t, locale } = useI18n();
  const [snapshot, setSnapshot] = useState<UsageReport | null>(null);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshDone, setRefreshDone] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    setRefreshDone(false);
    setSnapshot(null);
    setError(null);
    try {
      const cached = localStorage.getItem(`${STORAGE_PREFIX}${providerId}`);
      if (cached !== null) {
        const parsed: unknown = JSON.parse(cached);
        if (isUsageResponse(parsed)) setSnapshot(parsed.report);
        else localStorage.removeItem(`${STORAGE_PREFIX}${providerId}`);
      }
    } catch {
      try {
        localStorage.removeItem(`${STORAGE_PREFIX}${providerId}`);
      } catch {
        // 忽略：localStorage 不可用时只是没有缓存
      }
    }
    return () => {
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    };
  }, [providerId]);

  const query = useCallback(async () => {
    setQuerying(true);
    setError(null);
    try {
      const result = await onQuery(providerId);
      if (result.status === 'ready') {
        setSnapshot(result.report);
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${providerId}`, JSON.stringify(result));
        } catch {
          // 同上：无缓存只影响「回来还看得到」
        }
        setRefreshDone(true);
        if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => setRefreshDone(false), 2000);
      } else {
        setError(result.message ?? t('providerUsage.queryFailed'));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('providerUsage.queryFailed'));
    } finally {
      setQuerying(false);
    }
  }, [onQuery, providerId, t]);

  return (
    <section style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.35 }}>
          {t('providerUsage.usage')}
        </span>
        <button
          type="button"
          onClick={() => void query()}
          disabled={!enabled || querying}
          title={t(querying ? 'providerUsage.refreshing' : 'providerUsage.refresh')}
          aria-label={t(querying ? 'providerUsage.refreshing' : 'providerUsage.refresh')}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 30,
            padding: 0,
            background: 'none',
            border: 'none',
            color: refreshDone ? '#4ade80' : 'var(--text-dim)',
            cursor: enabled && !querying ? 'pointer' : 'default',
            borderRadius: 5,
            flexShrink: 0,
            opacity: enabled ? 1 : 0.6,
            transition: 'color 0.3s',
          }}
        >
          {refreshDone ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#4ade80"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden={true}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={querying ? { animation: 'spin 0.8s linear infinite' } : undefined}
              aria-hidden={true}
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          )}
        </button>
        {snapshot !== null && (
          <span
            title={new Date(snapshot.capturedAt).toLocaleString(locale)}
            style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}
          >
            {t('providerUsage.updated', { time: formatUpdatedTime(snapshot.capturedAt, locale) })}
          </span>
        )}
      </div>

      {snapshot === null && error === null && (
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {t('providerUsage.notQueried')}
        </span>
      )}
      {error !== null && <span style={{ fontSize: 12, color: '#f87171' }}>{error}</span>}
      {snapshot !== null && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px minmax(0, 1fr)',
            columnGap: 14,
            rowGap: 8,
            alignItems: 'baseline',
            minWidth: 0,
            width: 'min(100%, 420px)',
            maxWidth: '100%',
            fontSize: 12,
          }}
        >
          {snapshot.buckets.map((bucket) => (
            /* 栅格两列一行：label + value（display:contents 不产生额外盒子） */
            <div key={bucket.id} style={{ display: 'contents' }}>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {bucket.groupLabel !== undefined
                  ? `${bucket.groupLabel} / ${bucket.label}`
                  : bucket.label}
              </span>
              <span
                style={{
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {formatBucket(bucket, t('providerUsage.available'))}
              </span>
            </div>
          ))}
          {snapshot.metrics.map((metric) => (
            <div key={metric.id} style={{ display: 'contents' }}>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {metric.label}
              </span>
              <span
                style={{
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {formatMetric(metric)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatBucket(bucket: UsageBucket, availableLabel: string): string {
  if (bucket.unit === 'percent' && bucket.remaining !== undefined) {
    const reset = bucket.resetsAt !== undefined ? ` / ${formatReset(bucket.resetsAt)}` : '';
    return `${Math.round(bucket.remaining)}%${reset}`;
  }
  if (bucket.unit === 'currency') {
    return `${bucket.currency === 'CNY' ? 'CNY ' : '$'}${formatAmount(bucket.remaining ?? bucket.limit)}`;
  }
  if (bucket.remaining !== undefined && bucket.limit !== undefined) {
    return `${formatAmount(bucket.remaining)} / ${formatAmount(bucket.limit)}`;
  }
  return bucket.period ?? availableLabel;
}

function formatMetric(metric: UsageMetric): string {
  if (metric.unit === 'currency')
    return `${metric.currency === 'CNY' ? 'CNY ' : '$'}${metric.value}`;
  return String(metric.value);
}

function formatAmount(value: number | undefined): string {
  return value === undefined ? '-' : Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatReset(seconds: number): string {
  return new Date(seconds * 1_000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
