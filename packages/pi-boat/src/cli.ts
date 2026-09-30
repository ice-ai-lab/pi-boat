#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTS } from '@ice-ai/protocol';
import { startPiboatServer } from '@ice-ai/server';

/** 构建期由 esbuild 注入（值取自本包 package.json 的 version） */
declare const __PIBOAT_VERSION__: string;

const USAGE = `PiBoat ${__PIBOAT_VERSION__} —— 本机 AI 编程助手（Web 端）

用法:
  pi-boat [选项]

选项:
  -p, --port <端口>   监听端口（默认 ${PORTS.server}，等价环境变量 PORT）
      --no-open       启动后不自动打开浏览器
  -h, --help          显示本帮助并退出
  -v, --version       显示版本并退出
`;

interface StartOptions {
  kind: 'start';
  port: number;
  open: boolean;
}

/** 纯解析：--help/--version 是正常退出，不抛错（调用方据 kind 决定是否启动） */
type ParsedArgs = StartOptions | { kind: 'exit' };

class CliError extends Error {}

function parseArgs(argv: string[]): ParsedArgs {
  let port = Number(process.env.PORT ?? PORTS.server);
  let open = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(USAGE);
      return { kind: 'exit' };
    }
    if (arg === '-v' || arg === '--version') {
      process.stdout.write(`${__PIBOAT_VERSION__}\n`);
      return { kind: 'exit' };
    }
    if (arg === '--no-open') {
      open = false;
      continue;
    }
    if (arg === '-p' || arg === '--port') {
      const value = argv[i + 1];
      if (value === undefined) throw new CliError(`${arg} 需要一个端口值`);
      port = Number(value);
      i += 1;
      continue;
    }
    throw new CliError(`未知选项：${arg}（用 pi-boat --help 查看用法）`);
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new CliError(`端口不合法：${port}`);
  }
  return { kind: 'start', port, open };
}

/** 用系统默认浏览器打开 URL；失败只提示，不阻断服务（headless 环境下属正常） */
function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];

  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    console.error(`[pi-boat] 无法自动打开浏览器，请手动访问 ${url}`);
  });
  child.unref();
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === 'exit') return;

  // dist/pi-boat.mjs 与静态产物同处 dist 下（构建脚本把 apps/web/dist 拷到 dist/web）
  const staticRoot = join(dirname(fileURLToPath(import.meta.url)), 'web');

  startPiboatServer({
    port: parsed.port,
    staticRoot,
    onReady: (url) => {
      console.log(`[pi-boat] 打开 ${url} 开始使用（Ctrl+C 停止）`);
      if (parsed.open) openBrowser(url);
    },
  });
}

try {
  main();
} catch (error) {
  console.error(`[pi-boat] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
