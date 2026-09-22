/**
 * M1 端到端验收脚本（人工跑，不进 CI）
 *
 * 为什么保留它：M1 的验收线是「浏览器完成一轮带工具调用的编程任务」，而首轮
 * 流式 + 工具展示这条链路只在真机上才暴露问题——2026-09-23 就是靠这个脚本抓到
 * 「prompt 命令等到 run 结束才回」（core）与「命令信封当成资源体解析」（client）两个缺陷。
 *
 * 前置：本机 pi 凭据可用（`~/.pi/agent/`，与 pi CLI 共用）+ agent server 已启动：
 *   pnpm turbo run dev            # 或 pnpm --filter @ice-ai/server run dev
 * 运行：
 *   pnpm --filter @ice-ai/client run acceptance:m1
 *
 * 判定（退出码非零即失败）：收到事件帧、工具行 status=ok 且有输出、最终回答非空、零非法帧。
 */
import { newSession } from '../src/endpoints/agent';
import { ApiClient } from '../src/http';
import { AgentStream } from '../src/stream/agent-stream';
import { parseFrame } from '../src/stream/event-source';

const baseURL = process.env.PIBOAT_BASE_URL ?? 'http://127.0.0.1:9527';
const cwd = process.env.PIBOAT_CWD ?? process.cwd();
const prompt =
  process.env.PIBOAT_PROMPT ??
  '用一次 bash 工具列出当前目录下的顶层条目（ls），然后用一句话总结。不要做别的。';

const t0 = Date.now();
const client = new ApiClient({ baseURL });

const created = await newSession(client, { cwd, type: 'ensure_session' });
console.log(`[m1] session=${created.sessionId} cwd=${cwd}`);

const stream = new AgentStream({
  sessionId: created.sessionId,
  client,
  refreshStateOnSettle: false,
});
const controller = new AbortController();
let frames = 0;
const done = new Promise<void>((resolve) => {
  stream.subscribe(() => {
    const view = stream.getSnapshot();
    if (view.turns.some((turn) => turn.status !== 'streaming' && turn.final !== null)) resolve();
  });
});
const timeout = new Promise<void>((resolve) => setTimeout(resolve, 180_000));

// 先建流、再发 prompt：避免 run 跑在订阅之前（首轮就看不到流式增量）
const response = await fetch(`${client.baseURL}/api/agent/${created.sessionId}/events`, {
  headers: { Accept: 'text/event-stream' },
  signal: controller.signal,
});
const pump = (async () => {
  if (response.body === null) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          frames += 1;
          const parsed = parseFrame(line.slice(5).trim());
          if (parsed.ok) stream.pushEvent(parsed.event);
        }
        index = buffer.indexOf('\n\n');
      }
    }
  } catch {
    // abort：正常收尾路径
  }
})();

await stream.send(prompt);
console.log(`[m1] prompt 已派发（+${Date.now() - t0}ms）`);
await Promise.race([done, timeout]);
controller.abort();
await pump;

const view = stream.getSnapshot();
const turn = view.turns[0];
const toolOk = turn?.trail.some(
  (row) => row.kind === 'tool' && row.status === 'ok' && (row.output ?? '') !== '',
);
const ok =
  frames > 0 &&
  view.invalidFrames === 0 &&
  turn !== undefined &&
  toolOk === true &&
  turn.final !== null;

console.log(`[m1] 帧=${frames} 非法帧=${view.invalidFrames} 耗时=${Date.now() - t0}ms`);
console.log(
  '[m1] 轨迹:',
  JSON.stringify(
    turn?.trail.map((row) =>
      row.kind === 'tool'
        ? {
            tool: row.toolName,
            title: row.title,
            status: row.status,
            out: (row.output ?? '').slice(0, 40),
          }
        : { kind: row.kind },
    ),
  ),
);
console.log('[m1] 回答:', JSON.stringify((turn?.final?.markdown ?? '').slice(0, 120)));
console.log('[m1] usage:', turn?.usage?.totalTokens);
console.log(ok ? '[m1] ✅ 验收通过' : '[m1] ❌ 验收未通过');
process.exit(ok ? 0 : 1);
