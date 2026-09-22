import { defineConfig } from 'vitest/config';

/**
 * web 的测试环境：组件树冒烟（jsdom）。E2E 走 Playwright（AGENTS.md），
 * 这里只保证「整棵组件树能 import + 渲染而不崩」——类名/导出/依赖引错的低成本护栏。
 */
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
