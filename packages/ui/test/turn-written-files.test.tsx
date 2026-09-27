// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TurnWrittenFiles } from '../src/chat/turn-written-files';
import { I18nProvider } from '../src/i18n/i18n-provider';

/**
 * C14（docs/10 §5.3）：助手消息末尾的「本轮改动」chip。
 * 锁的是形态本身——一行 chip、显示**文件名**（不是相对路径）、无标题行
 * （旧实现是「本轮改动 N 个文件」+ 竖排路径列表，靠这条防止回退）。
 */
function render(paths: string[]) {
  return renderToStaticMarkup(
    <I18nProvider>
      <TurnWrittenFiles paths={paths} onOpen={() => {}} />
    </I18nProvider>,
  );
}

describe('TurnWrittenFiles（chip 形态）', () => {
  it('每个文件一枚 chip：文件名 + 完整路径只进 title', () => {
    const html = render(['/repo/docs/10-frontend-parity-audit.md', '/repo/src/a.ts']);
    expect(html).toContain('<ul aria-label="Files changed"');
    expect(html).toContain('title="/repo/docs/10-frontend-parity-audit.md"');
    expect(html).toContain('>10-frontend-parity-audit.md</span>');
    // 文件图标按扩展名取（.md → catppuccin markdown），不是纯文字（file-icon.module.css 的 .icon）
    expect(html).toContain('_icon_');
    // 无标题行（旧实现的「本轮改动 N 个文件」必须消失）
    expect(html).not.toContain('本轮改动');
    expect(html).not.toContain('个文件');
  });

  it('空清单不渲染', () => {
    expect(render([])).toBe('');
  });
});
