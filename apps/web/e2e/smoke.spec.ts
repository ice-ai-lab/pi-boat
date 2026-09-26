import { expect, test } from '@playwright/test';

/**
 * F1 冒烟（docs/08 §4）：三栏骨架就绪。
 *
 * 断言只锁**与本地状态无关**的结构（侧栏脚按钮 / 中栏容器），不依赖当前是否选中项目或有会话——
 * 有项目时中栏是空态 Composer，没项目时是「开始使用」占位（与 参考实现 同口径，见 T0-2/BUG-2）。
 * 语言先固定 zh-CN（hydrate 前的兜底是 en），否则断言文案随浏览器语言漂移。
 */
const FIX_LOCALE = () => window.localStorage.setItem('pi-locale', 'zh-CN');

test('骨架冒烟：三栏空壳 + 对话入口', async ({ page }) => {
  await page.addInitScript(FIX_LOCALE);
  await page.goto('/');
  // 左栏（侧栏）脚：设置入口
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  // 中栏：对话列容器（空态 / 占位都在其内）
  await expect(page.locator('.chat-content')).toBeVisible();
  // 右栏：文件面板骨架
  await expect(page.getByText('没有打开的文件', { exact: false })).toBeVisible();
});

/**
 * 窄屏：不做移动端布局（ADR-0020 / 对齐审查 §3.1 #1），桌面单形态。
 * 原「MobileGate」门禁已按 T0-2 删除，这里只锁「窄屏也照常渲染桌面壳」。
 */
test('窄屏仍是桌面壳（无门禁）', async ({ page }) => {
  await page.addInitScript(FIX_LOCALE);
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto('/');
  await expect(page.getByText('窗口过窄', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  await expect(page.locator('.chat-content')).toBeVisible();
});
