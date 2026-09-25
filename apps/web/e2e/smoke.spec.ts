import { expect, test } from '@playwright/test';

/** F1 冒烟（docs/08 §4）：三栏骨架 + health 连通 + EmptyState（cwd 输入）就绪 */
test('骨架冒烟：三栏空壳 + health 连通 + 对话入口', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('输入一个工作目录', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始' })).toBeVisible();
  // health 探针默认 15s 轮询，首 ping 立即发出；给足代理与 server 启动余量
  await expect(page.getByText('连接正常')).toBeVisible({ timeout: 10_000 });
});

/** 窄屏门禁（docs/06 §9.1）：<880px 显示提示、隐藏主壳 */
test('窄屏门禁：<880px 停止适配', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto('/');
  await expect(page.getByText('窗口过窄', { exact: false })).toBeVisible();
  await expect(page.locator('.app-shell')).toBeHidden();
});
