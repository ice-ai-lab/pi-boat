import type { FxRatesResponse } from '@ice-ai/protocol';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * 费用显示币种（设置 → 常规）：USD 是唯一事实（SDK 按目录费率算好的金额），
 * 其他币种只是**显示层换算**——不落盘、不进会话文件。
 *
 * - 币种选择存 localStorage（`pi-currency`），与界面语言（`pi-locale`）同一套约定；
 * - 汇率由**宿主注入的 `fetchRates`** 取（ui 不取数边界不变，同 ProviderUsageSummary
 *   的 onQuery）；只在用户选了非 USD 时才取，一次会话取一份用到底（server 侧还有 12h 缓存）；
 * - 取不到汇率（离线 / 上游挂）静默回落 USD —— 不编一个换算值出来。
 */

export const SUPPORTED_CURRENCIES = ['USD', 'CNY', 'JPY', 'EUR', 'HKD', 'GBP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

const STORAGE_KEY = 'pi-currency';

interface CurrencyContextValue {
  currency: Currency;
  setCurrency(currency: Currency): void;
  /** 非 USD 且已取到时非空；USD 或取数失败为 null（显示层回落 USD） */
  rates: FxRatesResponse | null;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

/** Provider 外的兑底（宿主忘包时不该崩掉整个聊天）：USD 直出、设置无处生效 */
const DEFAULT_CURRENCY_CONTEXT: CurrencyContextValue = {
  currency: 'USD',
  setCurrency: () => {
    // 无 Provider 可写入；仅在宿主未挂 CurrencyProvider 时可达
  },
  rates: null,
};

function readStoredCurrency(): Currency {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null && (SUPPORTED_CURRENCIES as readonly string[]).includes(stored)) {
      return stored as Currency;
    }
  } catch {
    // 隐私模式或存储不可用时用默认 USD
  }
  return 'USD';
}

export function CurrencyProvider({
  fetchRates,
  children,
}: {
  /** 宿主注入的取数回调（POST /api/fx/rates）；取失败可 reject，UI 回落 USD */
  fetchRates(): Promise<FxRatesResponse>;
  children: ReactNode;
}) {
  const [currency, setCurrencyState] = useState<Currency>(readStoredCurrency);
  const [rates, setRates] = useState<FxRatesResponse | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (currency === 'USD' || rates !== null || inFlightRef.current) return;
    inFlightRef.current = true;
    fetchRates()
      .then(setRates)
      .catch(() => {
        // 取不到就保持 USD 显示；下次切币种（effect 重跑）再试
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [currency, rates, fetchRates]);

  const setCurrency = useCallback((next: Currency) => {
    setCurrencyState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不进就只对本会话生效
    }
  }, []);

  const value = useMemo(() => ({ currency, setCurrency, rates }), [currency, setCurrency, rates]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext) ?? DEFAULT_CURRENCY_CONTEXT;
}

/**
 * USD 金额 → 显示字符串：非 USD 且有汇率时按 `Intl.NumberFormat` 换算成目标币种，
 * 否则原样显示 USD。小金额（< 0.01，单轮费用常态）给 4 位小数，否则 2 位。
 */
export function formatMoney(
  usd: number,
  ctx: { currency: Currency; rates: FxRatesResponse | null },
  locale: string,
): string {
  let amount = usd;
  let currency: Currency = 'USD';
  if (ctx.currency !== 'USD' && ctx.rates !== null) {
    const rate = ctx.rates.rates[ctx.currency];
    if (typeof rate === 'number' && rate > 0) {
      amount = usd * rate;
      currency = ctx.currency;
    }
  }
  const digits = amount > 0 && amount < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: digits,
  }).format(amount);
}

/** 币种符号（选项列表用）：CNY → `¥`；取不出符号回落代码本身 */
export function currencySymbol(currency: Currency, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}
