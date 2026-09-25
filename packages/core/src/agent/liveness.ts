import type { AgentSessionService } from '../agent/agent-session-service';

/**
 * liveness lease 与 idle 回收（docs/01 §5.6、docs/02 §7；G2-12）。
 *
 * ## 解决什么问题
 *
 * 会话的 runtime 是**常驻**对象：模型客户端、扩展、文件句柄、内存里的完整历史。
 * 一个「开了 20 个标签页」的用户会让 server 长时间持有 20 份 runtime，而其中
 * 大多数早就没人看了。本文件负责把它们收掉——**回收 = `disposeSession`，内存态
 * 全丢，用户再打开时从 `.jsonl` 重建**（ADR-0013 的 resume 路径）。
 *
 * ## 判据：怎么算「没人要了」
 *
 * 回收前必须两个条件**同时**成立，缺一不动手（宁可不回收也不误杀）：
 *
 * 1. **没有观看者** ← 由本文件判定（下方 `reap()`）
 * 2. **没有在跑**（`isStreaming` / `isPromptRunning` 都为假）← 由调用方查 runtime
 *
 * 第 1 条又由**两个信号并联**得出，任一为真就算「有人看」：
 *
 * | 信号 | 谁提供 | 覆盖的场景 |
 * |---|---|---|
 * | lease 未过期 | 客户端 `POST /api/agent/:id/lease` 心跳（60s 续 / 180s 过期） | 连接刚断、正在重连；浏览器睡眠但标签页还在 |
 * | SSE 订阅数 > 0 | server 的 SSE 注册表（`sse.ts` 的 `activeStreamCount`） | 正常观看中；多标签页看同一会话（计数，不是布尔） |
 *
 * 为什么不能只留一个：
 * - 只看订阅 → 断网的标签页会留一条 ESTABLISHED 连接很久（中间层要等 TCP keepalive
 *   超时），「连接还在」≠「有人看」，会话永远收不掉。
 * - 只看 lease → 客户端还没开始续租的窗口期（刚建流）会被误杀。
 *
 * ## 一次完整流程
 *
 * ```
 * 用户打开标签页
 *   → GET /api/agent/:id/events        SSE 订阅数 +1，开始观看
 *   → 每 60s POST /api/agent/:id/lease lease 续到 now+180s
 *
 * 用户关掉标签页
 *   → SSE abort                       订阅数 -1（多标签页要减到 0）
 *   → 心跳停止                        lease 最多 180s 后过期
 *
 * 定时器每 60s 扫一轮（start()）
 *   → 订阅数 0 且 lease 过期            → 看第 2 条判据
 *   → 不在跑                            → 回收，runtime 释放
 *   → 在跑                              → 留着（回收会丢流，与 ADR-0013b 同一取舍）
 *
 * 用户再打开这个标签页
 *   → POST /api/agent/:id/resume       从 .jsonl 重建 runtime（工具选择也一并读回）
 * ```
 *
 * `renew()` 返回 false 是**正常结果**（会话已被回收 / 服务重启过），不是 404——
 * 客户端据此决定要不要显式 resume（docs/04 §4）。
 */

/** lease 有效期：前端续租间隔应显著小于它（默认 60s 续 / 180s 过期） */
export const DEFAULT_LEASE_TTL_MS = 180_000;
/** idle 判定周期 */
export const DEFAULT_REAP_INTERVAL_MS = 60_000;

export interface LivenessOptions {
  agentService: AgentSessionService;
  leaseTtlMs?: number;
  reapIntervalMs?: number;
  /** 回收回调（默认 disposeSession('idle')）；测试注入以断言 */
  onReap?: (sessionId: string) => void;
  /** 订阅数查询（默认恒 0；server 用 SSE 注册表注入真实值） */
  subscriberCount?: (sessionId: string) => number;
}

export class LivenessRegistry {
  private readonly agentService: AgentSessionService;
  private readonly leaseTtlMs: number;
  private readonly reapIntervalMs: number;
  private readonly onReap: (sessionId: string) => void;
  private readonly subscriberCount: (sessionId: string) => number;
  /** sessionId → lease 到期时间戳 */
  private readonly leases = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: LivenessOptions) {
    this.agentService = options.agentService;
    this.leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.reapIntervalMs = options.reapIntervalMs ?? DEFAULT_REAP_INTERVAL_MS;
    this.subscriberCount = options.subscriberCount ?? (() => 0);
    this.onReap =
      options.onReap ?? ((sessionId) => this.agentService.disposeSession(sessionId, 'idle'));
  }

  /**
   * 续租（`POST /api/agent/:id/lease`）。
   * @returns 会话当时是否在注册表里；false = 已被回收，客户端应显式 resume
   */
  renew(sessionId: string): boolean {
    if (!this.agentService.isRunning(sessionId)) return false;
    this.leases.set(sessionId, Date.now() + this.leaseTtlMs);
    return true;
  }

  /** 主动放弃（会话销毁时清账，避免 Map 随回收变慢而长期增长） */
  clear(sessionId: string): void {
    this.leases.delete(sessionId);
  }

  /** 扫一轮：回收满足两条判据的会话；返回被回收的 id（便于测试与日志） */
  reap(now = Date.now()): string[] {
    const reaped: string[] = [];
    for (const sessionId of this.agentService.runningSessionIds()) {
      const leaseExpiry = this.leases.get(sessionId);
      const leaseActive = leaseExpiry !== undefined && leaseExpiry > now;
      const watched = leaseActive || this.subscriberCount(sessionId) > 0;
      if (watched) continue;
      const state = this.agentService.getRunningState(sessionId);
      if (!state.running) continue;
      // 在跑的一律留着：回收正在跑的会话会丢流（与 ADR-0013b 同一取舍）
      if (state.state.isStreaming || state.state.isPromptRunning) continue;
      this.leases.delete(sessionId);
      this.onReap(sessionId);
      reaped.push(sessionId);
    }
    return reaped;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      try {
        const reaped = this.reap();
        if (reaped.length > 0) {
          console.log(`[core] idle reaped ${reaped.length} session(s): ${reaped.join(', ')}`);
        }
      } catch (error) {
        console.error('[core] idle reap failed:', error);
      }
    }, this.reapIntervalMs);
    // 不要因为这个定时器把进程钉住：关停路径自己会 disposeAll
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
