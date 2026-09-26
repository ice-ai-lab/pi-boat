import path from 'node:path';
import { chromium } from '@playwright/test';

/**
 * 手动验收脚本（**不进 CI**）：F4 设置中心——设置浮层 / 通用节 / 模型节（可见范围、
 * models.json 草稿、目录刷新与搜索）/ skills 节 / 扩展包节 / 节记忆。
 *
 * 用法（两个 dev server 已在跑）：node apps/web/e2e/manual-settings.mjs
 * ⚠️ 本脚本只读；**不要**用它点复选框——那会真写 ~/.pi/agent/settings.json。
 */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const ok = (label, value) => console.log(`${value ? '✓' : '✗'} ${label}`);

await page.goto('http://127.0.0.1:9528/');
await page.waitForSelector('header button:has-text("设置")');
await page.click('header button:has-text("设置")');
await page.waitForSelector('div[role="dialog"][aria-label="设置"]', { timeout: 15_000 });
ok('设置浮层打开', true);

const panel = page.locator('div[role="dialog"][aria-label="设置"]');
const text = async () => (await panel.innerText()).replace(/\s+/g, ' ');

// 通用节
ok('通用节含工具/信任/关于', /工具|项目信任|关于/.test(await text()));

// 模型节
await panel.locator('nav button:has-text("模型")').click();
await page.waitForTimeout(1500);
const modelsText = await text();
ok(
  '模型节含可见模型与 models.json 路径',
  modelsText.includes('可见模型') && modelsText.includes('models.json'),
);
ok('模型清单渲染（GLM/DeepSeek 等）', /GLM|DeepSeek/.test(modelsText));
ok('可见范围来源已展示', /全局|项目覆盖/.test(modelsText));
ok('目录刷新按钮在场', (await panel.locator('button:has-text("刷新目录")').count()) > 0);
ok('目录搜索入口在场', (await panel.locator('input[placeholder*="models.dev"]').count()) > 0);

// models.json 编辑块
const textareaValue = await panel.locator('textarea').first().inputValue();
ok('models.json 草稿已载入（含 providers）', textareaValue.includes('providers'));

// skills 节（需要项目：先打开一个 repo 会话让 projectRoot 就位）
await panel.locator('button[aria-label="关闭设置"]').click();
const sessions = await fetch('http://127.0.0.1:9527/api/sessions').then((r) => r.json());
const repoRoot = path.resolve(import.meta.dirname, '../../..');
const repo = sessions.sessions.find((s) => s.cwd === repoRoot);
await page.goto(`http://127.0.0.1:9528/?s=${repo.id}`);
await page.waitForSelector('aside button:has-text("新会话")', { timeout: 20_000 });
await page.waitForTimeout(3000);
await page.click('header button:has-text("设置")');
await page.waitForSelector('div[role="dialog"][aria-label="设置"]');
await panel.locator('nav button:has-text("Skills")').click();
await page.waitForTimeout(2000);
const skillsText = await text();
ok('Skills 节列出项目 skill', /architecture-decision-records|living-docs/.test(skillsText));
ok(
  'Skills 节有搜索/安装入口',
  (await panel.locator('input[placeholder*="搜索 skill"]').count()) > 0,
);

await panel.locator('nav button:has-text("扩展包")').click();
await page.waitForTimeout(2000);
const pluginsText = await text();
ok('扩展包节渲染（含统计行）', /个包 · .* 个扩展/.test(pluginsText));

// 节记忆：关掉再开，应回到「扩展包」
await panel.locator('button[aria-label="关闭设置"]').click();
await page.click('header button:has-text("设置")');
await page.waitForSelector('div[role="dialog"][aria-label="设置"]');
await page.waitForTimeout(1200);
ok('节记忆生效（回到上次的扩展包节）', /个包 · .* 个扩展/.test(await text()));

await page.screenshot({ path: '/tmp/f4-settings.png' });
await browser.close();
