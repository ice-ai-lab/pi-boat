import type { Usage } from '@ice-ai/protocol';

/**
 * 累加两份 usage（fold / rebuild 共用）——轮级用量的**累计**口径。
 *
 * 一个轮（trace）里模型每停一次工具就是一条 assistant 消息（一次 LLM 调用），
 * 各带一份 usage；轮级展示要的是全部调用的合计，所以 message_end 时累加而不是
 * 覆盖（覆盖式只会剩下最后一次调用，数字被低估）。
 *
 * ⚠️ 手工对齐 SDK `usage-totals.js` 的 `combineUsage` 语义（该文件未从包根导出，
 * 且 client 依赖铁律禁止直接依赖 pi SDK）：input/output/cacheRead/cacheWrite/cost
 * 逐项求和；可选拆分（cacheWrite1h / reasoning）任一侧有值就保留、缺省侧按 0 计；
 * totalTokens 求和（SDK 口径 = input+output+cacheRead+cacheWrite）。字段变动由
 * stream.test.ts 的聚合用例锁住。
 */
export function combineUsage(acc: Usage | null, usage: Usage): Usage {
  if (acc === null) return usage;
  return {
    input: acc.input + usage.input,
    output: acc.output + usage.output,
    cacheRead: acc.cacheRead + usage.cacheRead,
    cacheWrite: acc.cacheWrite + usage.cacheWrite,
    ...(acc.cacheWrite1h !== undefined || usage.cacheWrite1h !== undefined
      ? { cacheWrite1h: (acc.cacheWrite1h ?? 0) + (usage.cacheWrite1h ?? 0) }
      : {}),
    ...(acc.reasoning !== undefined || usage.reasoning !== undefined
      ? { reasoning: (acc.reasoning ?? 0) + (usage.reasoning ?? 0) }
      : {}),
    totalTokens: acc.totalTokens + usage.totalTokens,
    cost: {
      input: acc.cost.input + usage.cost.input,
      output: acc.cost.output + usage.cost.output,
      cacheRead: acc.cost.cacheRead + usage.cost.cacheRead,
      cacheWrite: acc.cost.cacheWrite + usage.cost.cacheWrite,
      total: acc.cost.total + usage.cost.total,
    },
  };
}
