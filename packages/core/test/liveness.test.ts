import { describe, expect, it } from 'vitest';
import { LivenessRegistry } from '../src/agent/liveness';

/**
 * liveness lease 与 idle 回收（G2-12）。
 *
 * 回收的两条判据都要满足才动手，因此测试的重点是**不误杀**：
 * 有人在看（订阅 / lease）、正在跑，三种情况都不能回收。
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
