import { expect, test } from '@playwright/test';

/** F0 验收线（docs/08 §4）：三栏空壳渲染 + `/api/health` 经 vite proxy 可达 */
test('F0 骨架冒烟：三栏空壳 + health 连通', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PiBoat' })).toBeVisible();
  await expect(page.getByText('对话区（F1：EmptyState cwd 输入 → 消息流）')).toBeVisible();
  // health 探针默认 15s 轮询，首 ping 立即发出；给足代理与 server 启动余量
  await expect(page.getByText('连接正常')).toBeVisible({ timeout: 10_000 });
});
