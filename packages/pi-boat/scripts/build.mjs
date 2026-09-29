import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

/**
 * npm 分发包 `@ice-ai/pi-boat` 的组装脚本（ADR-0004 主分发包；打包问题见 docs/04 §8-7）。
 *
 * 产出一个自包含的 CLI：
 *   dist/piboat.mjs   server + core + protocol 打成单文件（ESM）
 *   dist/web/         apps/web 的静态产物（由 CLI 作为 staticRoot 托管）
 *
 * SDK（pi-coding-agent / pi-ai）保持 external：它含运行时资源与动态导入，打进 bundle
 * 得不偿失，作为 dependencies 由用户安装；其余全部内联，故内部包无需另行发布。
 */
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '../..');
const webDist = join(repoRoot, 'apps/web/dist');

/** 内联包之外的运行时依赖：与 package.json 的 dependencies 保持一一对应 */
const EXTERNAL = ['@earendil-works/pi-ai', '@earendil-works/pi-coding-agent', 'proper-lockfile'];

const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));

// 1. 全量构建：bundle 的输入是各包 dist（core / server / protocol）与 apps/web/dist
execFileSync('pnpm', ['exec', 'turbo', 'run', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (!existsSync(join(webDist, 'index.html'))) {
  throw new Error(`web 静态产物缺失：${webDist}（pnpm turbo run build 应已生成）`);
}

// 2. 打单文件 CLI（banner 提供 CJS require：bundle 内依赖仍可能用它取可选模块）
const dist = join(packageDir, 'dist');
await rm(dist, { recursive: true, force: true });
await esbuild.build({
  entryPoints: [join(packageDir, 'src/cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(dist, 'piboat.mjs'),
  external: EXTERNAL,
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  define: { __PIBOAT_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
});

// 3. 静态产物进 dist/web；README 一并落包（npm 页面读包内 README）
await cp(webDist, join(dist, 'web'), { recursive: true });
await cp(join(repoRoot, 'README.md'), join(packageDir, 'README.md'));

console.log(`[pi-boat] @ice-ai/pi-boat@${pkg.version} 已就绪：${dist}`);
