/**
 * 手动验收脚本（**不进 CI**：需要真实模型凭据与配额，docs/08 §4 F1 验收线）。
 *
 * 用法：
 *   pnpm --filter @ice-ai/server run dev      # 9527
 *   pnpm --filter @ice-ai/web run dev         # 9528
 *   node apps/web/e2e/manual-round.mjs <sessionId> [追问文本]
 *
 * 覆盖：?s= 打开既有会话 → 历史重建（过程组展开后断言）+ 冷会话 resume →
 * 输入卡纯发追问 → 实时 SSE fold → 第二轮收拢成组。
 */

import { chromium } from '@playwright/test';

const SID = process.argv[2];
const PROMPT = process.argv[3] ?? '再执行一次 echo second-round，一句话说明。';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

await page.goto(`http://127.0.0.1:9528/?s=${SID}`);
await page.waitForSelector('.app-shell textarea', { timeout: 30_000 });
console.log('✓ 会话打开（历史重建 + resume 完成，Composer 就绪）');

// 历史轮已收拢进「处理详情」组（有最终回答 → 默认收起，docs/05 §6.5-6）：先展开
await page.click('summary:has-text("处理详情")');
await page.waitForSelector('summary:has-text("bash")', { timeout: 15_000 });
const historyText = await page.evaluate(
  () => document.querySelector('.app-shell')?.innerText ?? '',
);
console.log('✓ 历史工具行已渲染（展开过程组后可见）');
console.log('  含工具输出 hello-from-piboat =', historyText.includes('hello-from-piboat'));
console.log('  含最终回答 =', historyText.includes('命令成功执行'));
console.log('  含模型徽标 =', historyText.includes('deepseek-v4-pro'));
await page.screenshot({ path: '/tmp/f1-history.png', fullPage: true });

// 实时路径：从输入卡发追问
await page.fill('.app-shell textarea', PROMPT);
await page.press('.app-shell textarea', 'Enter');
console.log('→ 追问已发送（走实时 SSE fold）');

await page.waitForSelector('text=运行中', { timeout: 15_000 }).catch(() => {});
await page.waitForFunction(() => !document.body.innerText.includes('运行中'), undefined, {
  timeout: 180_000,
});
console.log('✓ 第二轮结束');

const text = await page.evaluate(() => document.querySelector('.app-shell')?.innerText ?? '');
// 第二轮同样会在结束时收拢：展开最后一个过程组再断言
const groups = await page.locator('summary:has-text("处理详情")').all();
if (groups.length > 0) await groups[groups.length - 1].click();
console.log('  第二轮工具行数 =', await page.locator('summary:has-text("bash")').count());
console.log('  含 second-round 输出 =', text.includes('second-round'));
await page.screenshot({ path: '/tmp/f1-round2.png', fullPage: true });

console.log('----- 页面文本（尾部 900 字）-----');
console.log(text.slice(-900));
await browser.close();
