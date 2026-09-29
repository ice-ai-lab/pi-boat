// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CodeViewer } from '../src/files/code-viewer';

// 本仓没有 testing-library，React 19 的 act() 需要这个开关才会真正刷新 effect
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 接线级验证（F5）：`CodeViewer` 的高亮是异步就绪的（shiki 懒加载），
 * 所以这里既锁"就绪前先画纯文本"，也锁"就绪后颜色以 `--shiki-light` 变量落到 span"。
 * 取色规则在 highlight.module.css（`[data-theme]`），单测不重复断言 CSS。
 */
const SHIKI_VAR_SPAN = 'span[style*="--shiki-light"]';

async function renderAndWait(element: ReactElement, done: (container: HTMLElement) => boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  for (let attempt = 0; attempt < 150 && !done(container); attempt++) {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
  }

  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('CodeViewer 高亮接线', () => {
  it('语言已知时，代码行最终渲染成带 --shiki-light 变量的 span', async () => {
    const { container, unmount } = await renderAndWait(
      <CodeViewer code={'const a = 1;'} wrapLines={false} language="ts" />,
      (node) => node.querySelector(SHIKI_VAR_SPAN) !== null,
    );

    expect(container.querySelector(SHIKI_VAR_SPAN)).not.toBeNull();
    // 高亮没有换掉表格结构：仍是「行号 + 代码」一行
    expect(container.querySelectorAll('tr')).toHaveLength(1);
    expect(container.textContent).toContain('const a = 1;');

    await unmount();
  });

  it('language 为 null 时保持纯文本（不接高亮）', async () => {
    const { container, unmount } = await renderAndWait(
      <CodeViewer code={'const a = 1;'} wrapLines={false} language={null} />,
      () => true,
    );

    expect(container.querySelector(SHIKI_VAR_SPAN)).toBeNull();
    expect(container.textContent).toContain('const a = 1;');

    await unmount();
  });
});
