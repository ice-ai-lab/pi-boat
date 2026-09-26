// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SuggestionMenu } from '../src/chat/suggestion-menu';

/**
 * `/` 斜杠命令浮层（T2-11）：设计规范 ChatInput 的形态——按来源分组 + 网格卡片。
 * 用 renderToStaticMarkup 锁结构（该组件无 i18n 依赖，可直接渲染）。
 */
describe('SuggestionMenu（grid 形态）', () => {
  it('按 hint 分组，每组一个 sticky 头 + 计数，卡片走 220px 网格', () => {
    const html = renderToStaticMarkup(
      <SuggestionMenu
        title="斜杠命令 · 4"
        hint="Tab / Enter"
        variant="grid"
        items={[
          { label: '/compact', hint: 'builtin', description: '压缩上下文' },
          { label: '/name', hint: 'builtin', description: '自动命名' },
          { label: '/my-skill', hint: 'skill', description: '一个技能' },
          { label: '/tpl', hint: '模板', description: '提示词模板' },
        ]}
        activeIndex={0}
        onPick={() => {}}
        onHover={() => {}}
      />,
    );

    // 三个来源分组：builtin / skill / 模板
    expect(html.match(/<section/g)?.length).toBe(3);
    // 网格列（设计规范 ChatInput 的 minmax(220px, 1fr)）
    expect(html).toContain('repeat(auto-fit, minmax(220px, 1fr))');
    // 分组头（uppercase 小字）与标题都渲染
    expect(html).toContain('builtin');
    expect(html).toContain('斜杠命令 · 4');
    expect(html).toContain('Tab / Enter');
    // active 卡片换 accent 描边（第 0 条）
    expect(html).toContain('var(--accent)');
  });
});
