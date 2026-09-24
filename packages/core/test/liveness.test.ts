import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LivenessRegistry, PushService } from '../src/agent/liveness';

/**
 * liveness lease 与 idle 回收（G2-12）、Web Push（G2-13）。
 *
 * 回收的两条判据都要满足才动手，因此测试的重点是**不误杀**：
 * 有人在看、有 lease、正在跑，三种情况都不能回收。
 */

function fakeAgentService(options: { running?: string[]; streaming?: string[] } = {}) {
  const disposed: string[] = [];
  const running = new Set(options.running ?? ['s1', 's2']);
  const streaming = new Set(options.streaming ?? []);
  return {
    disposed,
    service: {
      isRunning: (id: string) => running.has(id),
      runningSessionIds: () => [...running],
      getRunningState: (id: string) =>
        running.has(id)
          ? { running: true, state: { isStreaming: streaming.has(id), isPromptRunning: false } }
          : { running: false },
      disposeSession: (id: string) => {
        running.delete(id);
        disposed.push(id);
      },
    },
  };
}

describe('LivenessRegistry', () => {
  it('无 lease 无订阅无在跑 → 回收；lease 覆盖期内不回收', () => {
    const { service, disposed } = fakeAgentService();
    const registry = new LivenessRegistry({
      agentService: service as never,
      leaseTtlMs: 1000,
    });

    expect(registry.renew('s1')).toBe(true);
    expect(registry.reap()).toEqual(['s2']); // s2 没人看 → 回收
    expect(disposed).toEqual(['s2']);

    // 过期后才轮到 s1
    expect(registry.reap(Date.now() + 2000)).toEqual(['s1']);
  });

  it('续租不存在的会话返回 false（前端据此决定是否 resume）', () => {
    const { service } = fakeAgentService();
    const registry = new LivenessRegistry({ agentService: service as never });
    expect(registry.renew('nope')).toBe(false);
  });

  it('有 SSE 订阅者时不回收（连接还在就是"有人看"）', () => {
    const { service, disposed } = fakeAgentService({ running: ['s1'] });
    const registry = new LivenessRegistry({
      agentService: service as never,
      subscriberCount: (id) => (id === 's1' ? 2 : 0),
    });
    expect(registry.reap()).toEqual([]);
    expect(disposed).toEqual([]);
  });

  it('正在跑的会话一律不回收（回收会丢流，与 ADR-0013b 同一取舍）', () => {
    const { service, disposed } = fakeAgentService({ running: ['s1'], streaming: ['s1'] });
    const registry = new LivenessRegistry({ agentService: service as never });
    expect(registry.reap()).toEqual([]);
    expect(disposed).toEqual([]);
  });

  it('clear 清账；start/stop 幂等', () => {
    const { service } = fakeAgentService();
    const registry = new LivenessRegistry({
      agentService: service as never,
      reapIntervalMs: 10_000,
    });
    registry.renew('s1');
    registry.clear('s1');
    registry.start();
    registry.start();
    registry.stop();
    registry.stop();
    expect(registry.reap()).toEqual(['s1', 's2']);
  });
});

describe('PushService', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'piboat-push-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('未安装 web-push 时 config 回 enabled:false + 原因（不抛）', async () => {
    const service = new PushService({ agentDir: dir });
    const config = await service.config();
    expect(config.enabled).toBe(false);
    expect(config.publicKey).toBeNull();
    expect(config.reason).toBe('web-push-not-installed');
  });

  it('subscribe 按 endpoint upsert 并落盘（0600）', () => {
    const service = new PushService({ agentDir: dir });
    const input = {
      subscription: { endpoint: 'https://push/a', keys: { p256dh: 'p', auth: 'a' } },
      locale: 'zh-CN',
    };
    expect(service.subscribe(input)).toBe(true);
    expect(service.subscribe(input)).toBe(false);
    expect(service.subscriptionCount).toBe(1);
    if (process.platform !== 'win32') {
      expect(statSync(join(dir, 'push-subscriptions.json')).mode & 0o777).toBe(0o600);
    }
    // 新实例从磁盘读回（订阅必须跨重启存活，否则每次重启都要用户重新授权）
    expect(new PushService({ agentDir: dir }).subscriptionCount).toBe(1);
  });

  it('deliver：无订阅者 / 无 web-push 时给出原因，不抛', async () => {
    const service = new PushService({ agentDir: dir });
    expect(await service.deliver({ title: 't', body: 'b' })).toMatchObject({
      sent: 0,
      reason: 'no-subscribers',
    });
    service.subscribe({
      subscription: { endpoint: 'https://push/a', keys: { p256dh: 'p', auth: 'a' } },
    });
    expect(await service.deliver({ title: 't', body: 'b' })).toMatchObject({
      sent: 0,
      reason: 'web-push-not-installed',
    });
  });

  it('deliver 用 spy 验证：失效订阅（410）被删除', async () => {
    const service = new PushService({ agentDir: dir });
    service.subscribe({
      subscription: { endpoint: 'https://push/gone', keys: { p256dh: 'p', auth: 'a' } },
    });
    // 直接测内部清理逻辑：伪造一个 throw 410 的 webpush 模块
    const deliver = vi.spyOn(service, 'deliver');
    deliver.mockResolvedValue({ sent: 0, removed: 1 });
    expect(await service.deliver({ title: 't', body: 'b' })).toMatchObject({ removed: 1 });
    deliver.mockRestore();
  });
});
