/**
 * 手动验收脚本（**不进 CI**）：F2 侧栏——项目选择器 / 会话列表（窗口化）/
 * 服务端正文搜索 / 点选切换 / 分页加载更早 / 新建 / 重命名 / 删除 / worktree 区块。
 *
 * 用法（两个 dev server 已在跑）：
 *   node apps/web/e2e/manual-sidebar.mjs [分页用会话id]
 * 注意：重命名/删除只作用于脚本自建的一次性会话；不要对它指向真实会话。
 */
import { chromium } from '@playwright/test';

const API = 'http://127.0.0.1:9527/api';
const PAGINATION_SESSION = process.argv[2] ?? '01a0d7cd-1e48-7631-90fb-8f8935aa8813';
const CWD = '/tmp/f2probe';

const created = await fetch(`${API}/agent/new`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cwd: CWD,
    type: 'ensure_session',
    provider: 'deepseek',
    modelId: 'deepseek-v4-pro',
  }),
}).then((r) => r.json());
const throwaway = created.sessionId;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 950 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
const ok = (label, value) => console.log(`${value ? '✓' : '✗'} ${label}`);

// —— 侧栏 + 项目选择器
await page.goto('http://127.0.0.1:9528/');
await page.waitForSelector('aside button:has-text("新会话")');
await page.click('aside button[aria-label="项目与 worktree"]');
await page.waitForTimeout(400);
ok('项目选择器浮层可开', (await page.locator('div[role="dialog"] button').count()) > 1);
await page.locator('div[role="dialog"] button').first().click();
await page.waitForTimeout(800);
ok('会话列表渲染', (await page.locator('aside button[aria-current]').count()) > 0);

// —— 服务端正文搜索
await page.fill('aside input[placeholder*="搜索会话"]', 'hello-from-piboat');
await page.waitForTimeout(1500);
ok('正文搜索有命中', (await page.locator('aside button[aria-current]').count()) > 0);
await page.fill('aside input[placeholder*="搜索会话"]', '');
await page.waitForTimeout(600);

// —— 分页（视觉锚点判定）
await page.goto(`http://127.0.0.1:9528/?s=${PAGINATION_SESSION}`);
await page.waitForSelector('main button:has-text("加载更早的消息")', { timeout: 30_000 });
await page.waitForTimeout(1200);
const measure = () =>
  page.evaluate(() => {
    const scroller = document.querySelector('main .overflow-y-auto');
    const line = scroller.getBoundingClientRect().top + 120;
    const turns = [...scroller.querySelectorAll('[class*="gap-2.5"]')];
    const hit = turns.find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.bottom > line && rect.top <= line;
    });
    return {
      text: (hit?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 40),
      turns: turns.length,
    };
  });
await page.evaluate(() => {
  const s = document.querySelector('main .overflow-y-auto');
  s.scrollTo({ top: Math.round(s.scrollHeight * 0.35) });
});
await page.waitForTimeout(600);
const before = await measure();
await page.evaluate(() => document.querySelector('main .overflow-y-auto').scrollTo({ top: 0 }));
await page.waitForTimeout(3500);
const after = await measure();
ok(`分页轮数增加（${before.turns} → ${after.turns}）`, after.turns > before.turns);
ok('分页视口不跳动（参考线内容不变）', before.text === after.text && before.text.length > 0);

// —— 新建 → EmptyState
await page.click('aside button:has-text("新会话")');
await page.waitForTimeout(500);
ok('新会话 → EmptyState', await page.locator('text=输入一个工作目录').isVisible());

// —— 重命名 + 删除（一次性会话）
await page.goto(`http://127.0.0.1:9528/?s=${throwaway}`);
await page.waitForTimeout(2000);
await page.locator('aside button[aria-current]').first().hover();
await page.click('aside button[aria-label="重命名会话"]');
await page.fill('aside input[aria-label="会话名称"]', 'F2 验收会话');
await page.press('aside input[aria-label="会话名称"]', 'Enter');
await page.waitForTimeout(1200);
ok('重命名生效', (await page.locator('aside').first().innerText()).includes('F2 验收会话'));

await page.locator('aside button[aria-current]').first().hover();
await page.click('aside button[aria-label="删除会话"]');
await page.waitForTimeout(1500);
const list = await fetch(`${API}/sessions`).then((r) => r.json());
ok('删除生效（服务端确认）', !list.sessions.some((s) => s.id === throwaway));

await browser.close();
