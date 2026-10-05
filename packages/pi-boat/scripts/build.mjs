import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

/**
 * Assembly script for the npm distribution package `@ice-ai/pi-boat` (ADR-0004 main distribution package; packaging details in docs/04 §8-7).
 *
 * Produces a self-contained CLI:
 *   dist/pi-boat.mjs   server + core + protocol bundled into a single file (ESM)
 *   dist/web/         static build output of apps/web (served by the CLI as staticRoot)
 *
 * The SDK (pi-coding-agent / pi-ai) stays external: it ships runtime assets and dynamic imports, so
 * bundling it is not worth it — users install it as a dependency. Everything else is inlined,
 * so the internal packages do not need to be published separately.
 */
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageDir, '../..');
const webDist = join(repoRoot, 'apps/web/dist');

/** Runtime dependencies kept outside the bundle: one-to-one with package.json dependencies */
const EXTERNAL = ['@earendil-works/pi-ai', '@earendil-works/pi-coding-agent', 'proper-lockfile'];

const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));

// ADR-0033 决策 5：上游 1.0.2 起移除 npm-shrinkwrap.json，终端用户安装时 SDK 的传递依赖不再被
// 上游锁定。发布前在此断言安装树里的 SDK 版本落在 package.json 声明的 `~` 范围内——
// 版本漂移在 pack 时暴露，而不是在用户机器上。
for (const name of ['@earendil-works/pi-ai', '@earendil-works/pi-coding-agent']) {
  const installed = JSON.parse(
    await readFile(join(packageDir, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'),
  ).version;
  // `~X.Y.Z` 语义：同 major.minor 内浮动（与全仓版本锁策略一致），不引 semver 依赖
  const [wantMajor, wantMinor] = pkg.dependencies[name].replace(/^~/, '').split('.').map(Number);
  const [gotMajor, gotMinor] = installed.split('.').map(Number);
  if (gotMajor !== wantMajor || gotMinor !== wantMinor) {
    throw new Error(
      `Installed ${name}@${installed} is outside the declared range ${pkg.dependencies[name]}` +
        ' (upgrade the dependency or align the install tree before publishing)',
    );
  }
}

// 1. Full build: the bundle inputs are each package's dist (core / server / protocol) and apps/web/dist
execFileSync('pnpm', ['exec', 'turbo', 'run', 'build'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (!existsSync(join(webDist, 'index.html'))) {
  throw new Error(
    `Missing web static build output: ${webDist} (pnpm turbo run build should have produced it)`,
  );
}

// 2. Bundle the single-file CLI (banner provides CJS require: bundled dependencies may still use it to load optional modules)
const dist = join(packageDir, 'dist');
await rm(dist, { recursive: true, force: true });
await esbuild.build({
  entryPoints: [join(packageDir, 'src/cli.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(dist, 'pi-boat.mjs'),
  external: EXTERNAL,
  banner: {
    js: "import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);",
  },
  define: { __PIBOAT_VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
});

// 3. Move static assets into dist/web; copy the README along too (the npm page reads the package README)
await cp(webDist, join(dist, 'web'), { recursive: true });
await cp(join(repoRoot, 'README.md'), join(packageDir, 'README.md'));

console.log(`[pi-boat] @ice-ai/pi-boat@${pkg.version} is ready: ${dist}`);
