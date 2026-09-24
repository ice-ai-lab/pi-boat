import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * `settings.json` 的自由字段读写（带锁 + 原子替换）。
 *
 * 为什么需要自己写这一层：`SettingsManager` 只暴露**已知字段**的 setter
 * （`setEnabledModels` / `setDefaultThinkingLevel` / …）。像 `defaultTools` 这种
 * 没有 setter 的字段，宿主只能自己改文件——但文件同时被 pi CLI/TUI 读写，
 * 裸的 read-modify-write 会把对方的写入吃掉。
 *
 * 锁约定与 pi 一致：**`<file>.lock` 目录**。创建目录是原子的（`mkdir` 已存在即失败），
 * 这与 proper-lockfile 的默认约定相同，因此和 pi CLI 之间也是互斥的——
 * 自己发明一套 `.piboat.lock` 做不到这一点（两边各锁各的等于没锁）。
 *
 * 纪律（与 models.json 相同）：
 * - 读不出来（JSON 坏）→ **抛错**，绝不覆盖：面板的草稿不是从这份文件构建的
 * - 写入原子：先写临时文件再 rename，中途崩不会留下半截配置
 */

/** 锁等待上限：超时后抛错而不是无限等（另一个进程可能已经崩了但锁目录还在） */
const LOCK_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 50;

export class SettingsWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsWriteError';
  }
}

/** 全局设置文件路径（`<agentDir>/settings.json`） */
export function globalSettingsPath(agentDir: string): string {
  return join(agentDir, 'settings.json');
}

/** 项目设置文件路径（`<cwd>/<configDirName>/settings.json`，默认 `.pi`） */
export function projectSettingsPath(cwd: string, configDirName: string): string {
  return join(cwd, configDirName, 'settings.json');
}

export function readSettingsObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    const content = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
    if (content.trim() === '') return {};
    parsed = JSON.parse(stripJsonComments(content));
  } catch (error) {
    throw new SettingsWriteError(
      `settings.json is not readable as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SettingsWriteError('settings.json must contain a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/**
 * 带锁的读-改-写。
 * `mutate` 收到当前对象，返回要落盘的对象（可以直接原地改并返回同一个引用）。
 */
export function updateSettingsObject(
  path: string,
  mutate: (current: Record<string, unknown>) => Record<string, unknown>,
): void {
  const release = acquireLock(path);
  try {
    const next = mutate(readSettingsObject(path));
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8' });
    renameSync(tmp, path);
  } finally {
    release();
  }
}

/**
 * 取锁：`mkdir <path>.lock` 原子成功即持有。
 * 锁目录存在但**过旧**（>30s）视为残留：另一个进程崩在不释放的位置上，
 * 不清理的话这里会永久写不进去。
 */
function acquireLock(path: string): () => void {
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  const dir = dirname(lockPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  for (;;) {
    try {
      mkdirSync(lockPath);
      return () => {
        try {
          rmSync(lockPath, { recursive: true, force: true });
        } catch {
          // 锁已被清理：忽略
        }
      };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'EEXIST') throw error;
      if (isStale(lockPath)) {
        // 残留锁：强行清掉再试一次（清不掉就继续等，由超时兜底）
        try {
          rmSync(lockPath, { recursive: true, force: true });
        } catch {
          // 别处刚清掉
        }
        continue;
      }
      if (Date.now() > deadline) {
        throw new SettingsWriteError(`Timed out waiting for settings lock: ${lockPath}`);
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

function isStale(lockPath: string): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
}

/** 同步小睡：本函数的调用点全在同步写路径上（锁等待必须阻塞） */
function sleepSync(ms: number): void {
  const shared = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(shared), 0, 0, ms);
}

/** 与 pi 的加载器一致：允许 `//` 行注释与尾逗号（手写的 settings.json 常见） */
function stripJsonComments(input: string): string {
  return input
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (match) => (match.startsWith('"') ? match : ''))
    .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, tail?: string) =>
      tail !== undefined ? tail : match.startsWith('"') ? match : '',
    );
}
