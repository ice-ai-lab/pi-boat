/**
 * 手动验收：发送链路四条路径（**不进 CI**：需要真实模型凭据与配额，与 manual-*.mjs 同口径）。
 *
 * 用法：
 *   pnpm --filter @ice-ai/server run dev      # 9527
 *   pnpm --filter @ice-ai/web run dev         # 9528
 *   node apps/web/e2e/manual-send-path.mjs <已有会话id>
 *
 * 覆盖（2026-09-26「点击发送之后消息没发出去」的四个根因，docs/09 §0.4）：
 *   ① 打开既有会话                        → 历史渲染 + composer 可用
 *   ② 点侧栏「新建会话」+ 发首条消息        → 新建会话、user 消息与回答可见、composer 不消失、URL 带新 id
 *   ③ 同一会话追问                        → 第二轮可见（轮次 +1）
 *   ④ touch server 文件（等价 tsx watch 重启）后发送 → 自愈：先 404 → resume → 重发成功，消息可见
 *
 * 判据只锁「与模型输出无关」的部分：user 消息文本出现、composer 仍在、URL 正确。
 * 模型回复内容不参与断言（不依赖具体模型，也不依赖它是否调工具）。
 */

import { execSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const SESSION_ID = process.argv[2];
if (!SESSION_ID) {
  console.error('用法：node apps/web/e2e/manual-send-path.mjs <已有会话id>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// 固定语言：断言里的按钮 title 随 locale 漂移（与 smoke.spec.ts 同处理）
await page.addInitScript(() => window.localStorage.setItem('pi-locale', 'zh-CN'));
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 300)));

const chatText = async () =>
  String(await page.evaluate(() => document.querySelector('.chat-content')?.innerText)).replace(
    /\n+/g,
    '|',
  );
const composerAlive = async () => (await page.locator('textarea').count()) === 1;

/** 等 user 消息出现（prompt 被接受即回显，与模型跑多久无关） */
const waitForUserMessage = async (text) => {
  await page.waitForFunction(
    (needle) => (document.querySelector('.chat-content')?.innerText ?? '').includes(needle),
    text,
    { timeout: 30_000 },
  );
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ① 既有会话
await page.goto(`http://127.0.0.1:9528/?s=${SESSION_ID}`);
await page.waitForSelector('textarea', { timeout: 30_000 });
await page.waitForTimeout(4000);
check('① 打开既有会话', (await chatText()).length > 100 && (await composerAlive()));

// ② 「新建会话」→ 空态发首条消息
await page.locator('button[title*="新建会话"]').first().click();
await page.waitForTimeout(2000);
check('② URL 清空到 /（新建会话生效）', new URL(page.url()).search === '', page.url());
await page.fill('textarea', '验收·空态：只回复 ok。');
await page.keyboard.press('Enter');
await waitForUserMessage('验收·空态：只回复 ok。');
const newSessionUrl = new URL(page.url()).searchParams.get('s');
check('② 空态首条消息已回显', newSessionUrl !== null && newSessionUrl !== SESSION_ID);
check('② composer 仍在（中栏没自毁）', await composerAlive());

// ③ 同一会话追问
await page.fill('textarea', '验收·追问：只回复 ok。');
await page.keyboard.press('Enter');
await waitForUserMessage('验收·追问：只回复 ok。');
check('③ 追问已回显', true);

// ④ server 重启后发送（revive 自愈）
execSync('touch /Users/gatesma/project/WebstormProjects/pi-boat/packages/server/src/server.ts', {
  stdio: 'ignore',
});
console.log('… 已 touch server 文件（tsx watch 重启），等 6s');
await page.waitForTimeout(6000);
await page.fill('textarea', '验收·重启：只回复 ok。');
await page.keyboard.press('Enter');
await waitForUserMessage('验收·重启：只回复 ok。');
check('④ server 重启后消息仍发出并回显', await composerAlive());

await browser.close();
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);
