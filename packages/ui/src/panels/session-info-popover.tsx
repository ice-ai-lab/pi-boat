import type { ContextUsage, SessionStatsInfo } from '@ice-ai/protocol';
import { Fragment } from 'react';
import { formatMoney, useCurrency } from '../currency/currency-provider';
import { useI18n } from '../i18n/i18n-provider';
import styles from './session-info-popover.module.css';

/**
 * 会话统计浮层（输入卡下方指标行的上拉面板）：参考卡形态
 * （docs/design/piboat-ui-redesign-v3.html `#statsMenu`）——
 * 图标标题「会话统计」+ 发丝线 + 两段指标（消息 / Token）。
 * - 「性能」列已去掉（用户 2026-09-28；原型里那一列含轮·步 / 模型用时 / 工具调用用时 / 输出速度）。
 * - Token 段：未缓存读取 / 缓存读取 / 输出 / 总计（+ 费用 / 上下文 / 平均缓存命中率）；
 *   不展示缓存写入（用户 2026-09-28 指定）。
 * 行内标签贴左、数值贴右（等宽数字、超长省略）；版面照原型 `.stats-*`，材质走 --glass-pop*，
 * 映射表见 module.css 抬头。
 */
export interface SessionInfoPopoverProps {
  stats: SessionStatsInfo | null;
  contextUsage: ContextUsage | null;
}

function formatCompact(n: number): string {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${(n / 1000).toFixed(0)}k`
      : String(n);
}

/** 仪表盘图标（原型 sprite `#i-gauge`，13px / stroke 1.7，色用 faint） */
function GaugeIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.titleIcon}
    >
      <path d="M4 17a9 9 0 1 1 16 0" />
      <path d="m12 17 4-5" />
      <circle cx="12" cy="17" r="1.4" />
    </svg>
  );
}

/** 统计行：strong = 总计行（dt/dd 同加强调，设计 `.is-em`）；title = 悬停口径说明 */
interface StatRow {
  label: string;
  value: string;
  strong?: boolean;
  title?: string;
}

/** 一段指标（menu-label + dl.metrics）：dt 贴左、dd 贴右 */
function statSection(label: string, rows: StatRow[]) {
  return (
    <section className={styles.sec}>
      <div className={styles.label}>{label}</div>
      <dl className={styles.metrics}>
        {rows.map((row) => (
          <Fragment key={`${label}:${row.label}`}>
            <dt className={row.strong === true ? `${styles.dt} ${styles.em}` : styles.dt}>
              {row.label}
            </dt>
            <dd
              className={row.strong === true ? `${styles.dd} ${styles.em}` : styles.dd}
              title={row.title}
            >
              {row.value}
            </dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

function PopoverBody({
  stats,
  contextUsage,
  locale,
}: {
  stats: SessionStatsInfo;
  contextUsage: ContextUsage | null;
  locale: string;
}) {
  const { t } = useI18n();
  const { currency, rates } = useCurrency();
  const messageRows: StatRow[] = [
    { label: t('session.user'), value: stats.userMessages.toLocaleString(locale) },
    { label: t('session.assistant'), value: stats.assistantMessages.toLocaleString(locale) },
    { label: t('session.toolCalls'), value: stats.toolCalls.toLocaleString(locale) },
    { label: t('session.toolResults'), value: stats.toolResults.toLocaleString(locale) },
    { label: t('session.total'), value: stats.totalMessages.toLocaleString(locale), strong: true },
  ];
  // 缓存写入不展示（用户 2026-09-28 指定）；「输入」改名「未缓存读取」，放在缓存读取上方
  const tokenRows: StatRow[] = [
    { label: t('session.inputUncached'), value: stats.tokens.input.toLocaleString(locale) },
    { label: t('session.cacheRead'), value: stats.tokens.cacheRead.toLocaleString(locale) },
    { label: t('session.output'), value: stats.tokens.output.toLocaleString(locale) },
    { label: t('session.total'), value: stats.tokens.total.toLocaleString(locale), strong: true },
  ];
  const ctx = contextUsage ?? stats.contextUsage ?? null;
  if (stats.cost > 0) {
    // 金额是 SDK 按模型目录费率算好的 USD（docs/06 §3：本仓不换汇）；选了其他币种时
    // 仅在显示层换算（CurrencyProvider），hover 标注估算口径
    const costHint =
      currency !== 'USD' && rates !== null
        ? `${t('usage.costEstimateHint')}\n${t('usage.fxRateHint', { date: rates.date })}`
        : t('usage.costEstimateHint');
    tokenRows.push({
      label: t('session.cost'),
      value: formatMoney(stats.cost, { currency, rates }, locale),
      title: costHint,
    });
  }
  if (ctx?.contextWindow) {
    tokenRows.push({
      label: t('session.context'),
      value: `${ctx.percent !== null ? `${ctx.percent.toFixed(1)}%` : '?'} / ${formatCompact(ctx.contextWindow)}`,
    });
  }
  // Cache hit rate = cache reads / (input + cache writes + cache reads) —— 分母覆盖全部输入类 token
  if (
    stats.tokens.cacheRead + stats.tokens.cacheWrite > 0 &&
    stats.tokens.cacheRead + stats.tokens.cacheWrite + stats.tokens.input > 0
  ) {
    tokenRows.push({
      label: t('session.cacheHitRate'),
      value: `${(
        (stats.tokens.cacheRead /
          (stats.tokens.cacheRead + stats.tokens.cacheWrite + stats.tokens.input)) *
          100
      ).toFixed(1)}%`,
    });
  }

  return (
    <div className={styles.grid}>
      {statSection(t('session.messages'), messageRows)}
      {statSection(t('session.tokens'), tokenRows)}
    </div>
  );
}

export function SessionInfoPopover({ stats, contextUsage }: SessionInfoPopoverProps) {
  const { t, locale } = useI18n();

  if (!stats) {
    return (
      <div className={styles.popover}>
        <div className={styles.head}>
          <span className={styles.title}>
            <GaugeIcon />
            {t('session.statsTitle')}
          </span>
        </div>
        <div className={styles.rule} aria-hidden="true" />
        <div className={styles.empty}>{t('session.load')}</div>
      </div>
    );
  }

  return (
    <div className={styles.popover}>
      <div className={styles.head}>
        <span className={styles.title}>
          <GaugeIcon />
          {t('session.statsTitle')}
        </span>
      </div>
      <div className={styles.rule} aria-hidden="true" />
      <PopoverBody stats={stats} contextUsage={contextUsage} locale={locale} />
    </div>
  );
}
