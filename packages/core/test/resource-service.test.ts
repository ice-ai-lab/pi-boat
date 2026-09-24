import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isPowerShellEnabled,
  replaceShellTool,
  setDisableModelInvocation,
  sourceType,
} from '../src/resources/resource-service';
import {
  readSettingsObject,
  SettingsWriteError,
  updateSettingsObject,
} from '../src/resources/settings-file';

/**
 * 资源域里**不依赖 SDK 资源发现**的两块纯逻辑（B6）：
 * SKILL.md frontmatter 的定点编辑、settings.json 的带锁读写、包来源判定。
 *
 * 为什么盯住这两块：前者会改用户手写的 SKILL.md（写坏了技能直接消失），
 * 后者是多个进程共写的配置（裸 read-modify-write 会吃掉对方的改动）。
 */

describe('setDisableModelInvocation：只改一行，不重排 YAML', () => {
  const withFrontmatter = [
    '---',
    'name: my-skill',
    'description: 演示',
    'allowed-tools: read, grep',
    '---',
    '',
    '# 正文',
    'disable-model-invocation: true  <- 正文里出现的同名字样不该被改',
    '',
  ].join('\n');

  it('插入缺失的键（且不动其他字段的顺序与格式）', () => {
    const patched = setDisableModelInvocation(withFrontmatter, true);
    expect(patched).toContain('name: my-skill\n');
    expect(patched).toContain('allowed-tools: read, grep\n');
    // 插在 frontmatter **块的末尾**：用户原有字段的位置与顺序不变
    expect(patched).toContain('allowed-tools: read, grep\ndisable-model-invocation: true\n---');
    // 正文里的那行原样保留
    expect(patched).toContain('# 正文\ndisable-model-invocation: true  <-');
  });

  it('已存在该键（哪怕值是 false）→ **原地改值**，不制造重复键', () => {
    const source = '---\nname: s\ndisable-model-invocation: false\n---\nbody\n';
    const patched = setDisableModelInvocation(source, true);
    expect(patched.match(/disable-model-invocation/g)).toHaveLength(1);
    expect(patched).toContain('disable-model-invocation: true');
  });

  it('引号写法也能识别（"disable-model-invocation"）', () => {
    const patched = setDisableModelInvocation(
      '---\n"disable-model-invocation": true\n---\n',
      false,
    );
    expect(patched.match(/disable-model-invocation/g)).toHaveLength(1);
    expect(patched).toContain('disable-model-invocation: false');
  });

  it('无键且要关 → 原样返回（不制造无谓改动）', () => {
    const source = '---\nname: s\n---\nbody\n';
    expect(setDisableModelInvocation(source, false)).toBe(source);
  });

  it('没有 frontmatter 时造一个', () => {
    expect(setDisableModelInvocation('# 只有正文', true)).toBe(
      '---\ndisable-model-invocation: true\n---\n# 只有正文',
    );
  });

  it('缩进过的键保留缩进', () => {
    const patched = setDisableModelInvocation(
      '---\nname: s\n  disable-model-invocation: true\n---\n',
      false,
    );
    expect(patched).toContain('  disable-model-invocation: false');
  });
});

describe('PowerShell 开关的推导与替换', () => {
  it('只有 Windows 且 defaultTools 用 powershell 才算开', () => {
    expect(isPowerShellEnabled(['read', 'powershell'], 'win32')).toBe(true);
    expect(isPowerShellEnabled(['read', 'powershell'], 'darwin')).toBe(false);
    // 两个都在（配置矛盾）算关：pi 的语义是"用 bash"
    expect(isPowerShellEnabled(['bash', 'powershell'], 'win32')).toBe(false);
    expect(isPowerShellEnabled(undefined, 'win32')).toBe(false);
  });

  it('替换 shell 工具且去重、保持顺序', () => {
    expect(replaceShellTool(['read', 'bash', 'edit'], true)).toEqual([
      'read',
      'powershell',
      'edit',
    ]);
    expect(replaceShellTool(['read', 'powershell', 'bash'], false)).toEqual(['read', 'bash']);
    expect(replaceShellTool([], true)).toEqual([]);
  });
});

describe('包来源判定', () => {
  it('npm / git / 本地三类', () => {
    expect(sourceType('@scope/pkg')).toBe('npm');
    expect(sourceType('pkg@1.2.3')).toBe('npm');
    expect(sourceType('github:user/repo')).toBe('git');
    expect(sourceType('git+https://x/y.git')).toBe('git');
    expect(sourceType('/abs/path')).toBe('local');
    expect(sourceType('./rel')).toBe('local');
    expect(sourceType('~/x')).toBe('local');
  });
});

describe('settings.json 的带锁读写', () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'piboat-settings-'));
    path = join(dir, 'settings.json');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('文件不存在 → {}；写入后读回', () => {
    expect(readSettingsObject(path)).toEqual({});
    updateSettingsObject(path, (current) => ({ ...current, defaultTools: ['read'] }));
    expect(readSettingsObject(path)).toEqual({ defaultTools: ['read'] });
  });

  it('读-改-写保留未触碰的字段（不整表重写）', () => {
    writeFileSync(path, JSON.stringify({ theme: 'dark', defaultTools: ['read', 'bash'] }));
    updateSettingsObject(path, (current) => ({
      ...current,
      defaultTools: ['read', 'powershell'],
    }));
    expect(readSettingsObject(path)).toEqual({
      theme: 'dark',
      defaultTools: ['read', 'powershell'],
    });
  });

  it('坏 JSON → 抛错且**不覆盖**原文', () => {
    writeFileSync(path, '{ "theme": "dark"');
    expect(() => updateSettingsObject(path, () => ({ ok: true }))).toThrow(SettingsWriteError);
    expect(readFileSync(path, 'utf8')).toBe('{ "theme": "dark"');
  });

  it('宽容解析：注释与尾逗号（手写的 settings.json 常见）', () => {
    writeFileSync(path, '{\n  // 注释\n  "theme": "dark",\n}\n');
    expect(readSettingsObject(path)).toEqual({ theme: 'dark' });
  });

  it('锁：并发写不会互相覆盖（串行化后两次改动都在）', async () => {
    await Promise.all([
      Promise.resolve().then(() => updateSettingsObject(path, (current) => ({ ...current, a: 1 }))),
      Promise.resolve().then(() => updateSettingsObject(path, (current) => ({ ...current, b: 2 }))),
    ]);
    expect(readSettingsObject(path)).toEqual({ a: 1, b: 2 });
  });

  it('残留的过期锁会被清理（另一个进程崩在不释放的位置）', () => {
    mkdirSync(`${path}.lock`);
    const old = new Date(Date.now() - 60_000);
    utimesSync(`${path}.lock`, old, old);
    updateSettingsObject(path, () => ({ ok: true }));
    expect(readSettingsObject(path)).toEqual({ ok: true });
  });
});
