/**
 * M1 core 验收 demo：进程内直接驱动 AgentSessionService 完成一轮对话（不经过 server）。
 *
 * 前置：本机 pi CLI 已配好凭据与模型（~/.pi/agent 的 auth.json / models.json，
 * 与 pi 共用，见 docs/01 §5.3）。
 *
 * 运行（repo 根目录；第二行的 `--` 不可省：实测 pnpm 12 会把 `--cwd` 当成自己的选项
 * 而直接报错，只有 `--` 之后的参数才原样转发给脚本）：
 *   pnpm --filter @ice-ai/core demo:chat "读一下 README.md 并用一句话总结"
 *   pnpm --filter @ice-ai/core demo:chat -- --cwd ~/some-project "列出这个项目的入口文件"
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { WireAgentEvent } from '@ice-ai/protocol';
import { AgentSessionService, SessionNotFoundError } from '../src/agent/agent-session-service';

const DEFAULT_PROMPT = '请读取当前目录的 README.md（若有）并用中文一段话总结这个项目是做什么的。';

/** 未收到 agent_settled 的兜底时间（模型卡住时不至于永久挂住） */
const IDLE_TIMEOUT_MS = 5 * 60_000;

/**
 * 解析 `--cwd <dir>`；其余 token 拼成 prompt。
 * `--cwd` 的取值必须从 prompt 中剔除，否则会被当成用户消息的一部分发给模型。
 */
function parseArgs(argv: string[]): { cwd?: string; prompt: string } {
  const flagIndex = argv.indexOf('--cwd');
  if (flagIndex === -1) return { prompt: argv.join(' ') || DEFAULT_PROMPT };

  const cwd = argv[flagIndex + 1];
  if (cwd === undefined || cwd.startsWith('--')) {
    throw new Error('--cwd 需要跟一个目录（例：--cwd ~/some-project）');
  }
  const promptArgv = [...argv.slice(0, flagIndex), ...argv.slice(flagIndex + 2)];
  return { cwd, prompt: promptArgv.join(' ') || DEFAULT_PROMPT };
}

/**
 * switch 兜底。协议新增 wire 事件时这里有编译错误，强制回来补 render 分支
 * （tsx 不做类型检查，故运行期也抛，免得新事件被静默吞掉）。
 */
function assertNever(event: never): never {
  throw new Error(`render() 未覆盖的 wire 事件：${(event as WireAgentEvent).type}`);
}

function render(event: WireAgentEvent): void {
  switch (event.type) {
    case 'connected':
      console.log(
        `\n🟢 connected (session=${event.sessionId.slice(0, 8)}…, streaming=${event.isStreaming})`,
      );
      break;
    case 'message_update': {
      const sub = event.assistantMessageEvent;
      if (sub.type === 'text_delta') {
        process.stdout.write(sub.delta);
      } else if (sub.type === 'thinking_delta') {
        // 演示用：thinking 只打点不打全文
        process.stdout.write('\x1b[2m·\x1b[0m');
      } else if (sub.type === 'toolcall_start') {
        process.stdout.write(
          `\n\x1b[36m🔧 toolcall ${sub.toolName}(${sub.id.slice(0, 8)}…)\x1b[0m `,
        );
      } else if (sub.type === 'error') {
        console.log(`\n❌ 流内错误（${sub.reason}）`);
      }
      break;
    }
    case 'message_end': {
      if (event.message.role !== 'assistant') break;
      process.stdout.write('\n');
      const { errorMessage, stopReason } = event.message;
      if (errorMessage !== undefined || stopReason === 'error') {
        console.log(`❌ 模型报错（${stopReason}）：${errorMessage ?? '(无错误详情)'}`);
      }
      break;
    }
    case 'tool_execution_start':
      console.log(`\n⚙️  ${event.toolName} 开始执行`);
      break;
    case 'tool_execution_end':
      console.log(`⚙️  ${event.toolName} ${event.isError ? '❌ 出错' : '✅ 完成'}`);
      break;
    case 'queue_update':
      if (event.steering.length > 0 || event.followUp.length > 0) {
        console.log(
          `🧵 queue: steering=${event.steering.length} followUp=${event.followUp.length}`,
        );
      }
      break;
    case 'compaction_start':
      console.log(`\n🗜  上下文压缩开始（${event.reason}）`);
      break;
    case 'compaction_end':
      console.log(`🗜  上下文压缩结束（${event.reason}${event.aborted ? '，已中止' : ''}）`);
      break;
    case 'auto_retry_start':
      console.log(
        `🔁 自动重试 ${event.attempt}/${event.maxAttempts}（${event.delayMs}ms 后）：${event.errorMessage}`,
      );
      break;
    case 'auto_retry_end':
      console.log(`🔁 自动重试结束（${event.success ? '成功' : '放弃'}，第 ${event.attempt} 次）`);
      break;
    case 'summarization_retry_scheduled':
      console.log(
        `🔁 摘要重试 ${event.attempt}/${event.maxAttempts}（${event.delayMs}ms 后）：${event.errorMessage}`,
      );
      break;
    case 'agent_end':
      console.log(
        `\n🏁 agent_end（messages=${event.messages.length}, willRetry=${event.willRetry}）`,
      );
      break;
    case 'agent_settled':
      console.log('✅ agent settled（prompt 轮完成）');
      break;
    case 'session_shutdown':
      console.log(`🔌 session_shutdown (${event.reason ?? 'unknown'})`);
      break;

    // 无需渲染的事件：显式列出，使下面的 default 只承接「协议新增的类型」
    case 'agent_start':
    case 'turn_start':
    case 'turn_end':
    case 'message_start':
    case 'tool_execution_update':
    case 'summarization_retry_attempt_start':
    case 'summarization_retry_finished':
    case 'entry_appended':
    case 'session_info_changed':
    case 'thinking_level_changed':
      break;

    default:
      assertNever(event);
  }
}

async function main(): Promise<void> {
  const { cwd: cwdArg, prompt: promptText } = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(cwdArg ?? process.cwd());
  if (!existsSync(cwd)) throw new Error(`工作目录不存在：${cwd}`);

  console.log(`🚀 pi-boat core demo`);
  console.log(`   cwd:    ${cwd}`);
  console.log(`   prompt: ${promptText.slice(0, 80)}${promptText.length > 80 ? '…' : ''}\n`);

  const service = new AgentSessionService();
  try {
    const created = await service.create({ cwd, type: 'ensure_session' });
    const { sessionId } = created;
    console.log(
      `📝 session created: ${sessionId}\n   model: ${
        created.model ? `${created.model.provider}/${created.model.modelId}` : '(default)'
      }  thinking: ${created.thinkingLevel}`,
    );

    // 单一订阅：渲染 + 完成信号（agent_settled / 超时；命令错误由 send() 上抛）
    let resolveFinish: () => void = () => {};
    const finish = new Promise<void>((resolve) => {
      resolveFinish = resolve;
    });
    const timer = setTimeout(() => {
      console.error(`\n⏱  超时（${IDLE_TIMEOUT_MS / 60_000} 分钟）未收到 agent_settled，强制退出`);
      resolveFinish();
    }, IDLE_TIMEOUT_MS);

    service.subscribe(sessionId, (event) => {
      render(event);
      if (event.type === 'agent_settled') resolveFinish();
    });

    try {
      await service.send(sessionId, { type: 'prompt', message: promptText });
      await finish;
    } finally {
      clearTimeout(timer);
    }

    // 命令通道抽查：stats / tools / last text
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
      // 会话在轮间被回收（idle）：跳过抽查，不影响本轮验收结论
      if (!(error instanceof SessionNotFoundError)) throw error;
    }
  } finally {
    // disposeAll 向仍注册的订阅者广播 session_shutdown（render 打印）后解绑
    service.disposeAll();
  }

  // stdout 为管道时写入是异步的：等 flush 再退出，否则末尾日志会被 process.exit 截断
  await new Promise<void>((resolve) => {
    process.stdout.write('', () => resolve());
  });
  process.exit(0);
}

main().catch((error) => {
  console.error('\n💥 demo failed:', error instanceof Error ? error.message : error);
  if (error instanceof Error && error.message.includes('auth')) {
    console.error('   提示：请先在本机 pi CLI 完成登录/模型配置（与 ~/.pi 共用凭据）');
  }
  process.exit(1);
});
