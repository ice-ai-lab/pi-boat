// @vitest-environment jsdom
import { TOOL_PRESETS } from '@ice-ai/protocol';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToolPresetMenu } from '../src/chat/tool-preset-menu';
import { I18nProvider } from '../src/i18n/i18n-provider';

/**
 * 工具预设按钮的标签（docs/09 T2-6 及其 2026-09-30 三次补充）。
 *
 * 预设命中时标签用本地化短名（仅聊天/只读/默认/全部，en 环境下为 Chat only/Read-only/
 * Default/Full）；四项都不命中时（settings 改过 / 扩展塞进工具，如 `web_enable`）按钮文字
 * 回落用户点过的 `pickedPreset`，没点过则回落 `chat.customToolPreset`——按钮不留空，
 * 也不在扩展注入工具时闪「自定义」。下拉勾选仍按 toolPreset 反查，与按钮文字口径无关。
 */
const PRESETS = TOOL_PRESETS.map((value) => ({ value, label: value }));

function render(toolPreset: string | null, pickedPreset?: string | null) {
  return renderToStaticMarkup(
    <I18nProvider>
      <ToolPresetMenu
        toolPreset={toolPreset}
        toolPresets={PRESETS}
        onToolPresetChange={() => {}}
        pickedPreset={pickedPreset}
      />
    </I18nProvider>,
  );
}

describe('ToolPresetMenu 标签', () => {
  it('命中预设：标签用本地化短名，不再是协议枚举值', () => {
    expect(render('chat-only')).toContain('>Chat only<');
    expect(render('read-only')).toContain('>Read-only<');
    expect(render('default')).toContain('>Default<');
    expect(render('full')).toContain('>Full<');
    expect(render('default')).not.toContain('>default<');
  });

  it('无预设命中（presetForToolNames 返回 null）：收起态回落「自定义」，不留空标签', () => {
    const html = render(null);
    expect(html).toContain('>Custom<');
  });

  it('无预设命中但点过预设（扩展塞进工具）：按钮保持用户的选择，不闪「自定义」', () => {
    expect(render(null, 'default')).toContain('>Default<');
    expect(render(null, 'default')).not.toContain('>Custom<');
    expect(render(null, 'full')).toContain('>Full<');
  });

  it('反查命中与点过不一致：以实际工具集的反查结果为准（按钮文字与勾选同源）', () => {
    expect(render('read-only', 'full')).toContain('>Read-only<');
    expect(render('read-only', 'full')).not.toContain('>Full<');
  });
});
