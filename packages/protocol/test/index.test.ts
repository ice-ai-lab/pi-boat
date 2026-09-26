import { describe, expect, it } from 'vitest';
import { type HealthResponse, PROTOCOL_VERSION } from '../src/index';

describe('@ice-ai/protocol', () => {
  it('exposes a stable protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('健康响应的形状是类型（ADR-0017：出参不写 zod）', () => {
    const body = { ok: true, name: 'piboat-server', piVersion: '0.0.0' } satisfies HealthResponse;
    expect(body.ok).toBe(true);
    // @ts-expect-error 缺 name 不算健康响应
    const bad: HealthResponse = { ok: true };
    expect(bad).toBeDefined();
  });
});
