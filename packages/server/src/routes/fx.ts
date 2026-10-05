import type { FxRatesResponse } from '@ice-ai/protocol';
import type { Hono } from 'hono';

/**
 * 汇率路由（docs/02 §6.5）：给「费用显示币种」设置提供 USD 基准汇率。
 *
 * 新增路由检查清单（docs/04 §6）逐条对照：
 * ① 触碰文件系统 → 无（汇率只在内存，12h TTL）
 * ② 错误响应不泄漏内部路径/堆栈 → 上游失败回固定一句「FX rates unavailable」，
 *    真实原因进服务端日志
 * ③ 新增 Origin / Sec-Fetch 例外 → 无
 * ④ 有副作用的 GET → 无；按 models/usage 先例用 **POST**（联网查询不落盘，
 *    ADR-0007：鉴权无凭据，GET 不再有兜底）
 *
 * 联网纪律：上游（frankfurter.dev，欧洲央行参考汇率）只在**缓存未命中/过期**时
 * 访问，而取数这个动作的前提是用户在设置里显式选了非 USD 展示币种——与
 * models/usage「用户显式点击才联网」同一纪律；并发合并 + 12h 限频。
 * 汇率源不引入 API Key；取不到就 502，前端回落 USD 显示。
 */

/** 缓存有效期：ECB 参考汇率每个工作日更新一次，12h 足够新鲜 */
const RATES_TTL_MS = 12 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * 上游源按序回退：frankfurter（ECB）在部分网络环境不可达（2026-10-05 用户实测
 * 「币种设置后浮层还是 USD」的根因），所以补两个免 Key 镜像源——
 * ① jsDelivr CDN 的 @fawazahmed0/currency-api（CDN 在国内可达性较好）；
 * ② open.er-api.com。三家都是 USD 基准、日更，口径一致。
 */
const UPSTREAMS: readonly ((signal: AbortSignal) => Promise<unknown>)[] = [
  (signal) =>
    fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY,JPY,EUR,HKD,GBP', {
      signal,
    }).then((response) => {
      if (!response.ok) throw new Error(`frankfurter ${response.status}`);
      return response.json();
    }),
  (signal) =>
    fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
      {
        signal,
      },
    ).then((response) => {
      if (!response.ok) throw new Error(`jsdelivr ${response.status}`);
      return response.json();
    }),
  (signal) =>
    fetch('https://open.er-api.com/v6/latest/USD', { signal }).then((response) => {
      if (!response.ok) throw new Error(`er-api ${response.status}`);
      return response.json();
    }),
];

export type FxUpstreamSource = (signal: AbortSignal) => Promise<unknown>;

export interface FxRouteDeps {
  /** 源链注入（测试用）；缺省用 UPSTREAMS（frankfurter → jsDelivr → open.er-api） */
  sources?: readonly FxUpstreamSource[];
}

/** 校验并归一化三种上游形状 → `{ rates, date }`；不认识就抛错换下一个源 */
function parseUpstream(raw: unknown): { rates: Record<string, number>; date: string } {
  if (typeof raw !== 'object' || raw === null) throw new Error('unexpected upstream shape');
  const record = raw as { base?: unknown; date?: unknown; rates?: unknown; usd?: unknown };
  // 形状 ②（jsDelivr currency-api）：{ date, usd: { cny: 7.1, … } } —— 键是小写币种代码
  if (typeof record.usd === 'object' && record.usd !== null && typeof record.date === 'string') {
    const rates: Record<string, number> = {};
    for (const [code, rate] of Object.entries(record.usd)) {
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        rates[code.toUpperCase()] = rate;
      }
    }
    if (Object.keys(rates).length > 0) return { rates, date: record.date };
    throw new Error('empty rates');
  }
  // 形状 ①（frankfurter）/ ③（open.er-api）：{ base:'USD', date|time_last_update_utc, rates:{CNY:…} }
  if (record.base !== 'USD' || typeof record.rates !== 'object' || record.rates === null) {
    throw new Error('unexpected upstream shape');
  }
  const rates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(record.rates)) {
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) rates[code] = rate;
  }
  if (Object.keys(rates).length === 0) throw new Error('empty rates');
  // er-api 没有 date 字段，用更新时间（UTC 串截日期即可，仅展示用）
  const date =
    typeof record.date === 'string'
      ? record.date
      : String((record as { time_last_update_utc?: unknown }).time_last_update_utc ?? '')
          .slice(5, 16)
          .trim();
  return { rates, date };
}

export function registerFxRoutes(app: Hono, deps: FxRouteDeps = {}): void {
  // 缓存收在路由闭包里：server 单进程一份；测试里每个 app 各自独立，互不污染
  let cache: { response: FxRatesResponse; fetchedAt: number } | null = null;
  let inFlight: Promise<FxRatesResponse> | null = null;

  /** 缓存命中直接回；否则合并并发、逐源回退取数、校验、入缓存（全败抛给路由回 502） */
  async function getRates(): Promise<FxRatesResponse> {
    if (cache !== null && Date.now() - cache.fetchedAt < RATES_TTL_MS) return cache.response;
    if (inFlight !== null) return inFlight;
    const chain = deps.sources ?? UPSTREAMS;
    inFlight = (async () => {
      let lastError: unknown = new Error('no upstream configured');
      for (const source of chain) {
        try {
          const raw = await source(AbortSignal.timeout(UPSTREAM_TIMEOUT_MS));
          const parsed = parseUpstream(raw);
          const response: FxRatesResponse = { base: 'USD', ...parsed };
          cache = { response, fetchedAt: Date.now() };
          return response;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  // POST /api/fx/rates —— USD 基准汇率（联网，缓存 12h；前提见上方联网纪律）
  app.post('/api/fx/rates', async (c) => {
    try {
      return c.json(await getRates());
    } catch (error) {
      console.error('[server] fx rates fetch failed:', error);
      return c.json({ error: 'FX rates unavailable' }, 502);
    }
  });
}
