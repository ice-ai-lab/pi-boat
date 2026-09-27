import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { removeStoredCredentialIfType, storeProviderCredential } from '../src/config/auth-store';
import { isProviderUsageId, normalizeProviderUsagePayload } from '../src/config/provider-usage';

/**
 * provider-usage 归一化的口径测试：不联网，只钉「各家响应形状 → 面板栅格」的
 * 换算（对齐 参考实现 provider-usage.test 的三组代表用例）。auth-store 则验证
 * 同一把锁下的写入/类型匹配删除（auth.json 的形状即 pi 的 Credential）。
 */
describe('provider-usage 归一化', () => {
  it('白名单：isProviderUsageId 只放行已知 provider', () => {
    expect(isProviderUsageId('deepseek')).toBe(true);
    expect(isProviderUsageId('moonshotai-cn')).toBe(true);
    expect(isProviderUsageId('made-up')).toBe(false);
  });

  it('deepseek：余额行 → API calls + CNY 指标（面板「用量」栅格的数据源）', () => {
    const report = normalizeProviderUsagePayload(
      'deepseek',
      {
        is_available: true,
        balance_infos: [
          {
            currency: 'CNY',
            total_balance: '19.40',
            granted_balance: '0.00',
            topped_up_balance: '19.40',
          },
        ],
      },
      1_700_000_000_000,
    );
    expect(report.providerId).toBe('deepseek');
    expect(report.metrics[0]).toMatchObject({ label: 'API calls', value: 'Available' });
    expect(report.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'cny-total', value: '19.40', currency: 'CNY' }),
        expect.objectContaining({ id: 'cny-granted', value: '0.00' }),
        expect.objectContaining({ id: 'cny-topped-up', value: '19.40' }),
      ]),
    );
  });

  it('deepseek：没有余额行 → 抛错（调用方回 query-failed）', () => {
    expect(() => normalizeProviderUsagePayload('deepseek', { is_available: false }, 0)).toThrow();
  });

  it('openrouter：data.limit → 额度桶 + 用量指标', () => {
    const report = normalizeProviderUsagePayload(
      'openrouter',
      { data: { limit: 20, limit_remaining: 13.5, usage: 6.5, usage_daily: 1.25 } },
      0,
    );
    expect(report.buckets[0]).toMatchObject({
      id: 'key-limit',
      limit: 20,
      remaining: 13.5,
      used: 6.5,
      currency: 'USD',
    });
    expect(report.metrics.map((metric) => metric.id)).toEqual(['daily', 'total']);
  });

  it('moonshotai-cn：code!=0 → 抛错', () => {
    expect(() => normalizeProviderUsagePayload('moonshotai-cn', { code: 1 }, 0)).toThrow();
  });
});

describe('auth-store（auth.json 读改写）', () => {
  let agentDir: string;
  let previous: string | undefined;
  let authPath: string;

  beforeAll(() => {
    agentDir = mkdtempSync(join(tmpdir(), 'piboat-auth-'));
    previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    authPath = join(agentDir, 'auth.json');
    writeFileSync(
      authPath,
      JSON.stringify({ existing: { type: 'oauth', refresh: 'r', access: 'a', expires: 0 } }),
    );
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agentDir, { recursive: true, force: true });
  });

  it('写入 API Key 凭据；类型匹配才删除；OAuth 凭据不被误删', async () => {
    await storeProviderCredential('deepseek', { type: 'api_key', key: 'sk-test' }, authPath);
    const stored = JSON.parse(readFileSync(authPath, 'utf8')) as Record<string, unknown>;
    expect(stored.deepseek).toMatchObject({ type: 'api_key', key: 'sk-test' });
    // 既有的 OAuth 条目原样保留
    expect(stored.existing).toMatchObject({ type: 'oauth' });

    await expect(removeStoredCredentialIfType('deepseek', 'api_key', authPath)).resolves.toEqual({
      status: 'removed',
    });
    await expect(removeStoredCredentialIfType('deepseek', 'api_key', authPath)).resolves.toEqual({
      status: 'not_found',
    });
    await expect(removeStoredCredentialIfType('existing', 'api_key', authPath)).resolves.toEqual({
      status: 'type_mismatch',
      storedType: 'oauth',
    });
    expect(stored.existing).toBeDefined();
  });
});
