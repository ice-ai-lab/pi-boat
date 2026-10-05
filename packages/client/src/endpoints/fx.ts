import type { FxRatesResponse } from '@ice-ai/protocol';
import { http } from '../http';

/**
 * 汇率端点（docs/02 §6.5）：费用显示币种的换算表。
 * 联网纪律同 models/usage——前提是用户显式选了非 USD 展示币种；server 侧有
 * 12h 缓存限频，客户端拿到后由 CurrencyProvider 会话内复用，不反复请求。
 */

/** POST /api/fx/rates —— USD 基准汇率（欧洲央行参考汇率，server 缓存 12h） */
export function fetchFxRates(): Promise<FxRatesResponse> {
  return http.post<FxRatesResponse>('/fx/rates', {}).then((res) => res.data);
}
