import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app';

/**
 * 组件树冒烟：把整个 App（QueryClient + Router + ui 组件）渲染一遍。
 * 没有 server 时查询会失败，这没关系——要验证的是「不崩」：
 * 导入写错、hook 规则违反、jsdom 里缺 window API 这类问题都会在这里暴露。
 */
afterEach(cleanup);

describe('App', () => {
  it('无 server 时渲染首页壳而不崩', async () => {
    // jsdom 没有 matchMedia（窄屏门禁会用到）
    if (typeof window.matchMedia !== 'function') {
      window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as typeof window.matchMedia;
    }
    render(<App />);
    expect(await screen.findByText('起航，驶向未至之境')).toBeTruthy();
    expect(screen.getByLabelText('工作目录')).toBeTruthy();
  });

  it('中栏与左侧栏同屏：文件夹空间 / 会话列表 / 新会话入口都在（原型三栏降为两栏）', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as typeof window.matchMedia;
    render(<App />);
    expect(await screen.findByTitle('切换文件夹空间')).toBeTruthy();
    expect(screen.getByRole('button', { name: /新会话/ })).toBeTruthy();
    expect(screen.getByLabelText('搜索会话')).toBeTruthy();
    // 没有 server 时列表查询会失败（重试 1 次，见 QueryClient 配置）——此刻先落到加载态，
    // 关键是侧栏与中栏同时渲染而不崩（失败文案的定时断言交给 E2E）
    expect(await screen.findByText('正在读取会话…')).toBeTruthy();
  });

  it('窄屏时给出「窗口过窄」门禁提示（docs/06 §9.1）', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as typeof window.matchMedia;
    render(<App />);
    expect(await screen.findByText(/窗口过窄/)).toBeTruthy();
  });
});
