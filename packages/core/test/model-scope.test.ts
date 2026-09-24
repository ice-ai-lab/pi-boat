import type { ScopedModel } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import {
  LastModelRejectionError,
  parsePattern,
  prunePatterns,
  resyncPatterns,
  toggleModelInPatterns,
} from '../src/config/model-scope';

/**
 * enabledModels 的最小编辑引擎（ADR-0011①）。
 * 全是纯函数，直接喂结构化输入——不需要真 ModelRuntime。
 */

const scoped = (provider: string, id: string, thinkingLevel?: string): ScopedModel =>
  ({
    model: { provider, id },
    ...(thinkingLevel !== undefined ? { thinkingLevel } : {}),
  }) as ScopedModel;

describe('model-scope：parsePattern', () => {
  it('拆 provider/model:level；裸 id 与 provider glob 都能认', () => {
    expect(parsePattern('anthropic/claude-x:high')).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-x',
      level: 'high',
    });
    expect(parsePattern('anthropic/**')).toEqual({ providerId: 'anthropic', modelId: '**' });
    expect(parsePattern('gpt-5')).toEqual({ modelId: 'gpt-5' });
  });
});

describe('model-scope：toggle 的最小编辑', () => {
  const providerModelIds = ['claude-a', 'claude-b', 'claude-c'];

  it('启用单个模型：追加精确条目，**不动**其他 pattern 与匹配不到的项', () => {
    const patterns = ['openai/gpt-*', 'ghost/nonexistent:high'];
    const next = toggleModelInPatterns({
      patterns,
      providerId: 'anthropic',
      modelId: 'claude-a',
      enabled: true,
      providerModelIds,
      visible: [scoped('openai', 'gpt-5')],
    });
    expect(next).toEqual(['openai/gpt-*', 'ghost/nonexistent:high', 'anthropic/claude-a']);
  });

  it('幂等：目标已在期望状态时原样返回（不重排、不归一化）', () => {
    const patterns = ['z/z', 'a/a']; // 故意非字典序
    expect(
      toggleModelInPatterns({
        patterns,
        providerId: 'anthropic',
        modelId: 'claude-a',
        enabled: true,
        providerModelIds,
        visible: [scoped('anthropic', 'claude-a')],
      }),
    ).toEqual(patterns);
    expect(
      toggleModelInPatterns({
        patterns,
        providerId: 'anthropic',
        modelId: 'claude-b',
        enabled: false,
        providerModelIds,
        visible: [scoped('anthropic', 'claude-a')],
      }),
    ).toEqual(patterns);
  });

  it('禁用单个模型：只去掉它，同 provider 的其他模型逐条保留', () => {
    const next = toggleModelInPatterns({
      patterns: ['anthropic/claude-a', 'anthropic/claude-b', 'openai/gpt-5'],
      providerId: 'anthropic',
      modelId: 'claude-b',
      enabled: false,
      providerModelIds,
      visible: [
        scoped('anthropic', 'claude-a'),
        scoped('anthropic', 'claude-b'),
        scoped('openai', 'gpt-5'),
      ],
    });
    // 新片段插在原来第一个涉及该 provider 的位置（此处索引 0），其余 pattern 不重排
    expect(next).toEqual(['anthropic/claude-a', 'openai/gpt-5']);
  });

  it('禁用最后一个可见模型 → LastModelRejectionError（空列表在 pi 里等于全开）', () => {
    expect(() =>
      toggleModelInPatterns({
        patterns: ['anthropic/claude-a'],
        providerId: 'anthropic',
        modelId: 'claude-a',
        enabled: false,
        providerModelIds,
        visible: [scoped('anthropic', 'claude-a')],
      }),
    ).toThrow(LastModelRejectionError);
  });

  it('一个 provider 被完全启用且条目 ≥2 → 收敛成 provider/**（`**` 才跨 `/`）', () => {
    const next = toggleModelInPatterns({
      patterns: ['anthropic/claude-a', 'anthropic/claude-b'],
      providerId: 'anthropic',
      modelId: 'claude-c',
      enabled: true,
      providerModelIds,
      visible: [scoped('anthropic', 'claude-a'), scoped('anthropic', 'claude-b')],
    });
    expect(next).toEqual(['anthropic/**']);
  });

  it('收敛时若仍有模型钉了档位，**不**收敛（否则静默丢掉 :level）', () => {
    const next = toggleModelInPatterns({
      patterns: ['anthropic/claude-a:high', 'anthropic/claude-b'],
      providerId: 'anthropic',
      modelId: 'claude-c',
      enabled: true,
      providerModelIds,
      visible: [scoped('anthropic', 'claude-a', 'high'), scoped('anthropic', 'claude-b')],
    });
    expect(next).toEqual(['anthropic/claude-a:high', 'anthropic/claude-b', 'anthropic/claude-c']);
  });

  it('嵌套模型 id：全开时收敛成 `provider/**`（`**` 跨 `/`，`*` 不跨）', () => {
    const nestedIds = ['sakana/fugu-ultra', 'plain'];
    const next = toggleModelInPatterns({
      patterns: ['commandcode/plain'],
      providerId: 'commandcode',
      modelId: 'sakana/fugu-ultra',
      enabled: true,
      providerModelIds: nestedIds,
      visible: [scoped('commandcode', 'plain')],
    });
    // 两个模型都选了 = 全开 ⇒ 一条 `**`；若写成 `commandcode/*` 会漏掉嵌套 id
    expect(next).toEqual(['commandcode/**']);
    expect(next).not.toContain('commandcode/*');
  });

  it('嵌套模型 id：部分选中时逐条写（不能拿 `provider/*` 冒充全覆盖）', () => {
    const nestedIds = ['sakana/fugu-ultra', 'plain', 'third'];
    const next = toggleModelInPatterns({
      patterns: ['commandcode/plain'],
      providerId: 'commandcode',
      modelId: 'sakana/fugu-ultra',
      enabled: true,
      providerModelIds: nestedIds,
      visible: [scoped('commandcode', 'plain')],
    });
    expect(next).toEqual(['commandcode/plain', 'commandcode/sakana/fugu-ultra']);
  });

  it('新片段插在第一个涉及该 provider 的 pattern 处（保持用户感知的顺序）', () => {
    const next = toggleModelInPatterns({
      patterns: ['aaa/one', 'anthropic/claude-b', 'zzz/two'],
      providerId: 'anthropic',
      modelId: 'claude-a',
      enabled: true,
      providerModelIds,
      visible: [scoped('aaa', 'one'), scoped('anthropic', 'claude-b'), scoped('zzz', 'two')],
    });
    expect(next).toEqual(['aaa/one', 'anthropic/claude-a', 'anthropic/claude-b', 'zzz/two']);
  });
});

describe('model-scope：显式修复操作', () => {
  const noMatch = (pattern: string) => `[no-match] No models matched pattern "${pattern}"`;

  it('prune：只丢匹配不到的 pattern', () => {
    expect(prunePatterns(['good/a', 'ghost/none', 'good/b:high'], [noMatch('ghost/none')])).toEqual(
      ['good/a', 'good/b:high'],
    );
  });

  it('resync：按唯一候选修复改名残留，并保留 :level 后缀', () => {
    const available = [
      { provider: 'anthropic', id: 'claude-x-v2' },
      { provider: 'openai', id: 'gpt-5' },
    ];
    expect(
      resyncPatterns(
        ['anthropic/claude-x', 'anthropic/claude-x:high'],
        [noMatch('anthropic/claude-x'), noMatch('anthropic/claude-x:high')],
        available,
      ),
    ).toEqual(['anthropic/claude-x-v2', 'anthropic/claude-x-v2:high']);
  });

  it('resync：候选不唯一时保持原样（宁可不修，不可乱改）', () => {
    const available = [
      { provider: 'anthropic', id: 'claude-x-v2' },
      { provider: 'anthropic', id: 'claude-x-v3' },
    ];
    expect(
      resyncPatterns(['anthropic/claude-x'], [noMatch('anthropic/claude-x')], available),
    ).toEqual(['anthropic/claude-x']);
  });

  it('resync：无诊断的 pattern 一律不动', () => {
    expect(resyncPatterns(['ok/a'], [], [{ provider: 'ok', id: 'b' }])).toEqual(['ok/a']);
  });
});
