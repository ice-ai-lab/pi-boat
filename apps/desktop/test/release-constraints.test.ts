import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0035 两条发布约束的守门测试：
 * ① 选定 Electron 的内嵌 Node 须 ≥ 22.19（pi SDK engines），不足先升 Electron；
 * ② 桌面端版本与 @ice-ai/pi-boat 绑定、同版本发布（壳 + web 产物 + server 组合验证）。
 */

const require = createRequire(import.meta.url);

function electronBinaryPath(): string {
  const value = require('electron');
  if (typeof value !== 'string') {
    throw new Error('electron package did not resolve to a binary path');
  }
  return value;
}

describe('electron runtime floor (ADR-0035)', () => {
  it('embeds a Node >= 22.19.0', () => {
    const version = execFileSync(electronBinaryPath(), ['-p', 'process.versions.node'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
    }).trim();
    const [major, minor, patch] = version.split('.').map(Number);
    const atLeast =
      (major ?? 0) > 22 ||
      ((major ?? 0) === 22 && ((minor ?? 0) > 19 || ((minor ?? 0) === 19 && (patch ?? 0) >= 0)));
    expect(atLeast, `embedded Node ${version} violates the >=22.19 floor`).toBe(true);
  });
});

describe('version binding (ADR-0035)', () => {
  it('pins @ice-ai/desktop to the same version as @ice-ai/pi-boat', () => {
    const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const desktop = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
      version: string;
    };
    const piBoat = JSON.parse(
      readFileSync(join(packageDir, '../../packages/pi-boat/package.json'), 'utf8'),
    ) as { version: string };
    expect(desktop.version).toBe(piBoat.version);
  });
});
