import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

/**
 * Desktop 壳构建脚本（ADR-0035）：main + preload 各出一个 esbuild bundle（external: electron；
 * ADR-0030 同款思路），renderer 零自有代码——生产态页面来自 @ice-ai/pi-boat 托管的 web 产物，
 * dev 态直连 vite dev（9528），本脚本不碰 web 流水线。
 *
 *   dist/main/index.js      ESM（Electron ≥28 支持 ESM main）
 *   dist/preload/index.cjs  CJS（sandbox preload 只走 CJS require）
 *   dist/recovery.html      启动失败恢复页（静态，无构建）
 *
 * 产物出口一律 external 到运行时提供的模块：electron 由 Electron 本体提供，node:* 内建。
 * bundle 完成后做「desktop-bundle-imports」静态检查（ADR-0035）：metafile 里凡 external
 * 导入必须是白名单成员，打包期抓不可解析的裸导入，而不是等运行时崩溃。
 */
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(packageDir, 'dist');

const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));

/** main bundle 里允许保持 external 的模块（node:* 由 esbuild platform=node 自动 external） */
const MAIN_EXTERNALS = ['electron'];
/** preload 同上；sandbox 环境只给得出 electron 的渲染面 API */
const PRELOAD_EXTERNALS = ['electron'];

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
};

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, 'main'), { recursive: true });
await mkdir(join(dist, 'preload'), { recursive: true });

const [mainResult, preloadResult] = await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [join(packageDir, 'src/main/index.ts')],
    outfile: join(dist, 'main/index.js'),
    format: 'esm',
    external: MAIN_EXTERNALS,
    metafile: true,
  }),
  esbuild.build({
    ...common,
    entryPoints: [join(packageDir, 'src/preload/index.ts')],
    outfile: join(dist, 'preload/index.cjs'),
    format: 'cjs',
    external: PRELOAD_EXTERNALS,
    metafile: true,
  }),
]);

await copyFile(join(packageDir, 'src/recovery.html'), join(dist, 'recovery.html'));

// desktop-bundle-imports 静态检查：external 导入 = 运行时必须解析得到的模块。
// 白名单外出现任何裸导入（比如手滑 import 了某个 devDep）都在这里爆，而不是装到用户机器上才炸。
for (const [label, result, externals] of [
  ['main', mainResult, MAIN_EXTERNALS],
  ['preload', preloadResult, PRELOAD_EXTERNALS],
]) {
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imported of output.imports) {
      if (!imported.external) continue; // 已被内联
      if (imported.path.startsWith('node:')) continue;
      if (externals.includes(imported.path)) continue;
      throw new Error(
        `[${label}] external import "${imported.path}" is not in the runtime allowlist ` +
          `(${[...externals].join(', ')} + node:*) — bundle it or declare it as a runtime dependency`,
      );
    }
  }
}

// Electron 内嵌 Node 底线（ADR-0035：须 ≥ 22.19，SDK engines）——构建期就拦，别等装完才发现
const embeddedNode = execFileSync(execPathOfElectron(), ['-p', 'process.versions.node'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
}).trim();
const [major, minor] = embeddedNode.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  throw new Error(
    `Electron's embedded Node is ${embeddedNode}; the pi SDK requires >=22.19 (upgrade Electron first, ADR-0035)`,
  );
}

console.log(
  `[desktop] @ice-ai/desktop@${pkg.version} built: ${dist} (embedded Node ${embeddedNode})`,
);

function execPathOfElectron() {
  // electron npm 包在 Node 语境下导出二进制路径（CJS default export）
  const value = createRequire(import.meta.url)('electron');
  if (typeof value !== 'string') {
    throw new Error('electron package did not resolve to a binary path (is it installed?)');
  }
  return value;
}
