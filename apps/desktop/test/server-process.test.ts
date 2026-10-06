import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerProcess } from '../src/main/server-process';

/**
 * ServerProcess 编排：不依赖 electron——nodePath 直接用测试进程的 node，
 * entry 用临时脚本模拟 pi-boat.mjs 的 stdout 契约。
 */

const KEEPALIVE = 'setInterval(function () {}, 10_000);';

let dir: string;

function writeEntry(name: string, body: string): string {
  dir ??= mkdtempSync(join(tmpdir(), 'pi-boat-desktop-'));
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

const readyEntry = (): string =>
  writeEntry(
    'ready.cjs',
    `console.log('[pi-boat-server] listening on http://127.0.0.1:' + process.env.PORT);\n${KEEPALIVE}`,
  );

const silentEntry = (): string => writeEntry('silent.cjs', KEEPALIVE);

const crashEntry = (): string => writeEntry('crash.cjs', 'process.exit(1);');

const noisyReadyEntry = (): string =>
  writeEntry(
    'noisy-ready.cjs',
    `console.error('[pi-boat] booting…');\nconsole.log('warmup');\nconsole.log('[pi-boat-server] listening on http://127.0.0.1:' + process.env.PORT);\n${KEEPALIVE}`,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ServerProcess', () => {
  it('resolves with the ready URL and keeps it via serverUrl', async () => {
    const proc = new ServerProcess({
      nodePath: process.execPath,
      entryPath: readyEntry(),
      port: 0,
    });
    const url = await proc.start();
    expect(url.port).toBe('0'); // PORT=0 原样传给子进程（真实端口由 server 日志携带）
    expect(proc.serverUrl?.toString()).toBe(url.toString());
    await proc.stop();
  });

  it('passes PORT and the rest of the env to the child', async () => {
    const entry = writeEntry(
      'env.cjs',
      `console.log('[pi-boat-server] listening on http://127.0.0.1:' + process.env.PORT + '/' + process.env.MARKER);\n${KEEPALIVE}`,
    );
    const proc = new ServerProcess({
      nodePath: process.execPath,
      entryPath: entry,
      port: 12345,
      env: { ...process.env, MARKER: 'yes' },
    });
    const url = await proc.start();
    expect(url.port).toBe('12345');
    expect(url.pathname).toBe('/yes');
    await proc.stop();
  });

  it('rejects on ready timeout and stops the child', async () => {
    const proc = new ServerProcess({
      nodePath: process.execPath,
      entryPath: silentEntry(),
      port: 0,
      readyTimeoutMs: 300,
    });
    await expect(proc.start()).rejects.toThrow(/not ready within 300ms/);
    await proc.stop(); // 幂等：残留子进程已随 fail 路径终止
  });

  it('rejects when the child exits before ready', async () => {
    const proc = new ServerProcess({
      nodePath: process.execPath,
      entryPath: crashEntry(),
      port: 0,
    });
    await expect(proc.start()).rejects.toThrow(/exited before ready/);
    await proc.stop();
  });

  it('forwards lines via onLine and finds the ready line among noise', async () => {
    const lines: Array<{ line: string; stream: string }> = [];
    const proc = new ServerProcess({
      nodePath: process.execPath,
      entryPath: noisyReadyEntry(),
      port: 0,
      onLine: (line, stream) => lines.push({ line, stream }),
    });
    const url = await proc.start();
    expect(url.hostname).toBe('127.0.0.1');
    expect(lines.some((entry) => entry.stream === 'stderr' && entry.line.includes('booting'))).toBe(
      true,
    );
    expect(lines.some((entry) => entry.line === 'warmup')).toBe(true);
    await proc.stop();
  });

  it('stop() is idempotent and terminates the child', async () => {
    const proc = new ServerProcess({
      nodePath: process.execPath,
      entryPath: readyEntry(),
      port: 0,
    });
    await proc.start();
    await Promise.all([proc.stop(), proc.stop(), proc.stop()]);
    expect(proc.serverUrl).not.toBeNull();
  });

  it('throws when started twice', async () => {
    const proc = new ServerProcess({
      nodePath: process.execPath,
      entryPath: readyEntry(),
      port: 0,
    });
    const first = proc.start();
    await expect(proc.start()).rejects.toThrow(/already started/);
    await first;
    await proc.stop();
  });
});
