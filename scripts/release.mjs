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
 *   pnpm release [patch|minor|major|x.y.z] [--dry-run] [--yes]
 *
 * The working tree must be clean and on `main`; the version is bumped in
 * packages/pi-boat/package.json and committed as `chore(pi-boat): release vX.Y.Z`.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(repoRoot, 'packages/pi-boat');
const packagePath = join(packageDir, 'package.json');

const PACKAGE_NAME = '@ice-ai/pi-boat';
const NPM_REGISTRY = 'https://registry.npmjs.org';
const RELEASE_BRANCH = 'main';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const assumeYes = args.includes('--yes') || args.includes('-y');
const bump = args.find((arg) => !arg.startsWith('-')) ?? 'patch';

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const currentVersion = pkg.version;
const nextVersion = resolveVersion(currentVersion, bump);
const tag = `v${nextVersion}`;

function capture(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function run(command, commandArgs, options = {}) {
  const label = [command, ...commandArgs].join(' ');
  if (dryRun) {
    console.log(`[dry-run] ${label}`);
    return;
  }
  console.log(`[release] ${label}`);
  execFileSync(command, commandArgs, { cwd: repoRoot, stdio: 'inherit', ...options });
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
    const output = capture('npm', [
      'view',
      `${PACKAGE_NAME}@${version}`,
      'version',
      `--registry=${NPM_REGISTRY}`,
    ]);
    return output.length > 0;
  } catch {
    return false;
  }
}

function checkPreconditions() {
  if (capture('git', ['status', '--porcelain']) !== '') {
    throw new Error('Working tree is not clean; commit or stash your changes before releasing.');
  }
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== RELEASE_BRANCH) {
    throw new Error(`Releases must be cut from ${RELEASE_BRANCH} (currently on ${branch}).`);
  }
  try {
    capture('gh', ['auth', 'status']);
  } catch {
    throw new Error('gh is not authenticated; run `gh auth login` first.');
  }
  try {
    capture('npm', ['whoami', `--registry=${NPM_REGISTRY}`]);
  } catch {
    throw new Error(`npm is not authenticated against ${NPM_REGISTRY}; run \`npm login\`.`);
  }
  if (isPublished(nextVersion)) {
    throw new Error(`${PACKAGE_NAME}@${nextVersion} is already published on npm.`);
  }
  run('git', ['fetch', 'origin', RELEASE_BRANCH]);
  try {
    capture('git', ['merge-base', '--is-ancestor', `origin/${RELEASE_BRANCH}`, 'HEAD']);
  } catch {
    throw new Error(
      `Local ${RELEASE_BRANCH} is behind origin/${RELEASE_BRANCH}; pull before releasing.`,
    );
  }
}

async function confirm() {
  const plan = [
    `Release ${PACKAGE_NAME} ${currentVersion} -> ${nextVersion}`,
    `  1. bump packages/pi-boat/package.json and build the bundle`,
    `  2. commit "chore(pi-boat): release ${tag}" and create tag ${tag}`,
    `  3. push ${RELEASE_BRANCH} and ${tag} to origin`,
    `  4. publish to ${NPM_REGISTRY}`,
    `  5. create GitHub Release ${tag} with the packed tarball`,
  ].join('\n');
  console.log(plan);
  if (assumeYes || dryRun) return;
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
  checkPreconditions();
  await confirm();

  console.log(`\n[release] ${PACKAGE_NAME} ${currentVersion} -> ${nextVersion}`);
  if (!dryRun) {
    writeFileSync(packagePath, `${JSON.stringify({ ...pkg, version: nextVersion }, null, 2)}\n`);
  }

  run('pnpm', ['run', 'bundle']);

  run('git', ['add', 'packages/pi-boat/package.json']);
  run('git', ['commit', '-m', `chore(pi-boat): release ${tag}`]);
  run('git', ['tag', tag]);

  const tarball = dryRun ? join(repoRoot, `ice-ai-pi-boat-${nextVersion}.tgz`) : packTarball();

  run('git', ['push', 'origin', RELEASE_BRANCH]);
  run('git', ['push', 'origin', tag]);
  run('npm', ['publish', tarball, `--registry=${NPM_REGISTRY}`, '--access', 'public']);
  run('gh', ['release', 'create', tag, tarball, '--title', tag, '--generate-notes']);

  console.log(`\n[release] ${tag} is live (npm + GitHub Release).`);
}

try {
  await main();
} catch (error) {
  console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
