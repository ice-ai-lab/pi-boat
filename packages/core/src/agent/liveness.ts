import { createECDH } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { AgentSessionService } from '../agent/agent-session-service';

/**
 * liveness lease 与 idle 回收（docs/01 §5.6、docs/02 §7；G2-12）。
 *
 * 为什么需要：会话 runtime 会常驻（模型客户端、扩展、文件句柄、内存里的历史）。
 * 一个"开了 20 个标签页"的用户会让 server 长时间持有 20 份 runtime。
 *
 * 两条独立判据（**都要满足**才回收）：
 * 1. **没有观看者**：SSE 订阅数为 0 且 lease 已过期
 * 2. **没有在跑**：`isStreaming` / `isPromptRunning` 都为假
 *
 * 为什么 lease 与"有没有订阅"是两个判据：断网的标签页会留一条 ESTABLISHED 连接
 * 很久（中间层要等 TCP keepalive 超时），所以"连接还在"不是"有人看"的可靠证据；
 * 反过来只有订阅没有 lease 也是正常态（客户端还没开始续）。取两者**并集**为
 * "有人看"，宁可不回收也不误杀正在看的会话。
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

  /** 续租（POST /api/agent/:id/lease）。返回会话当时是否在注册表里 */
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

// ---------------------------------------------------------------------------
// Web Push（G2-13）
// ---------------------------------------------------------------------------

interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale?: string;
  createdAt: string;
}

export interface PushServiceOptions {
  /**
   * 持久化目录（缺省 `~/.pi/agent`）。
   * 默认值在 **core 内**解析：server 不得直接 import pi SDK（AGENTS 的依赖铁律）。
   */
  agentDir?: string;
  /** VAPID 联系邮箱（推送服务要求，出问题时会用它联系你） */
  contact?: string;
}

/**
 * Web Push 的订阅侧（config / subscribe）与投递侧（deliver）。
 *
 * **投递依赖可选包 `web-push`**：AES128GCM 的载荷加密与 VAPID 签名是几百行
 * 密码学代码，自己实现等于把用户的通知安全押在自研加密上，不值当。因此：
 * - `web-push` 在**没装**的情况下服务仍可跑：`GET /api/push/config` 回
 *   `{enabled:false, reason:'web-push-not-installed'}`，前端据此隐藏开关
 * - 装了即自动启用（动态 import，不引入硬依赖）
 *
 * VAPID 密钥对用 `node:crypto` 的 P-256 ECDH 现生成并与订阅一起落盘：
 * 生成不需要任何第三方包，而**私钥必须与已发出的订阅配对**（换了私钥，旧订阅
 * 全部失效），所以它与订阅存同一个目录、同一个生命周期。
 */
export class PushService {
  private readonly agentDir: string;
  private readonly contact: string;
  private subscriptions: Map<string, StoredSubscription> | null = null;
  private vapid: { publicKey: string; privateKey: string } | null | undefined;

  constructor(options: PushServiceOptions = {}) {
    this.agentDir = options.agentDir ?? getAgentDir();
    this.contact = options.contact ?? 'mailto:piboat@localhost';
  }

  private get subscriptionsPath(): string {
    return join(this.agentDir, 'push-subscriptions.json');
  }

  private get vapidPath(): string {
    return join(this.agentDir, 'push-vapid.json');
  }

  /** VAPID 公钥；`enabled:false` 时 publicKey 为 null */
  async config(): Promise<{ publicKey: string | null; enabled: boolean; reason?: string }> {
    if (!(await isWebPushAvailable())) {
      return { publicKey: null, enabled: false, reason: 'web-push-not-installed' };
    }
    const keys = this.loadVapid();
    if (keys === null) {
      return { publicKey: null, enabled: false, reason: 'vapid-unavailable' };
    }
    return { publicKey: keys.publicKey, enabled: true };
  }

  /** 按 endpoint upsert；返回是否新建 */
  subscribe(input: {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    locale?: string;
  }): boolean {
    const store = this.loadSubscriptions();
    const existing = store.has(input.subscription.endpoint);
    store.set(input.subscription.endpoint, {
      endpoint: input.subscription.endpoint,
      keys: input.subscription.keys,
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      createdAt: new Date().toISOString(),
    });
    this.persistSubscriptions(store);
    return !existing;
  }

  get subscriptionCount(): number {
    return this.loadSubscriptions().size;
  }

  /**
   * 投递一条通知给全部订阅者。
   *
   * 失效订阅（404/410）要**删掉**：浏览器卸载后 endpoint 永久失效，留着会让每次
   * 投递都白跑一轮网络请求。
   */
  async deliver(payload: {
    title: string;
    body: string;
    sessionId?: string;
  }): Promise<{ sent: number; removed: number; reason?: string }> {
    const store = this.loadSubscriptions();
    if (store.size === 0) return { sent: 0, removed: 0, reason: 'no-subscribers' };
    const keys = this.loadVapid();
    if (keys === null) return { sent: 0, removed: 0, reason: 'vapid-unavailable' };

    const webpush = await importWebPush();
    if (webpush === null) return { sent: 0, removed: 0, reason: 'web-push-not-installed' };

    webpush.setVapidDetails(this.contact, keys.publicKey, keys.privateKey);
    let sent = 0;
    let removed = 0;
    for (const [endpoint, subscription] of [...store]) {
      try {
        await webpush.sendNotification(
          { endpoint, keys: subscription.keys },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          store.delete(endpoint);
          removed += 1;
        } else {
          console.error('[core] push delivery failed:', endpoint, error);
        }
      }
    }
    if (removed > 0) this.persistSubscriptions(store);
    return { sent, removed };
  }

  // ------------------------------------------------------------------
  // 落盘
  // ------------------------------------------------------------------

  private loadSubscriptions(): Map<string, StoredSubscription> {
    if (this.subscriptions !== null) return this.subscriptions;
    const store = new Map<string, StoredSubscription>();
    if (existsSync(this.subscriptionsPath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(this.subscriptionsPath, 'utf8'));
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const record = entry as StoredSubscription;
            if (typeof record?.endpoint === 'string') store.set(record.endpoint, record);
          }
        }
      } catch (error) {
        console.error('[core] push subscriptions unreadable:', error);
      }
    }
    this.subscriptions = store;
    return store;
  }

  private persistSubscriptions(store: Map<string, StoredSubscription>): void {
    mkdirSync(dirname(this.subscriptionsPath), { recursive: true, mode: 0o700 });
    // 0600：p256dh/auth 是投递凭据，等同于"能给你这个浏览器发通知"的能力
    writeFileSync(this.subscriptionsPath, JSON.stringify([...store.values()], null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  private loadVapid(): { publicKey: string; privateKey: string } | null {
    if (this.vapid !== undefined) return this.vapid;
    if (existsSync(this.vapidPath)) {
      try {
        const parsed = JSON.parse(readFileSync(this.vapidPath, 'utf8')) as {
          publicKey?: string;
          privateKey?: string;
        };
        if (typeof parsed.publicKey === 'string' && typeof parsed.privateKey === 'string') {
          this.vapid = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
          return this.vapid;
        }
      } catch (error) {
        console.error('[core] vapid keys unreadable:', error);
      }
    }
    try {
      const ecdh = createECDH('prime256v1');
      ecdh.generateKeys();
      const keys = {
        // VAPID 的未压缩点格式（0x04 前缀）就是 web-push 期望的公钥格式
        publicKey: base64Url(ecdh.getPublicKey()),
        privateKey: base64Url(ecdh.getPrivateKey()),
      };
      mkdirSync(dirname(this.vapidPath), { recursive: true, mode: 0o700 });
      writeFileSync(this.vapidPath, JSON.stringify({ ...keys, contact: this.contact }, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      this.vapid = keys;
      return keys;
    } catch (error) {
      console.error('[core] failed to generate VAPID keys:', error);
      this.vapid = null;
      return null;
    }
  }
}

function base64Url(data: Buffer): string {
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface WebPushModule {
  setVapidDetails(contact: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ): Promise<unknown>;
}

/**
 * 动态探测 `web-push` 是否可用。
 * 用 `import()` 而不是顶层 import：未安装时**不能**让整个 server 起不来——
 * 推送是可选能力，缺它只该关掉开关。
 */
async function importWebPush(): Promise<WebPushModule | null> {
  try {
    // 非字面量 specifier：TS 不会去解析 `web-push` 的类型（它是可选依赖，
    // 未安装时也不该让本仓编译失败），运行时才真正 import
    const specifier = 'web-push';
    const mod = (await import(specifier)) as unknown as WebPushModule | { default: WebPushModule };
    const resolved = 'default' in mod ? mod.default : mod;
    return typeof resolved?.sendNotification === 'function' ? resolved : null;
  } catch {
    return null;
  }
}

async function isWebPushAvailable(): Promise<boolean> {
  return (await importWebPush()) !== null;
}

/** 通知文案（服务端生成，避免前端错过事件时拿不到内容） */
export function buildCompletionNotification(input: {
  sessionName?: string;
  sessionId: string;
  firstMessage?: string;
}): { title: string; body: string; sessionId: string } {
  const title = input.sessionName ?? 'pi-boat';
  const body =
    input.firstMessage === undefined || input.firstMessage === ''
      ? `会话 ${input.sessionId.slice(0, 8)} 已完成`
      : `已完成：${input.firstMessage.slice(0, 80)}`;
  return { title, body, sessionId: input.sessionId };
}
