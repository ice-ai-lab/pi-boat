import { describe, expect, it } from 'vitest';
import {
  grammarForHint,
  highlightLines,
  highlightToHtml,
  StreamingHighlightSession,
  supportsHighlighting,
} from '../src/code/highlight';

/**
 * 高亮口径（code/highlight.ts，自 DSH 移植）：同步 shiki core + JS regex 引擎 + css-variables
 * 主题，token 颜色一律以 `--shiki-*` 变量下发（亮暗取色归 theme.css 的 [data-theme]）。
 * 这里锁四件事：别名解析、boot 语法同步可用、未知语言静默退纯文本、流式增量与全量一致。
 */
describe('grammarForHint / supportsHighlighting', () => {
  it('别名与大小写：ts/tsx→typescript，bash→shellscript，未知→undefined', () => {
    expect(grammarForHint('ts')).toBe('typescript');
    expect(grammarForHint('TSX')).toBe('typescript');
    expect(grammarForHint('bash')).toBe('shellscript');
    expect(grammarForHint('no-such-lang')).toBeUndefined();
    expect(grammarForHint(undefined)).toBeUndefined();
    expect(supportsHighlighting('json')).toBe(true);
    expect(supportsHighlighting('no-such-lang')).toBe(false);
  });

  it('对象原型键名不可作为语言（assistant 可写任意 fence 标注）', () => {
    expect(grammarForHint('constructor')).toBeUndefined();
    expect(grammarForHint('__proto__')).toBeUndefined();
  });
});

describe('highlightLines（同步；懒语法未就绪返回 undefined）', () => {
  it('boot 语法（ts）同步出 token，颜色走 --shiki-* 变量', () => {
    const lines = highlightLines('const a = 1;\nlet b = 2;', 'ts');
    expect(lines).toHaveLength(2);
    const first = lines?.[0] ?? [];
    expect(first.map((span) => span.text).join('')).toBe('const a = 1;');
    for (const span of first) {
      expect(span.style.color).toMatch(/^var\(--shiki-/);
    }
  });

  it('未知语言返回 undefined（不抛）；末尾换行不产生空行', () => {
    expect(highlightLines('x = 1', 'no-such-lang')).toBeUndefined();
    const withTrailing = highlightLines('const a = 1;\n', 'ts');
    expect(withTrailing).toHaveLength(1);
  });
});

describe('highlightToHtml', () => {
  it('产出 shiki 的 css-variables HTML（颜色经 --shiki-* 变量）', () => {
    const html = highlightToHtml('echo hi', 'bash');
    expect(html?.startsWith('<pre')).toBe(true);
    expect(html).toContain('shiki css-variables');
    expect(html).toContain('var(--shiki-');
  });
});

describe('StreamingHighlightSession（流式增量 = 全量重算）', () => {
  it('分片 update 的最终行集与一次性 highlightLines 一致', () => {
    const full = 'const a = 1;\nfunction hi() {\n  return "y";\n}\nlet done = true;';
    const session = new StreamingHighlightSession();
    const chunks = ['const a = 1;', 'const a = 1;\nfunction hi() {', full];
    let last: ReturnType<StreamingHighlightSession['update']>;
    for (const chunk of chunks) last = session.update(chunk, 'ts');
    const reference = highlightLines(full, 'ts');
    expect(last).toHaveLength(reference?.length ?? -1);
    for (const [index, line] of (last ?? []).entries()) {
      expect(line.map((span) => span.text).join('')).toBe(
        (reference?.[index] ?? []).map((span) => span.text).join(''),
      );
    }
  });

  it('非追加输入（编辑历史）重置后仍正确', () => {
    const session = new StreamingHighlightSession();
    expect(session.update('const a = 1;', 'ts')).toBeDefined();
    const replaced = session.update('let b = 2;', 'ts');
    expect(replaced).toHaveLength(1);
    expect((replaced?.[0] ?? []).map((span) => span.text).join('')).toBe('let b = 2;');
  });

  it('未知语言回纯文本臂（updateFrame 返回 undefined）', () => {
    const session = new StreamingHighlightSession();
    expect(session.updateFrame('x', 'no-such-lang')).toBeUndefined();
  });
});
