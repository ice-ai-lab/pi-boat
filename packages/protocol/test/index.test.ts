import { describe, expect, it } from 'vitest';
import { HealthResponseSchema, PROTOCOL_VERSION } from '../src/index';

describe('@ice-ai/protocol', () => {
  it('exposes a stable protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('parses a valid health response', () => {
    expect(HealthResponseSchema.parse({ ok: true, name: 'piboat-server' })).toEqual({
      ok: true,
      name: 'piboat-server',
    });
  });
});
