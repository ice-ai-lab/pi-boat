import { describe, expect, it } from 'vitest';
import {
  highlightLines,
  highlightToHtml,
  MAX_HIGHLIGHT_LINES,
  shikiLanguageFor,
} from '../src/highlight/code-highlight';

/**
 * 高亮口径（F5，ADR-0009）：语言 id 来自 `getLanguageFromPath`（`ts`/`md`/`bash` 这类 shiki 别名），
 * 颜色一律以 `--shiki-light`/`--shiki-dark` 变量下发（`defaultColor: false`），取色交给 `[data-theme]`。
 * 这里锁三件事：别名真能加载、双主题变量在、失败与超行数上限时静默降级（返回 null 而非抛）。
 */
describe('shikiLanguageFor', () => {
  it('按路径推断；未知回落 text → null', () => {
    expect(shikiLanguageFor('/a/b.ts')).toBe('ts');
    expect(shikiLanguageFor('/a/b.md')).toBe('md');
    expect(shikiLanguageFor('/a/b.unknown-ext')).toBeNull();
  });

  it('显式语言优先，空串不算显式', () => {
    expect(shikiLanguageFor('/a/b.ts', 'python')).toBe('python');
    expect(shikiLanguageFor('/a/b.ts', '')).toBe('ts');
  });
});

describe('highlightLines', () => {
  it('逐行 token，亮/暗两套色都在（别名 ts 可加载）', async () => {
    const lines = await highlightLines('const a = 1;\nconst b = 2;', 'ts');
    expect(lines).toHaveLength(2);
    const first = lines?.[0] ?? [];
    expect(first.map((token) => token.content).join('')).toBe('const a = 1;');
    expect(first.every((token) => token.style['--shiki-light'] !== undefined)).toBe(true);
    expect(first.every((token) => token.style['--shiki-dark'] !== undefined)).toBe(true);
  });

  it('语言无法加载时返回 null（不抛）', async () => {
    await expect(highlightLines('x = 1', 'no-such-lang')).resolves.toBeNull();
  });

  it(`超过 ${MAX_HIGHLIGHT_LINES} 行降级，恰好等于上限仍高亮`, async () => {
    const tooLong = new Array(MAX_HIGHLIGHT_LINES + 1).fill('x').join('\n');
    await expect(highlightLines(tooLong, 'ts')).resolves.toBeNull();
    const atLimit = new Array(MAX_HIGHLIGHT_LINES).fill('x').join('\n');
    expect(await highlightLines(atLimit, 'ts')).not.toBeNull();
  });
});

describe('highlightToHtml', () => {
  it('只下发双主题变量（取色归 [data-theme] CSS）', async () => {
    const html = await highlightToHtml('echo hi', 'bash');
    expect(html?.startsWith('<pre')).toBe(true);
    expect(html).toContain('--shiki-light');
    expect(html).toContain('--shiki-dark');
  });
});
