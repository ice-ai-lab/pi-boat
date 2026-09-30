// @vitest-environment jsdom
import { TOOL_PRESETS } from '@ice-ai/protocol';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolPresetMenu } from '../src/chat/tool-preset-menu';
import { I18nProvider } from '../src/i18n/i18n-provider';

/**
 * 工具预设按钮的标签（docs/09 T2-6 及其 2026-09-30 补充）。
 *
 * 预设命中时标签直接用 protocol 的 `TOOL_PRESETS` 值；四项都不命中时（settings 改过 /
 * 扩展塞进工具，如 `web_enable`）此前回落空串，按钮只剩一枚扳手图标——锁住它必须回落
 * `chat.customToolPreset`，不再出现「模式为空」。
 */
const PRESETS = TOOL_PRESETS.map((value) => ({ value, label: value }));

function render(toolPreset: string | null) {
  return renderToStaticMarkup(
    <I18nProvider>
      <ToolPresetMenu toolPreset={toolPreset} toolPresets={PRESETS} onToolPresetChange={() => {}} />
    </I18nProvider>,
  );
}

describe('ToolPresetMenu 标签', () => {
  it('命中预设：标签就是协议枚举值', () => {
    const html = render('default');
    expect(html).toContain('>default<');
    expect(html).not.toContain('Custom');
  });

  it('无预设命中（presetForToolNames 返回 null）：回落「自定义」，不留空标签', () => {
    const html = render(null);
    expect(html).toContain('>Custom<');
  });
});
