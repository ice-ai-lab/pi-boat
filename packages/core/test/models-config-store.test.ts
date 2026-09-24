import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ModelsConfigReadError,
  normalizeModelsConfigCosts,
  readModelsConfig,
  writeModelsConfig,
} from '../src/config/models-config-store';

/**
 * models.json 读写（docs/02 §6.4）。
 *
 * 这一层的存在意义是**防删配置**：面板整份保存，而文件由本服务与用户的
 * pi CLI/TUI 共用。因此"读得宽容、读不出就拒绝写"是核心不变量。
 */

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'piboat-models-'));
  path = join(dir, 'models.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readModelsConfig：与 pi 加载器同等的宽容度', () => {
  it('文件不存在 → {providers:{}}（新装环境）', () => {
    expect(readModelsConfig(path)).toEqual({ providers: {} });
  });

  it('接受 BOM / `//` 注释 / 尾逗号', () => {
    const content = [
      '\uFEFF{',
      '  // 手写的注释',
      '  "providers": {',
      '    "custom": { "baseUrl": "http://x", "api": "openai-completions", },',
      '  },',
      '}',
    ].join('\n');
    return writeFile(path, content, 'utf8').then(() => {
      expect(readModelsConfig(path)).toEqual({
        providers: { custom: { baseUrl: 'http://x', api: 'openai-completions' } },
      });
    });
  });

  it('字符串里的 `//` 不被当注释剥掉', async () => {
    await writeFile(path, '{ "providers": { "p": { "baseUrl": "http://x//y" } } }', 'utf8');
    expect(readModelsConfig(path)).toMatchObject({
      providers: { p: { baseUrl: 'http://x//y' } },
    });
  });

  it('空文件 / 纯空白 → {providers:{}}', async () => {
    await writeFile(path, '   \n', 'utf8');
    expect(readModelsConfig(path)).toEqual({ providers: {} });
  });

  it('真的坏了 → 抛 ModelsConfigReadError（**不返回空**，否则保存会删空配置）', async () => {
    await writeFile(path, '{ "providers": { oops', 'utf8');
    expect(() => readModelsConfig(path)).toThrow(ModelsConfigReadError);
  });

  it('合法 JSON 但不是对象 → 同样拒绝', async () => {
    await writeFile(path, '[1,2,3]', 'utf8');
    expect(() => readModelsConfig(path)).toThrow(/expected a JSON object/);
  });
});

describe('writeModelsConfig', () => {
  it('归一化 cost 组：部分给值补 0；整组为空则删键', async () => {
    writeModelsConfig(
      {
        providers: {
          p: {
            models: [
              { id: 'a', cost: { input: 1 } },
              { id: 'b', cost: { baseUrl: 'not-a-cost' } },
              { id: 'c' },
            ],
          },
        },
      },
      path,
    );
    const written = JSON.parse(await readFile(path, 'utf8')) as {
      providers: { p: { models: Record<string, unknown>[] } };
    };
    const [a, b, c] = written.providers.p.models;
    expect(a?.cost).toEqual({ input: 1, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(b).not.toHaveProperty('cost');
    expect(c).not.toHaveProperty('cost');
  });

  it('丢弃 id 为空白字符串的半成品条目（面板编辑中途），保留其余', async () => {
    writeModelsConfig(
      { providers: { p: { models: [{ id: 'ok' }, { id: '   ' }, { name: 'no-id-field' }] } } },
      path,
    );
    const written = JSON.parse(await readFile(path, 'utf8')) as {
      providers: { p: { models: { id?: string; name?: string }[] } };
    };
    // 只丢「显式给了空 id」的那条；缺 id 字段的条目不在本层职责内（不是"空 id"）
    expect(written.providers.p.models.map((m) => m.id ?? m.name)).toEqual(['ok', 'no-id-field']);
  });

  it('文件读不出来时**拒绝覆盖**（草稿不是从这份文件构建的）', async () => {
    await writeFile(path, '{"providers": broken', 'utf8');
    expect(() => writeModelsConfig({ providers: {} }, path)).toThrow(ModelsConfigReadError);
    // 原文件必须原样还在
    expect(await readFile(path, 'utf8')).toBe('{"providers": broken');
  });

  it('落盘为 0600（文件里可能有 provider 级 apiKey）', async () => {
    writeModelsConfig({ providers: { p: { apiKey: 'secret' } } }, path);
    const mode = (await stat(path)).mode & 0o777;
    // Windows 上 mode 语义不同，跳过该断言
    if (process.platform !== 'win32') expect(mode).toBe(0o600);
  });

  it('目录不存在时创建（新装环境第一次保存）', async () => {
    const nested = join(dir, 'agent', 'models.json');
    writeModelsConfig({ providers: {} }, nested);
    expect(JSON.parse(await readFile(nested, 'utf8'))).toEqual({ providers: {} });
  });
});

describe('normalizeModelsConfigCosts', () => {
  it('providers 不是对象时原样返回（不抛）', () => {
    expect(normalizeModelsConfigCosts({ providers: 'nope' })).toEqual({ providers: 'nope' });
  });
});
