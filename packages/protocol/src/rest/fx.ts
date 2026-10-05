/**
 * 汇率（docs/02 §6.5）：费用展示的多币种换算。
 *
 * 口径：模型费用（SDK 按目录费率算好的 **USD**）是唯一事实；其他币种只是
 * **显示层换算**（client 拿汇率乘一下），不落盘、不进会话文件。
 */

/** POST /api/fx/rates 响应 —— USD 基准汇率表（欧洲央行参考汇率，server 内存缓存 12h） */
export interface FxRatesResponse {
  base: 'USD';
  /** `rates.CNY` = 1 USD 兑 CNY 数 */
  rates: Record<string, number>;
  /** 上游汇率日期（ECB 参考汇率日 `YYYY-MM-DD`，不是请求时刻） */
  date: string;
}
