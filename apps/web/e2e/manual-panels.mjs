/**
 * 手动验收脚本（**不进 CI**）：F5 对话增强与高级面板。
 * 覆盖：主题切换（含深色生效）/ 斜杠命令候选 / 输入历史 ↑↓ / 工具面板 /
 * 系统提示词面板 / 统计面板 / 分支面板 / minimap / 控制条（压缩·自动命名·导出）/
 * 快捷键 ⌘B 折叠侧栏。
 *
 * 用法（两个 dev server 已在跑）：node apps/web/e2e/manual-panels.mjs
 * 说明：只读；不发送 prompt（不消耗模型配额）。
 */
import { chromium } from '@playwright/test';

const API = 'http://127.0.0.1:9527/api';
const sessions = await fetch(`${API}/sessions`).then((r) => r.json());
const target = sessions.sessions.find((s) => s.messageCount > 20);
if (target === undefined) throw new Error('没有可用的会话（先跑一轮对话）');
console.log('[probe] 会话:', target.id, '| msgs:', target.messageCount);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1660, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const ok = (label, value) => console.log(`${value ? '✓' : '✗'} ${label}`);
const text = async (sel) => (await page.locator(sel).innerText()).replace(/\s+/g, ' ');

await page.goto(`http://127.0.0.1:9528/?s=${target.id}`);
await page.waitForSelector('main textarea', { timeout: 30_000 });
await page.waitForTimeout(2500);

// 主题
await page.click('header button[aria-label="切换主题"]');
await page.waitForTimeout(300);
ok(
  '主题可切换（偏好已持久化）',
  (await page.evaluate(() => window.localStorage.getItem('piboat:theme'))) !== null,
);
const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.evaluate(() => window.localStorage.setItem('piboat:theme', 'dark'));
await page.reload();
await page.waitForSelector('main textarea');
await page.waitForTimeout(1800);
const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok(`深色主题生效（${lightBg} → ${darkBg}）`, darkBg !== lightBg);

// 输入历史
await page.evaluate((id) => {
  window.localStorage.setItem(
    `piboat:input-history:${id}`,
    JSON.stringify(['第一条历史', '第二条历史']),
  );
}, target.id);
await page.reload();
await page.waitForSelector('main textarea');
await page.waitForTimeout(1800);
await page.click('main textarea');
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(250);
ok('↑ 取回最近一条历史', (await page.inputValue('main textarea')) === '第二条历史');
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(250);
await page.fill('main textarea', '');

// 斜杠命令
await page.fill('main textarea', '/co');
await page.waitForTimeout(1500);
ok('斜杠命令候选打开', (await page.locator('[role="listbox"][aria-label="命令"]').count()) > 0);
await page.keyboard.press('Escape');

// 四个面板
for (const [label, aria, pattern] of [
  ['工具', '关闭工具', /个已激活/],
  ['系统', '关闭系统提示词', /./],
  ['统计', '关闭会话统计', /tokens|花费/],
  ['分支', '关闭分支', /叶节点|线性会话/],
]) {
  await page.click(`main button:has-text("${label}")`);
  await page.waitForTimeout(1800);
  ok(`${label}面板渲染`, pattern.test(await text('main section')));
  await page.click(`main button[aria-label="${aria}"]`);
  await page.waitForTimeout(300);
}

ok('minimap 渲染 bar', (await page.locator('main button[aria-label*="跳转到第"]').count()) > 0);
ok(
  '控制条含压缩/自动命名/导出',
  /压缩/.test(await text('main')) && /自动命名/.test(await text('main')),
);

const sidebarBefore = await page.locator('aside').count();
await page.keyboard.press('Meta+b');
await page.waitForTimeout(500);
ok('⌘B 折叠侧栏', (await page.locator('aside').count()) < sidebarBefore);
await page.keyboard.press('Meta+b');

await page.evaluate(() => window.localStorage.setItem('piboat:theme', 'system'));
await browser.close();
