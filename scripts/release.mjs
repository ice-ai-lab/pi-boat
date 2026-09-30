#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

/**
 * One-command release for the `@ice-ai/pi-boat` npm package.
 *
 * It bumps the version, builds the bundle, commits and tags it, pushes to GitHub,
 * publishes to npm, and creates a GitHub Release with the packed tarball attached.
 *
 * Usage:
 *   pnpm release [patch|minor|major|x.y.z] [--dry-run] [--yes] [--otp <code>]
 *   pnpm release --resume [--otp <code>]     # finish a release that failed midway
 *
 * The working tree must be clean and on `main`; the version is bumped in
 * packages/pi-boat/package.json and committed as `chore(pi-boat): release vX.Y.Z`.
 * That file is the single source of the app version: the web bundle reads it at build time
 * (apps/web/vite.config.ts), so the in-app label follows automatically.
 * With `--resume` no bump/commit/tag/push happens: it only (re)packs, publishes the
 * tarball to npm if missing, and creates the GitHub Release if missing.
 *
 * GitHub Release steps deliberately ignore `GH_TOKEN` / `GITHUB_TOKEN` from the
 * environment and use the keyring `gh auth login` account instead: the env token is
 * usually a fine-grained PAT without `Contents: write`, and gh prefers it over the
 * keyring, so `gh release create` fails with HTTP 403 *after* npm has already published.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(repoRoot, 'packages/pi-boat');
const packagePath = join(packageDir, 'package.json');

const PACKAGE_NAME = '@ice-ai/pi-boat';
const NPM_REGISTRY = 'https://registry.npmjs.org';
const RELEASE_BRANCH = 'main';

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const options = parseOptions(process.argv.slice(2));

function parseOptions(argv) {
  const parsed = {
    dryRun: false,
    yes: false,
    resume: false,
    bump: 'patch',
    otp: undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--yes' || arg === '-y') parsed.yes = true;
    else if (arg === '--resume') parsed.resume = true;
    else if (arg === '--otp') {
      parsed.otp = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--otp=')) parsed.otp = arg.slice('--otp='.length);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else parsed.bump = arg;
  }
  return parsed;
}

function capture(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function run(command, commandArgs, { dryRun = false, ...options } = {}) {
  const label = [command, ...commandArgs].join(' ');
  if (dryRun) {
    console.log(`[dry-run] ${label}`);
    return;
  }
  console.log(`[release] ${label}`);
  execFileSync(command, commandArgs, { cwd: repoRoot, stdio: 'inherit', ...options });
}

/**
 * gh 调用的环境：剔除 `GH_TOKEN` / `GITHUB_TOKEN`。
 *
 * 壳里常驻的那份是 fine-grained PAT，通常没有 org 仓库的 `Contents: write`，而 gh 会
 * **优先**用它、把 keyring 里的 `gh auth login` 登录晾在一边——两次发布（v1.3.2 / v1.3.3）
 * 都因此倒在最后一步：npm 已经 publish 完，`gh release create` 吃 `HTTP 403`，
 * 留下一个没有 GitHub Release 的版本。剔除后 gh 回落 keyring，才能拿到 release 权限。
 */
function releaseGhEnv() {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return env;
}

/** 环境里是否带了会被 gh 优先采用的 token（用于把提示说清楚） */
function hasGhTokenEnv() {
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: release 脚本不走 turbo（根 package.json 的 `pnpm release` 直调 node），turbo.json 的 env 声明与它无关
  return Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
}

function resolveVersion(current, spec) {
  if (/^\d+\.\d+\.\d+$/.test(spec)) return spec;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (match === null) throw new Error(`Cannot parse current version: ${current}`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (spec === 'major') [major, minor, patch] = [major + 1, 0, 0];
  else if (spec === 'minor') [minor, patch] = [minor + 1, 0];
  else if (spec === 'patch') patch += 1;
  else throw new Error(`Unknown bump type "${spec}" (use patch, minor, major, or x.y.z)`);
  return `${major}.${minor}.${patch}`;
}

function isPublished(version) {
  try {
    return (
      capture('npm', [
        'view',
        `${PACKAGE_NAME}@${version}`,
        'version',
        `--registry=${NPM_REGISTRY}`,
      ]) !== ''
    );
  } catch {
    return false;
  }
}

function hasRelease(tag) {
  try {
    return (
      capture('gh', ['release', 'view', tag, '--json', 'tagName'], { env: releaseGhEnv() }) !== ''
    );
  } catch {
    return false;
  }
}

function checkEnvironment() {
  if (capture('git', ['status', '--porcelain']) !== '') {
    throw new Error('Working tree is not clean; commit or stash your changes before releasing.');
  }
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== RELEASE_BRANCH) {
    throw new Error(`Releases must be cut from ${RELEASE_BRANCH} (currently on ${branch}).`);
  }
  // Release 权限的预检做在 bump/publish **之前**：否则 npm 已经发出去、最后一步才挂，
  // 又得手动收尾（--resume 只能补对，不能撤）。
  if (hasGhTokenEnv()) {
    console.log(
      '[release] GH_TOKEN/GITHUB_TOKEN is set; GitHub Release steps use the keyring `gh auth login` account instead',
    );
  }
  try {
    capture('gh', ['auth', 'status'], { env: releaseGhEnv() });
  } catch {
    throw new Error(
      hasGhTokenEnv()
        ? 'No usable gh account for GitHub Releases: GH_TOKEN/GITHUB_TOKEN is skipped on purpose ' +
            '(it usually lacks Contents:write) and no keyring login was found; run `gh auth login`.'
        : 'gh is not authenticated; run `gh auth login` first.',
    );
  }
  try {
    capture('npm', ['whoami', `--registry=${NPM_REGISTRY}`]);
  } catch {
    throw new Error(`npm is not authenticated against ${NPM_REGISTRY}; run \`npm login\`.`);
  }
  capture('git', ['fetch', 'origin', RELEASE_BRANCH]);
  try {
    capture('git', ['merge-base', '--is-ancestor', `origin/${RELEASE_BRANCH}`, 'HEAD']);
  } catch {
    throw new Error(
      `Local ${RELEASE_BRANCH} is behind origin/${RELEASE_BRANCH}; pull before releasing.`,
    );
  }
}

async function confirm(version, tag) {
  const plan = [
    `Release ${PACKAGE_NAME} ${pkg.version} -> ${version}`,
    '  1. bump packages/pi-boat/package.json (single source of the app version), build the bundle',
    `  2. commit "chore(pi-boat): release ${tag}" and create tag ${tag}`,
    `  3. push ${RELEASE_BRANCH} and ${tag} to origin`,
    `  4. publish to ${NPM_REGISTRY}`,
    `  5. create GitHub Release ${tag} with the packed tarball`,
  ].join('\n');
  console.log(plan);
  if (options.yes || options.dryRun) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nProceed? [y/N] ');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) throw new Error('Release cancelled.');
}

function packTarball() {
  const output = capture(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', repoRoot, '--silent'],
    { cwd: packageDir },
  );
  const file = output.split('\n').pop().trim();
  return isAbsolute(file) ? file : join(repoRoot, file);
}

async function main() {
  const version = options.resume ? pkg.version : resolveVersion(pkg.version, options.bump);
  const tag = `v${version}`;

  checkEnvironment();
  if (!options.resume && isPublished(version)) {
    throw new Error(`${PACKAGE_NAME}@${version} is already published on npm.`);
  }

  if (options.resume) {
    console.log(`[release] resuming ${PACKAGE_NAME}@${version} (${tag})`);
    run('pnpm', ['run', 'bundle'], { dryRun: options.dryRun });
  } else {
    console.log(`[release] ${PACKAGE_NAME} ${pkg.version} -> ${version}`);
    await confirm(version, tag);
    if (!options.dryRun) {
      writeFileSync(packagePath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`);
    }
    run('pnpm', ['run', 'bundle'], { dryRun: options.dryRun });
    run('git', ['add', 'packages/pi-boat/package.json'], { dryRun: options.dryRun });
    run('git', ['commit', '-m', `chore(pi-boat): release ${tag}`], { dryRun: options.dryRun });
    run('git', ['tag', tag], { dryRun: options.dryRun });
    run('git', ['push', 'origin', RELEASE_BRANCH], { dryRun: options.dryRun });
    run('git', ['push', 'origin', tag], { dryRun: options.dryRun });
  }

  const tarball = options.dryRun ? join(repoRoot, `ice-ai-pi-boat-${version}.tgz`) : packTarball();

  if (options.dryRun || !isPublished(version)) {
    const otpArgs = options.otp ? [`--otp=${options.otp}`] : [];
    run(
      'npm',
      ['publish', tarball, `--registry=${NPM_REGISTRY}`, '--access', 'public', ...otpArgs],
      { dryRun: options.dryRun },
    );
  } else {
    console.log(`[release] ${PACKAGE_NAME}@${version} is already on npm; skipping publish`);
  }

  if (options.dryRun || !hasRelease(tag)) {
    try {
      run('gh', ['release', 'create', tag, tarball, '--title', tag, '--generate-notes'], {
        dryRun: options.dryRun,
        env: releaseGhEnv(),
      });
    } catch (error) {
      // 到这里 npm 已经 publish 成功，只差 GitHub Release：把失败原因和收尾命令说清楚，
      // 不把 execFileSync 的 `Command failed ... HTTP 403` 原样丢出来。
      throw new Error(
        `Failed to create GitHub Release ${tag} (npm publish already succeeded).\n` +
          `  ${error instanceof Error ? error.message : String(error)}\n` +
          '  Finish it manually, or re-run `pnpm release --resume`:\n' +
          `    env -u GH_TOKEN -u GITHUB_TOKEN gh release create ${tag} ${tarball} --title ${tag} --generate-notes`,
      );
    }
  } else {
    console.log(`[release] GitHub Release ${tag} already exists; skipping`);
  }

  console.log(`\n[release] ${tag} is live (npm + GitHub Release).`);
}

try {
  await main();
} catch (error) {
  console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
