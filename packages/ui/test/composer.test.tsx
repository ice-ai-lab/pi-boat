// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Composer, type ComposerProps } from '../src/chat/composer';
import { I18nProvider } from '../src/i18n/i18n-provider';

/**
 * 动作按钮上的 kbd 提示（`docs/06` §8.6）：**常显**。
 *
 * 原型 v3 是 `:has(.ta:not(:placeholder-shown)) .send kbd { display: none }`——一打字提示就没了；
 * 2026-09-28 用户定案改成「有文本只去禁用态」：提示不随输入消失（用户一打字就丢掉
 * 「↵ 发送 / ⌘↵ 后续消息」这条线索）。这里锁住「禁用态与可用态都带提示」。
 */
function render(overrides: Partial<ComposerProps> = {}) {
  return renderToStaticMarkup(
    <I18nProvider>
      <Composer value="" onChange={() => {}} onSubmit={() => {}} streaming={false} {...overrides} />
    </I18nProvider>,
  );
}

const kbdCount = (html: string) => (html.match(/<kbd/g) ?? []).length;

describe('Composer 动作按钮的 kbd 提示常显', () => {
  it('空闲 + 空文本（禁用态）：发送按钮带 ↵', () => {
    const html = render();
    expect(kbdCount(html)).toBe(1);
    expect(html).toContain('↵');
  });

  it('空闲 + 有文本（可用态）：仍带 ↵', () => {
    const html = render({ value: '1' });
    expect(kbdCount(html)).toBe(1);
    expect(html).toContain('↵');
    // 只去禁用态：有文本后发送按钮不再是 disabled（静态标记里除它再无 disabled 元素）
    expect(html).not.toContain('disabled');
  });

  it('运行中 + 有文本：引导带 ↵、后续消息带 ⌘↵', () => {
    const html = render({
      value: '1',
      streaming: true,
      onAbort: () => {},
      onSteer: () => {},
      onFollowUp: () => {},
    });
    expect(kbdCount(html)).toBe(2);
    expect(html).toContain('↵');
    expect(html).toContain('⌘↵');
  });
});
