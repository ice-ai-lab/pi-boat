import type { Usage } from '@ice-ai/protocol';
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatMoney, useCurrency } from '../currency/currency-provider';
import { useI18n } from '../i18n/i18n-provider';
import styles from './usage-pills.module.css';

/**
 * 每轮用量展示（每条用户消息触发的整段 trace 收口后出现在回答下方）：
 * 费用 / Tokens（ⓘ 上弹「Token 消耗明细」浮层）/ 耗时 三个胶囊——替代旧
 * `in N · out N · cache R N` 单行（用户 2026-10-05 指定参考截图样式）。
 *
 * 数据口径（`Turn.usage`）：轮内**全部** assistant 消息（每次 LLM 调用）的累计
 * （combineUsage），含 reasoning 思考 token 细分——不是最后一次调用的快照。
 * 明细分组：输入侧 = 缓存命中 + 缓存未命中（未缓存输入）+ 缓存写入；
 * 输出侧 = 思考过程（reasoning，provider 未上报时不显示该行）+ 回复内容；
 * 命中率 = cacheRead / (input + cacheRead + cacheWrite)，与 SessionInfoPopover 同口径。
 */

const ICON_ATTRS = {
  width: 12,
  height: 12,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_ATTRS} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M15 8.5c-.7-1-1.8-1.5-3-1.5-1.7 0-3 .9-3 2.5 0 3 6 1.5 6 4.5 0 1.6-1.3 2.5-3 2.5-1.2 0-2.3-.5-3-1.5" />
      <path d="M12 5v2M12 17v2" />
    </svg>
  );
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_ATTRS} aria-hidden="true" className={className}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_ATTRS} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_ATTRS} aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg {...ICON_ATTRS} aria-hidden="true" className={className}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

/** 「9m 8s / 42s」式短耗时（轮耗时动辄数分钟，毫秒档没有意义） */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

/** 明细浮层里的一行：标签（可带色点）贴左、数值贴右 */
function DetailLine({
  dotClass,
  label,
  value,
  main,
  sub,
}: {
  /** 色点样式类；不给则按无点行处理（思考/回复） */
  dotClass?: string;
  label: string;
  value: string;
  /** 主行（输入/输出）：加重 */
  main?: boolean;
  /** 子行：缩进 */
  sub?: boolean;
}) {
  const lineClass = [
    styles.line,
    main === true ? styles.lineMain : '',
    sub === true ? styles.sub : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={lineClass}>
      <span className={styles.lineLabel}>
        {dotClass !== undefined ? (
          <i aria-hidden="true" className={`${styles.dot} ${dotClass}`} />
        ) : null}
        {label}
      </span>
      <span className={styles.lineValue}>{value}</span>
    </div>
  );
}

function UsageDetailPopover({
  usage,
  total,
  dropUp,
}: {
  usage: Usage;
  total: number;
  /** 上方空间够时向上弹（参考截图方向）；不够（早期短轮次）向下 */
  dropUp: boolean;
}) {
  const { t, locale } = useI18n();

  const fmt = (n: number): string => n.toLocaleString(locale);
  // 「输入」= 全部输入类 token（命中 + 未命中 + 写入）；命中率与 SessionInfoPopover 同口径
  const inputSide = usage.input + usage.cacheRead + usage.cacheWrite;
  const hitPct = inputSide > 0 ? (usage.cacheRead / inputSide) * 100 : 0;
  const writePct = inputSide > 0 ? (usage.cacheWrite / inputSide) * 100 : 0;
  const missPct = Math.max(0, 100 - hitPct - writePct);
  const reasoning = usage.reasoning;
  const answer = reasoning !== undefined ? Math.max(0, usage.output - reasoning) : usage.output;

  return (
    <div
      className={`${styles.pop} ${dropUp ? styles.popUp : styles.popDown}`}
      role="dialog"
      aria-label={t('usage.detailTitle')}
    >
      <div className={styles.head}>
        <span className={styles.title}>{t('usage.detailTitle')}</span>
        <span className={styles.total}>
          {t('usage.grandTotal')}
          <b>{total.toLocaleString(locale)}</b>
        </span>
      </div>
      <DetailLine dotClass={styles.dotInput} label={t('usage.input')} value={fmt(inputSide)} main />
      <DetailLine
        dotClass={styles.dotHit}
        label={t('usage.cacheHit')}
        value={fmt(usage.cacheRead)}
        sub
      />
      <DetailLine
        dotClass={styles.dotMiss}
        label={t('usage.cacheMiss')}
        value={fmt(usage.input)}
        sub
      />
      <DetailLine
        dotClass={styles.dotWrite}
        label={t('usage.cacheWrite')}
        value={fmt(usage.cacheWrite)}
        sub
      />
      <div className={styles.sep} aria-hidden="true" />
      <DetailLine
        dotClass={styles.dotOutput}
        label={t('usage.output')}
        value={fmt(usage.output)}
        main
      />
      {reasoning !== undefined && (
        <DetailLine label={t('usage.thinking')} value={fmt(reasoning)} sub />
      )}
      <DetailLine label={t('usage.answer')} value={fmt(answer)} sub />
      <div className={styles.sep} aria-hidden="true" />
      <div className={styles.rateRow}>
        <BoltIcon className={styles.bolt} />
        {t('usage.cacheHitRate')}
        <b className={styles.rate}>{hitPct.toFixed(1)}%</b>
      </div>
      <div className={styles.bar} role="img" aria-label={t('usage.cacheHitRate')}>
        <i className={styles.barHit} style={{ width: `${hitPct}%` }} />
        <i className={styles.barWrite} style={{ width: `${writePct}%` }} />
        <i className={styles.barMiss} style={{ width: `${missPct}%` }} />
      </div>
      <div className={styles.legend}>
        <span>
          <i aria-hidden="true" className={`${styles.dot} ${styles.dotHit}`} />
          {t('usage.legendHit')}
        </span>
        <span>
          <i aria-hidden="true" className={`${styles.dot} ${styles.dotWrite}`} />
          {t('usage.legendWrite')}
        </span>
        <span>
          <i aria-hidden="true" className={`${styles.dot} ${styles.dotMiss}`} />
          {t('usage.legendMiss')}
        </span>
      </div>
    </div>
  );
}

/**
 * 胶囊弹窗的开合 + 弹向（费用/Tokens 两个胶囊共用）。
 * 点外 / Esc 关闭；判定锚在胶囊+浮层的**共同容器**上：只判浮层自身的话，
 * 再点一次同个胶囊会「先关（mousedown）后开（click）」，看起来关不掉。
 * 弹向默认向上；消息滚动容器（data-chat-scroll）上方装不下时改向下——
 * 绝对定位元素超出滚动容器的上/左边界会被裁掉且滚不到，向下至少还能滚到。
 */
function useAnchorPopover() {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(true);
  const anchorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const scroller = anchor?.closest('[data-chat-scroll]');
    if (anchor === null || !(scroller instanceof HTMLElement)) return;
    const spaceAbove = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    setDropUp(spaceAbove >= 440);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, anchorRef, dropUp };
}

/** 费用口径小浮层：估算说明 + 换算时附 USD 原值与汇率来源 */
function CostHintPopover({ cost, dropUp }: { cost: number; dropUp: boolean }) {
  const { t, locale } = useI18n();
  const { currency, rates } = useCurrency();
  const converted = currency !== 'USD' && rates !== null;
  return (
    <div
      className={`${styles.pop} ${styles.popSm} ${dropUp ? styles.popUp : styles.popDown}`}
      role="dialog"
      aria-label={t('usage.costHintTitle')}
    >
      <div className={styles.head}>
        <span className={styles.title}>{t('usage.costHintTitle')}</span>
      </div>
      <p className={styles.hint}>{t('usage.costEstimateHint')}</p>
      {/* 选了非 USD 但汇率没取到（离线/上游全挂）：明示回落 USD，不让用户猜 */}
      {currency !== 'USD' && rates === null && (
        <p className={styles.hint}>{t('usage.fxUnavailable')}</p>
      )}
      {converted && (
        <>
          <div className={styles.sep} aria-hidden="true" />
          <DetailLine
            label={t('usage.costUsdOriginal')}
            value={formatMoney(cost, { currency: 'USD', rates: null }, locale)}
          />
          <DetailLine label={t('usage.costRate')} value={`ECB ${rates.date}`} />
        </>
      )}
    </div>
  );
}

/** 每轮用量胶囊行：费用（点击看口径）/ Tokens（ⓘ 上弹明细浮层）/ 耗时 */
export function UsageLine({
  usage,
  durationMs,
}: {
  usage: Usage;
  /** 轮耗时（endedAt − user.at）；未知（旧数据缺 endedAt）不给 */
  durationMs: number | null;
}) {
  const { t, locale } = useI18n();
  const { currency, rates } = useCurrency();
  const costPop = useAnchorPopover();
  const tokensPop = useAnchorPopover();
  const cost = usage.cost.total;
  const costText = formatMoney(cost, { currency, rates }, locale);
  let duration: ReactNode = null;
  if (durationMs !== null && durationMs > 0) duration = formatDuration(durationMs);

  return (
    <div className={styles.row}>
      <span className={styles.anchor} ref={costPop.anchorRef}>
        <button
          type="button"
          className={`${styles.pill} ${styles.pillButton}`}
          aria-expanded={costPop.open}
          onClick={() => costPop.setOpen((value) => !value)}
        >
          <DollarIcon className={styles.pillIcon} />
          {t('usage.cost')}
          <b className={styles.pillValue}>{costText}</b>
        </button>
        {costPop.open && <CostHintPopover cost={cost} dropUp={costPop.dropUp} />}
      </span>
      <span className={styles.anchor} ref={tokensPop.anchorRef}>
        <button
          type="button"
          className={`${styles.pill} ${styles.pillButton}`}
          aria-expanded={tokensPop.open}
          onClick={() => tokensPop.setOpen((value) => !value)}
        >
          <DatabaseIcon className={styles.pillIcon} />
          {'Tokens'}
          <b className={styles.pillValue}>{usage.totalTokens.toLocaleString(locale)}</b>
          <InfoIcon className={styles.infoIcon} />
        </button>
        {tokensPop.open && (
          <UsageDetailPopover usage={usage} total={usage.totalTokens} dropUp={tokensPop.dropUp} />
        )}
      </span>
      {duration !== null && (
        <span className={styles.pill}>
          <ClockIcon className={styles.pillIcon} />
          {t('usage.duration')}
          <b className={styles.pillValue}>{duration}</b>
        </span>
      )}
    </div>
  );
}
