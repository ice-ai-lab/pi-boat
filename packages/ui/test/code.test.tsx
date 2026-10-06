// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CodeBlock } from '../src/code/code-block';
import { buildRows, DiffBlock } from '../src/code/diff-block';
import { orderEntries } from '../src/files/file-tree';

/**
 * 代码域（code/，DSH 移植）与文件树的渲染口径：
 * - CodeBlock 三条臂在 jsdom 里的可见行为（纯文本兜底 / 静止 HTML / 卡片头文案）；
 * - DiffBlock 的 patch → 行表映射与复制前缀口径；
 * - FileTree 的 DSH 排序（目录优先 + 自然序）。
 */

describe('CodeBlock', () => {
  it('未知语言 → 纯文本 <pre>，代码原样', () => {
    const html = renderToStaticMarkup(
      <CodeBlock code={'const a = 1'} lang="no-such-lang" copyLabel="Copy" copiedLabel="Copied" />,
    );
    expect(html).toContain('<pre');
    expect(html).toContain('const a = 1');
    // 纯文本臂没有 shiki 高亮树
    expect(html).not.toContain('shiki');
  });

  it('静态渲染（useEffect 未跑、viewport 未激活）→ 先落纯文本臂，不闪空白', () => {
    const html = renderToStaticMarkup(
      <CodeBlock code={'const a = 1'} lang="ts" copyLabel="Copy" copiedLabel="Copied" />,
    );
    expect(html).toContain('<pre');
    expect(html).toContain('const a = 1');
    // banner 的语言标走别名原样（supportsHighlighting 为 true 不落 codeLabel）
    expect(html).toContain('>ts</div>');
  });

  it('流式期间同理先纯文本；高亮/增量行为由 code-highlight.test.ts 锁（session=全量）', () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        code={'const a = 1;\nlet b = 2;'}
        lang="ts"
        streaming
        copyLabel="Copy"
        copiedLabel="Copied"
      />,
    );
    expect(html).toContain('let b = 2;');
  });

  it('卡片头（toolbarLabels）出语言标与复制/折行动作', () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        code={'const a = 1'}
        lang="ts"
        copyLabel="Copy"
        copiedLabel="Copied"
        toolbarLabels={{ codeLabel: 'Code', wrapLabel: 'Wrap', unwrapLabel: 'Unwrap' }}
      />,
    );
    expect(html).toContain('>ts<');
    expect(html).toContain('Copy');
    expect(html).toContain('Wrap');
  });

  it('lineNumbers 出行号槽（行数决定槽宽变量）', () => {
    const html = renderToStaticMarkup(
      <CodeBlock
        code={'a\nb\nc'}
        lang="no-such-lang"
        lineNumbers
        showHeader={false}
        copyLabel="Copy"
        copiedLabel="Copied"
      />,
    );
    expect(html).toContain('data-line-numbers');
    expect(html).toContain('--ice-code-line-number-width:2ch');
  });
});

describe('DiffBlock.buildRows（patch → 行表）', () => {
  const patch = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 111..222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,3 @@',
    ' context',
    '-removed',
    '+added',
    '',
  ].join('\n');

  it('meta 收敛成一个 path 行，hunk 头变 ⋯ 缝，增删行保序', () => {
    const rows = buildRows(patch);
    expect(rows[0]).toEqual({ kind: 'path', text: 'src/a.ts' });
    expect(rows[1]).toEqual({ kind: 'gap', text: '⋯' });
    expect(rows.map((row) => row.kind)).toEqual([
      'path',
      'gap',
      'context',
      'del',
      'add',
      'context',
    ]);
  });

  it('空 patch → 空行表，DiffBlock 渲染 emptyHint', () => {
    expect(buildRows('')).toEqual([]);
    const html = renderToStaticMarkup(
      <DiffBlock
        patch=""
        emptyHint="No changes"
        labels={{
          codeLabel: 'Code',
          wrapLabel: 'Wrap',
          unwrapLabel: 'Unwrap',
          copy: 'Copy',
          copied: 'Copied',
          collapseAria: 'Collapse',
          expandAria: (hidden) => `Show ${hidden}`,
          collapse: 'Collapse',
          expand: (hidden) => `Expand ${hidden}`,
        }}
      />,
    );
    expect(html).toContain('No changes');
  });

  it('超过 maxLines 中段折叠，展开按钮带行数', () => {
    const lines = [' context'];
    for (let i = 0; i < 40; i += 1) lines.push(`+added ${i}`);
    const patch = ['--- a/f', '+++ b/f', '@@ -1,2 +1,41 @@', ...lines, ''].join('\n');
    const html = renderToStaticMarkup(
      <DiffBlock
        patch={patch}
        emptyHint="No changes"
        labels={{
          codeLabel: 'Code',
          wrapLabel: 'Wrap',
          unwrapLabel: 'Unwrap',
          copy: 'Copy',
          copied: 'Copied',
          collapseAria: 'Collapse',
          expandAria: (hidden) => `Show ${hidden}`,
          collapse: 'Collapse',
          expand: (hidden) => `Expand ${hidden}`,
        }}
      />,
    );
    expect(html).toContain('Expand 28');
  });
});

describe('FileTree.orderEntries（DSH 排序）', () => {
  it('目录优先；同组内自然序（file2 < file10）、大小写不敏感', () => {
    const ordered = orderEntries([
      { name: 'file10.txt', path: '/f10', type: 'file' },
      { name: 'B', path: '/b', type: 'directory' },
      { name: 'file2.txt', path: '/f2', type: 'file' },
      { name: 'a', path: '/a', type: 'directory' },
    ]);
    expect(ordered.map((entry) => entry.name)).toEqual(['a', 'B', 'file2.txt', 'file10.txt']);
  });
});
