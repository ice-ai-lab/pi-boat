/**
 * M1 core 验收 demo：进程内直接驱动 AgentSessionService 完成一轮对话（不经过 server）。
 *
 * 前置：本机 pi CLI 已配好凭据与模型（~/.pi/agent 的 auth.json / models.json，
 * 与 pi 共用，见 docs/01 §5.3）。
 *
 * 运行（repo 根目录）：
 *   pnpm --filter @ice-ai/core demo:chat "读一下 README.md 并用一句话总结"
 *   pnpm --filter @ice-ai/core demo:chat --cwd ~/some-project "列出这个项目的入口文件"
 */
import process from 'node:process';
import type { ClientAgentEvent } from '@ice-ai/protocol';
import { AgentSessionService, SessionNotFoundError } from '../src/agent/agent-session-service';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const promptText =
  process.argv
    .slice(2)
    .filter((a) => !a.startsWith('--'))
    .join(' ') || '请读取当前目录的 README.md（若有）并用中文一段话总结这个项目是做什么的。';
const cwd = arg('cwd') ?? process.cwd();

// ---------------------------------------------------------------------------

const service = new AgentSessionService();

function render(event: ClientAgentEvent): void {
  switch (event.type) {
    case 'connected':
      console.log(
        `\n🟢 connected (session=${event.sessionId.slice(0, 8)}…, streaming=${event.isStreaming})`,
      );
      break;
    case 'message_start':
      break;
    case 'message_update': {
      const e = event.assistantMessageEvent;
      if (e.type === 'text_delta') {
        process.stdout.write(e.delta);
      } else if (e.type === 'thinking_delta') {
        // 演示用：thinking 只打点不打全文
        process.stdout.write('\x1b[2m·\x1b[0m');
      } else if (e.type === 'toolcall_start') {
        process.stdout.write(`\n\x1b[36m🔧 toolcall ${e.toolName}(${e.id.slice(0, 8)}…)\x1b[0m `);
      }
      break;
    }
    case 'tool_execution_start':
      console.log(`\n⚙️  ${event.toolName} 开始执行`);
      break;
    case 'tool_execution_end':
      console.log(`⚙️  ${event.toolName} ${event.isError ? '❌ 出错' : '✅ 完成'}`);
      break;
    case 'message_end':
      if (event.message.role === 'assistant') process.stdout.write('\n');
      break;
    case 'queue_update':
      if (event.steering.length > 0 || event.followUp.length > 0) {
        console.log(
          `🧵 queue: steering=${event.steering.length} followUp=${event.followUp.length}`,
        );
      }
      break;
    case 'agent_end':
      console.log(`🏁 agent_end (messages=${event.messages.length}, willRetry=${event.willRetry})`);
      break;
    case 'prompt_done':
      console.log('✅ prompt_done');
      break;
    case 'prompt_error':
      console.error(`\n❌ prompt_error: ${event.errorMessage}`);
      break;
    case 'startup_error':
      console.error(`❌ startup_error: ${event.errorMessage}`);
      break;
    case 'session_shutdown':
      console.log(`🔌 session_shutdown (${event.reason ?? 'unknown'})`);
      break;
    default:
      break;
  }
}

async function main(): Promise<void> {
  console.log(`🚀 pi-boat core demo`);
  console.log(`   cwd:    ${cwd}`);
  console.log(`   prompt: ${promptText.slice(0, 80)}${promptText.length > 80 ? '…' : ''}\n`);

  const created = await service.create({ cwd, type: 'ensure_session' });
  const { sessionId } = created;
  console.log(
    `📝 session created: ${sessionId}\n   model: ${created.model ? `${created.model.provider}/${created.model.modelId}` : '(default)'}  thinking: ${created.thinkingLevel}`,
  );

  // 单一订阅：渲染 + 完成信号（prompt_done / prompt_error / 超时）
  let resolveFinish: () => void = () => {};
  const finish = new Promise<void>((resolve) => {
    resolveFinish = resolve;
  });
  const timer = setTimeout(() => {
    console.error('\n⏱  超时（5 分钟）未收到 prompt_done，强制退出');
    resolveFinish();
  }, 5 * 60_000);

  const unsubscribe = service.subscribe(sessionId, (event) => {
    render(event);
    if (event.type === 'prompt_done' || event.type === 'prompt_error') {
      clearTimeout(timer);
      resolveFinish();
    }
  });

  await service.send(sessionId, { type: 'prompt', message: promptText });
  await finish;

  unsubscribe();

  // 展示命令通道：stats / tools / last text
  try {
    const stats = await service.send(sessionId, { type: 'get_session_stats' });
    console.log(
      `\n📊 stats: user=${stats.userMessages} assistant=${stats.assistantMessages} toolCalls=${stats.toolCalls} tokens(in/out)=${stats.tokens.input}/${stats.tokens.output} cost=$${stats.cost.toFixed(4)}`,
    );
    const tools = await service.send(sessionId, { type: 'get_tools' });
    console.log(
      `🧰 tools(active): ${
        tools
          .filter((t) => t.active)
          .map((t) => t.name)
          .join(', ') || '(none)'
      }`,
    );
    const last = await service.send(sessionId, { type: 'get_last_assistant_text' });
    if (last.text) console.log(`\n💬 最后回复（前 300 字）：\n${last.text.slice(0, 300)}`);
  } catch (error) {
    if (!(error instanceof SessionNotFoundError)) throw error;
  }

  service.disposeAll();
  process.exit(0);
}

main().catch((error) => {
  console.error('\n💥 demo failed:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.message.includes('auth')) {
    console.error('   提示：请先在本机 pi CLI 完成登录/模型配置（与 ~/.pi 共用凭据）');
  }
  service.disposeAll();
  process.exit(1);
});
