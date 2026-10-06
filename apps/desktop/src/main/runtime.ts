import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 打包态的运行时定位（ADR-0035）。
 *
 * 关键事实：RunAsNode 子进程是**普通 Node**，读不了 asar——所以 `@ice-ai/pi-boat`
 * 整树（入口 + dist/web 静态产物 + SDK 依赖链）必须整体 asarUnpack（见
 * electron-builder.yml），子进程只从 app.asar.unpacked 下的真实文件系统解析依赖。
 */

/** 打包态 server 子进程入口：app.asar → app.asar.unpacked 的 pi-boat bundle */
export function serverEntryPath(appPath: string): string {
  const unpackedRoot = appPath.replace(/app\.asar$/, 'app.asar.unpacked');
  return join(unpackedRoot, 'node_modules', '@ice-ai', 'pi-boat', 'dist', 'pi-boat.mjs');
}

/** 入口缺失 = 打包装配错位（依赖没进包 / 没解包），启动即报人话，别等超时 */
export function assertServerEntry(entryPath: string): void {
  if (!existsSync(entryPath)) {
    throw new Error(
      `server entry not found: ${entryPath} ` +
        '(packaging must include the @ice-ai/pi-boat dependency and asarUnpack node_modules)',
    );
  }
}

/**
 * Finder 启动的打包应用 PATH 极简（/usr/bin:/bin:…），agent 的 bash 工具会找不到
 * git / pnpm 等。这里用用户登录 shell 取一份完整 PATH 兜底；取不到（无 SHELL /
 * 超时）就放弃，维持继承环境——只在打包态调用一次，不阻塞启动超过 3s。
 */
export function loginShellPath(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const shell = env.SHELL;
  if (shell === undefined || shell === '') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(shell, ['-l', '-c', 'printf %s "$PATH"'], { timeout: 3000 }, (error, stdout) => {
      const value = typeof stdout === 'string' ? stdout.trim() : '';
      resolve(!error && value !== '' ? value : null);
    });
  });
}
