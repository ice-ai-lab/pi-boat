import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * 手动验收脚本（**不进 CI**）：F3 文件域——文件树 / 右栏多标签查看器 / 代码视图 /
 * git diff（脏文件自动进 diff）/ 图片预览 / 上传（同名走 rename 策略）。
 *
 * 用法（两个 dev server 已在跑）：
 *   node apps/web/e2e/manual-files.mjs [项目目录] [项目里已有的会话id]
 * 说明：只在临时目录（默认 /tmp/f1probe）里读写，不碰仓库文件。
 * 文件树/查看器的其余断言见 e2e/manual-sidebar.mjs 与本节 §F3 验收记录。
 */
const API = 'http://127.0.0.1:9527/api';
const DIR = '/tmp/f1probe';
mkdirSync(DIR, { recursive: true });
await fetch(`${API}/cwd/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cwd: DIR }),
});
// 1x1 PNG
writeFileSync(
  `${DIR}/probe.png`,
  Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
      '0d0a2db40000000049454e44ae426082',
    'hex',
  ),
);
const uploadedPath = `${DIR}/uploaded.txt`;
if (existsSync(uploadedPath)) rmSync(uploadedPath);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const ok = (l, v) => console.log(`${v ? '✓' : '✗'} ${l}`);
await page.goto('http://127.0.0.1:9528/');
await page.waitForSelector('aside button[aria-label="项目与 worktree"]');
await page.click('aside button[aria-label="项目与 worktree"]');
await page.waitForTimeout(400);
await page.locator('div[role="dialog"] button', { hasText: 'f1probe' }).first().click();
await page.waitForTimeout(1500);
await page.click('aside button:has-text("文件")');
await page.waitForTimeout(2000);

ok('文件树列出 probe.png', (await page.locator('aside button[title="probe.png"]').count()) > 0);
await page.click('aside button[title="probe.png"]');
await page.waitForTimeout(2000);
const right = await page.evaluate(
  () => document.querySelector('aside:last-of-type')?.innerText ?? '',
);
ok('图片自动以预览模式打开', /原始尺寸|适应窗口/.test(right));
ok('图片元素已渲染（preview 字节流）', (await page.locator('aside:last-of-type img').count()) > 0);

// 上传：文件树头部的隐藏 input
// 上传 probe.png（已存在 → 服务端默认 rename 策略，应出现 probe-1.png 之类）
await page.setInputFiles('aside input[type="file"]', `${DIR}/probe.png`);
await page.waitForTimeout(2500);
const treeText = await page.locator('aside').first().innerText();
const entries = treeText.split('\n').filter((line) => line.includes('probe'));
ok('上传成功（目录列出多个 probe 文件）', entries.length >= 2);
console.log('   文件条目:', entries.join(' / '));
await browser.close();
