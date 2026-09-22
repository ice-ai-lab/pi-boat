import { defineConfig } from 'vitest/config';

/**
 * ui 的测试环境：纯函数单测（滚动模型 / diff 解析 / 格式化）+ 组件渲染测试。
 * jsdom 只为组件渲染；`docs/06` §1 要求组件「可无 Provider 单测」——所以不引任何
 * 宿主框架/provider，测试里直接渲染。
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
