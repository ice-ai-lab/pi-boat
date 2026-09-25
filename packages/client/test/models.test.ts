import type { ModelListItem } from '@ice-ai/protocol';
import { describe, expect, it } from 'vitest';
import {
  configProviderNames,
  enabledScopeLabel,
  groupModelsByProvider,
  isLastEnabledModel,
  parseModelsConfigDraft,
  toggleHint,
} from '../src/view-models/models';

const model = (provider: string, id: string, name = id): ModelListItem => ({
  id,
  name,
  provider,
  input: ['text'],
});

describe('groupModelsByProvider', () => {
  it('按 provider 分组、组内按名称排序', () => {
    const groups = groupModelsByProvider([
      model('zai', 'glm-5.3', 'GLM-5.3'),
      model('deepseek', 'v4-pro', 'DeepSeek V4 Pro'),
      model('zai', 'glm-4.6v', 'GLM-4.6V'),
    ]);
    expect(groups.map((g) => g.provider)).toEqual(['zai', 'deepseek']);
    expect(groups[0]?.models.map((m) => m.id)).toEqual(['glm-4.6v', 'glm-5.3']);
  });

  it('空输入 → 空分组', () => {
    expect(groupModelsByProvider([])).toEqual([]);
  });
});

describe('last-model 护栏（服务端 409 的本地前置）', () => {
  it('只有一个模型且正是它 → 禁止关闭', () => {
    const models = [model('zai', 'glm-5.3')];
    expect(isLastEnabledModel(models, 'zai:glm-5.3')).toBe(true);
    expect(isLastEnabledModel(models, 'zai:other')).toBe(false);
  });

  it('多个模型 → 都允许关闭', () => {
    expect(isLastEnabledModel([model('zai', 'a'), model('zai', 'b')], 'zai:a')).toBe(false);
  });

  it('提示文案随数量变化', () => {
    expect(toggleHint([])).toContain('全部可用');
    expect(toggleHint([model('zai', 'a')])).toContain('只剩 1 个');
    expect(toggleHint([model('zai', 'a'), model('zai', 'b')])).toBeNull();
  });
});

describe('enabledScopeLabel', () => {
  it('项目 shadow 与全局可写/只读三态', () => {
    expect(enabledScopeLabel({ scope: 'project', canWrite: false })).toContain('项目');
    expect(enabledScopeLabel({ scope: 'global', canWrite: true })).toContain('全局');
    expect(enabledScopeLabel({ scope: 'global', canWrite: false })).toContain('只读');
  });
});

describe('models.json 编辑辅助', () => {
  it('provider 名列表（顺序保持文件里的）', () => {
    expect(configProviderNames({ providers: { zai: {}, deepseek: {} } })).toEqual([
      'zai',
      'deepseek',
    ]);
    expect(configProviderNames({})).toEqual([]);
    expect(configProviderNames({ providers: [] })).toEqual([]);
    expect(configProviderNames({ providers: 'nope' })).toEqual([]);
  });

  it('草稿解析：对象 OK；数组/标量/坏 JSON 拒绝', () => {
    expect(parseModelsConfigDraft('{"providers":{}}')).toEqual({
      ok: true,
      value: { providers: {} },
    });
    expect(parseModelsConfigDraft('[]').ok).toBe(false);
    expect(parseModelsConfigDraft('42').ok).toBe(false);
    expect(parseModelsConfigDraft('{oops').ok).toBe(false);
    const failure = parseModelsConfigDraft('{oops');
    expect(failure.ok === false && failure.error.length > 0).toBe(true);
  });
});
