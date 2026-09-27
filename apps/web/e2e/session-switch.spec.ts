import { expect, type Request, test } from '@playwright/test';

/**
 * 会话切换的请求量（2026-09-26 回归锁）。
 *
 * 背景：详情（`GET /api/sessions/:id`）曾经被两条互不知情的通道各拉一份——
 * `useAgentSession.open()`（重建历史 + 事件流水位线）和 `useSessionDetailQuery`
 * （分支树/统计），开发期 `<StrictMode>` 还会把导航 effect 再跑一遍。本机实测切到
 * 2.2 MB 的会话时，**一次切换发了 2–3 份 2.43 MB 的详情**，服务端每份还要全量解析
 * 一次会话文件。现在两边共用同一个 query（`fetchSessionDetail`），只允许一份。
 *
 * 为什么用网络计数而不是单测：这是「两个消费方共用一份缓存」的行为，只有在真浏览器
 * 里跑出来才算数（client 的 react 层没有 renderHook 测试设施）。断言的是请求**次数**，
 * 与会话内容/本机状态无关。
 */
test('切换会话只拉一份详情', async ({ page, request }) => {
  // 用全量列表挑一个已落盘、有内容的会话（`?projectKey=` 与 summary 快路径的取舍见 ADR-0026）
  const list = await (await request.get('/api/sessions')).json();
  const target = (list.sessions as { id: string; messageCount: number }[]).find(
    (session) => session.messageCount > 2,
  );
  test.skip(target === undefined, '~/.pi 会话目录里没有已落盘的会话，无法验证切换');

  const detailPath = `/api/sessions/${target?.id}`;
  const details: Request[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname === detailPath) details.push(req);
  });

  await page.goto(`/?s=${target?.id}`);
  await expect(page.locator('.chat-content')).toBeVisible();
  // 留出切换后各消费方挂载/预取的窗口（命令、工具、统计、运行态）
  await page.waitForTimeout(3_000);

  expect(details).toHaveLength(1);
});
