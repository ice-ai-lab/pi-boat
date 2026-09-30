#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTS } from '@ice-ai/protocol';
import { startPiboatServer } from '@ice-ai/server';

/** Injected at build time by esbuild (value read from this package's package.json version) */
declare const __PIBOAT_VERSION__: string;

const USAGE = `PiBoat ${__PIBOAT_VERSION__} — local AI coding assistant (web)

Usage:
  pi-boat [options]

Options:
  -p, --port <port>   Port to listen on (default ${PORTS.server}, same as the PORT env var)
      --no-open       Do not open the browser automatically after startup
  -h, --help          Show this help and exit
  -v, --version       Show the version and exit
`;

interface StartOptions {
  kind: 'start';
  port: number;
  open: boolean;
}

/** Pure parsing: --help/--version are a normal exit, not an error (the caller decides whether to start based on kind) */
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
      if (value === undefined) throw new CliError(`${arg} requires a port value`);
      port = Number(value);
      i += 1;
      continue;
    }
    throw new CliError(`Unknown option: ${arg} (run pi-boat --help for usage)`);
  }

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new CliError(`Invalid port: ${port}`);
  }
  return { kind: 'start', port, open };
}

/** Open the URL in the system default browser; failures only warn and never block the server (expected in headless environments) */
function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];

  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    console.error(
      `[pi-boat] Could not open the browser automatically, please visit ${url} manually`,
    );
  });
  child.unref();
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === 'exit') return;

  // dist/pi-boat.mjs and the static assets live side by side under dist (the build script copies apps/web/dist to dist/web)
  const staticRoot = join(dirname(fileURLToPath(import.meta.url)), 'web');

  startPiboatServer({
    port: parsed.port,
    staticRoot,
    onReady: (url) => {
      console.log(`[pi-boat] Open ${url} to start (Ctrl+C to stop)`);
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
