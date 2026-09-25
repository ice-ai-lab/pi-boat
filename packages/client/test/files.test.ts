import { describe, expect, it } from 'vitest';
import {
  applyAtInsertion,
  buildAtInsertText,
  buildEntriesFromFiles,
  extractAtQuery,
  filterFileEntries,
} from '../src/files/file-fuzzy';
import {
  encodeFilePathForApi,
  getFileDirectory,
  getFileName,
  getRelativeFilePath,
  joinFilePath,
  pathBreadcrumbs,
} from '../src/files/file-paths';
import {
  documentPreviewKind,
  formatFileSize,
  getFileExt,
  getImageMime,
  getLanguageFromPath,
  isDocxPath,
  isImagePath,
  isProbablyTextPath,
} from '../src/files/file-types';
import {
  activateFileTab,
  activeFileTab,
  closeFileTab,
  EMPTY_FILE_TABS,
  openFileTab,
  resolveInitialDisplayMode,
  setTabDisplayMode,
  toggleTabWrap,
} from '../src/files/file-viewer-state';
import { hasChanges, parseToolDiff, parseUnifiedDiff } from '../src/files/unified-diff';

describe('file-paths', () => {
  it('取文件名/目录', () => {
    expect(getFileName('/a/b/c.ts')).toBe('c.ts');
    expect(getFileName('/a/b/')).toBe('b');
    expect(getFileDirectory('/a/b/c.ts')).toBe('/a/b');
    expect(getFileDirectory('/c.ts')).toBe('/');
    expect(getFileDirectory('c.ts')).toBe('');
    expect(getFileDirectory('C:/x/y.ts')).toBe('C:/x');
    expect(getFileDirectory('C:/y.ts')).toBe('C:/');
  });

  it('相对路径（cwd 外原样返回）', () => {
    expect(getRelativeFilePath('/repo/src/a.ts', '/repo')).toBe('src/a.ts');
    expect(getRelativeFilePath('/other/a.ts', '/repo')).toBe('/other/a.ts');
  });

  it('join 与面包屑', () => {
    expect(joinFilePath('/repo/', 'src')).toBe('/repo/src');
    expect(pathBreadcrumbs('src/a/b.ts')).toEqual(['src', 'a', 'b.ts']);
  });

  it('API 编码：绝对路径前导斜杠折进首段（%2F），UNC 同法（docs/07 §7）', () => {
    // 前导 %2F 不可省：服务端把无前导斜杠的路径当相对 server cwd 解析
    expect(encodeFilePathForApi('/repo/src/a b.ts')).toBe('%2Frepo/src/a%20b.ts');
    expect(encodeFilePathForApi('//host/share/f.ts')).toBe('%2F%2Fhost/share/f.ts');
    expect(encodeFilePathForApi('relative/a.ts')).toBe('relative/a.ts');
  });
});

describe('file-types', () => {
  it('扩展名与语言', () => {
    expect(getFileExt('/a/B.TSX')).toBe('tsx');
    // 无扩展名 → 空串（isProbablyTextPath 另行按整名判定）
    expect(getFileExt('/a/Dockerfile')).toBe('');
    expect(getLanguageFromPath('/a/x.py')).toBe('python');
    expect(getLanguageFromPath('/a/x.unknown')).toBe('text');
    expect(getLanguageFromPath('/a/Dockerfile')).toBe('dockerfile');
  });

  it('图片判定', () => {
    expect(isImagePath('/a/x.PNG')).toBe(true);
    expect(getImageMime('/a/x.svg')).toBe('image/svg+xml');
    expect(isImagePath('/a/x.ts')).toBe(false);
  });

  it('PDF 可预览；DOCX **不可**（后端不转换，docs/07 §9）', () => {
    expect(documentPreviewKind('/a/doc.pdf')).toBe('pdf');
    expect(documentPreviewKind('/a/doc.docx')).toBeNull();
    expect(isDocxPath('/a/doc.docx')).toBe(true);
  });

  it('文本判定覆盖无扩展名的常见文件', () => {
    expect(isProbablyTextPath('/a/README')).toBe(true);
    expect(isProbablyTextPath('/a/.env.local')).toBe(true);
    expect(isProbablyTextPath('/a/x.bin')).toBe(false);
  });

  it('体积格式化', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('file-fuzzy：@ 提及', () => {
  it('仅在行首或空白后触发（foo@bar 不触发）', () => {
    expect(extractAtQuery('看 @src/')).toEqual({ start: 2, query: 'src/', quoted: false });
    expect(extractAtQuery('foo@bar')).toBeNull();
    expect(extractAtQuery('@')).toEqual({ start: 0, query: '', quoted: false });
    expect(extractAtQuery('@"my dir/')).toEqual({ start: 0, query: 'my dir/', quoted: true });
  });

  it('索引展开出目录条目', () => {
    const entries = buildEntriesFromFiles(['src/a.ts', 'src/b/c.ts', 'README.md']);
    expect(
      entries
        .filter((e) => e.isDir)
        .map((e) => e.path)
        .sort(),
    ).toEqual(['src', 'src/b']);
    expect(entries.filter((e) => !e.isDir).length).toBe(3);
  });

  it('打分梯度：exact > prefix > substring；目录加分；子序列兜底', () => {
    const entries = buildEntriesFromFiles([
      'src/index.ts',
      'src/other.ts',
      'docs/index.md',
      'a/b/chinp.ts',
    ]);
    const exact = filterFileEntries(entries, 'src/index.ts');
    expect(exact[0]?.path).toBe('src/index.ts');
    const fuzzy = filterFileEntries(entries, 'chinp');
    expect(fuzzy[0]?.path).toBe('a/b/chinp.ts');
    const byName = filterFileEntries(entries, 'index');
    expect(byName.map((e) => e.path)).toContain('src/index.ts');
    expect(byName.map((e) => e.path)).toContain('docs/index.md');
  });

  it('含 "/" 的查询按整条路径匹配（下钻可用）', () => {
    const entries = buildEntriesFromFiles(['src/a.ts', 'src/deep/b.ts']);
    const hits = filterFileEntries(entries, 'src/').map((e) => e.path);
    expect(hits).toContain('src/a.ts');
    expect(hits).toContain('src/deep/b.ts');
  });

  it('插入文本：文件闭合 token，目录保持可下钻；含空格加引号', () => {
    expect(buildAtInsertText('src/a.ts', false)).toEqual({ text: '@src/a.ts ', cursorOffset: 10 });
    expect(buildAtInsertText('src', true)).toEqual({ text: '@src/', cursorOffset: 5 });
    expect(buildAtInsertText('my dir/a.ts', false).text).toBe('@"my dir/a.ts" ');
    expect(buildAtInsertText('my dir', true)).toEqual({ text: '@"my dir/"', cursorOffset: 9 });
  });

  it('applyAtInsertion 替换 token 并给出新光标位置', () => {
    const text = '看 @ind 这个文件';
    const match = extractAtQuery('看 @ind');
    expect(match).not.toBeNull();
    const result = applyAtInsertion(text, match!, { path: 'src/index.ts', isDir: false });
    expect(result.text).toBe('看 @src/index.ts  这个文件');
    expect(result.caret).toBe('看 @src/index.ts '.length);
  });
});

describe('unified-diff：解析', () => {
  const patch = [
    'diff --git a/x.ts b/x.ts',
    'index 111..222 100644',
    '--- a/x.ts',
    '+++ b/x.ts',
    '@@ -1,3 +1,4 @@',
    ' const a = 1;',
    '-const b = 2;',
    '+const b = 3;',
    '+const c = 4;',
    ' const d = 5;',
  ].join('\n');

  it('解析出行号与增删计数', () => {
    const parsed = parseUnifiedDiff(patch);
    expect(parsed.additions).toBe(2);
    expect(parsed.deletions).toBe(1);
    expect(parsed.rows.filter((row) => row.kind === 'meta').length).toBe(4);
    expect(hasChanges(parsed)).toBe(true);
    const add = parsed.rows.find((row) => row.kind === 'add');
    expect(add).toMatchObject({ kind: 'add', text: 'const b = 3;', newLine: 2 });
    const remove = parsed.rows.find((row) => row.kind === 'remove');
    expect(remove).toMatchObject({ kind: 'remove', text: 'const b = 2;', oldLine: 2 });
  });

  it('空 patch → 无行、无改动', () => {
    expect(parseUnifiedDiff('').rows.length).toBe(0);
    expect(hasChanges(parseUnifiedDiff(''))).toBe(false);
  });

  it('工具产物 diff（`+<行号> 文本`）解析；非该格式返回空（退化展示）', () => {
    expect(parseToolDiff('+12 const a = 1;\n-13 const b = 2;\n 14 kept')).toEqual([
      { kind: 'add', lineNo: 12, text: 'const a = 1;' },
      { kind: 'remove', lineNo: 13, text: 'const b = 2;' },
      { kind: 'context', lineNo: 14, text: 'kept' },
    ]);
    expect(parseToolDiff('普通文本')).toEqual([]);
  });
});

describe('file-viewer-state：页签 reducer', () => {
  it('打开/去重/激活', () => {
    let state = openFileTab(EMPTY_FILE_TABS, '/a.ts');
    state = openFileTab(state, '/b.ts');
    state = openFileTab(state, '/a.ts');
    expect(state.tabs.map((tab) => tab.path)).toEqual(['/a.ts', '/b.ts']);
    expect(state.activePath).toBe('/a.ts');
  });

  it('关闭活动页后激活右邻，否则左邻', () => {
    let state = openFileTab(EMPTY_FILE_TABS, '/a.ts');
    state = openFileTab(state, '/b.ts');
    state = openFileTab(state, '/c.ts');
    state = activateFileTab(state, '/b.ts');
    state = closeFileTab(state, '/b.ts');
    expect(state.activePath).toBe('/c.ts');
    state = activateFileTab(state, '/c.ts');
    state = closeFileTab(state, '/c.ts');
    expect(state.activePath).toBe('/a.ts');
  });

  it('关闭非活动页不动活动态', () => {
    let state = openFileTab(EMPTY_FILE_TABS, '/a.ts');
    state = openFileTab(state, '/b.ts');
    state = closeFileTab(state, '/a.ts');
    expect(state.activePath).toBe('/b.ts');
  });

  it('展示模式与折行', () => {
    let state = openFileTab(EMPTY_FILE_TABS, '/a.ts');
    state = setTabDisplayMode(state, '/a.ts', 'diff');
    expect(activeFileTab(state)?.displayMode).toBe('diff');
    state = toggleTabWrap(state, '/a.ts');
    expect(activeFileTab(state)?.wrapLines).toBe(true);
  });

  it('初始模式：图片 → preview；有改动且要求 → diff', () => {
    expect(resolveInitialDisplayMode({ isImage: true })).toBe('preview');
    expect(resolveInitialDisplayMode({ isImage: false, preferDiff: true })).toBe('diff');
    expect(resolveInitialDisplayMode({ isImage: false })).toBe('source');
  });
});
