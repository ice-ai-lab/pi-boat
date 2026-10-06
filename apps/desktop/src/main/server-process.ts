import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * server 子进程编排（ADR-0035）：用 Electron 本体（RunAsNode）跑 `@ice-ai/pi-boat` 的
 * `dist/pi-boat.mjs`，不要求用户装系统 Node；就绪信号 = 解析 stdout 的
 * `[pi-boat-server] listening on <url>`（`packages/server/src/start.ts` 的 stdout 契约，
 * 两端字面量各持一份、测试锁口径；改 server 侧文案须同步这里）。
 *
 * 本模块不 import electron —— 便于 vitest 直测（nodePath 传系统 node 即可）。
 */

const READY_LINE = /\[pi-boat-server\] listening on (https?:\/\/\S+)/;

/** 单行 stdout → 就绪 URL；非就绪行返回 null */
export function parseReadyLine(line: string): URL | null {
  const match = READY_LINE.exec(line);
  if (match === null || match[1] === undefined) return null;
  try {
    return new URL(match[1]);
  } catch {
    return null;
  }
}

export interface ServerProcessOptions {
  /** Node 可执行文件（生产态 = Electron 二进制 process.execPath；测试态 = node） */
  nodePath: string;
  /** server 入口（@ice-ai/pi-boat/dist/pi-boat.mjs） */
  entryPath: string;
  /** 监听端口；0 = OS 分配（ADR-0035 默认，多开与 CLI 9527 天然不冲突） */
  port: number;
  /** 子进程环境（调用方拼好 PATH 增补等；PORT 在这里注入） */
  env?: NodeJS.ProcessEnv;
  /** 就绪超时（超时/提前退出都进恢复界面） */
  readyTimeoutMs?: number;
  /** 子进程输出旁路（主进程日志） */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
}

const DEFAULT_READY_TIMEOUT_MS = 30_000;
/** SIGTERM 后给 start.ts 优雅退出（disposeAll → 冲刷 → exit 0）的宽限，超了硬杀 */
const STOP_GRACE_MS = 3_000;

export class ServerProcess {
  private readonly options: Required<
    Pick<ServerProcessOptions, 'nodePath' | 'entryPath' | 'port'>
  > &
    ServerProcessOptions;
  private child: ChildProcess | null = null;
  private url: URL | null = null;
  private stopPromise: Promise<void> | null = null;

  constructor(options: ServerProcessOptions) {
    this.options = options;
  }

  /** 就绪后的服务地址（start 成功前为 null） */
  get serverUrl(): URL | null {
    return this.url;
  }

  /**
   * 拉起子进程并等到就绪行。失败路径：超时 / spawn error / 就绪前退出 —— 统一 reject，
   * 并顺手停掉残留子进程；重复 start 视为调用方 bug，直接抛。
   */
  async start(): Promise<URL> {
    if (this.child !== null) {
      throw new Error('[pi-boat-desktop] server process already started');
    }
    const { nodePath, entryPath, port, env, readyTimeoutMs, onLine } = this.options;
    const timeoutMs = readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;

    return new Promise<URL>((resolve, reject) => {
      // ADR-0035：RunAsNode 让 Electron 二进制兼职 Node；--expose-internals 为 DSH 同款对策，
      // 对本仓 bundle 无实际消费，按决策记录保留。
      const child = spawn(nodePath, ['--expose-internals', entryPath], {
        env: { ...env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;

      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void this.stop();
        reject(error);
      };
      const timer = setTimeout(() => {
        fail(new Error(`server not ready within ${timeoutMs}ms (entry: ${entryPath})`));
      }, timeoutMs);

      child.on('error', fail);
      child.on('exit', (code, signal) => {
        if (!settled) {
          fail(
            new Error(
              `server exited before ready (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
            ),
          );
        }
      });

      const watch = (stream: NodeJS.ReadableStream | null, name: 'stdout' | 'stderr') => {
        if (stream === null) return;
        createInterface({ input: stream }).on('line', (line) => {
          onLine?.(line, name);
          const ready = parseReadyLine(line);
          if (ready !== null && !settled) {
            settled = true;
            clearTimeout(timer);
            this.url = ready;
            resolve(ready);
          }
        });
      };
      watch(child.stdout, 'stdout');
      watch(child.stderr, 'stderr');
    });
  }

  /** 幂等停止：SIGTERM（start.ts 已实现优雅退出）→ 宽限后 SIGKILL */
  stop(): Promise<void> {
    if (this.stopPromise !== null) return this.stopPromise;
    const child = this.child;
    if (child === null || child.exitCode !== null || child.signalCode !== null) {
      this.stopPromise = Promise.resolve();
      return this.stopPromise;
    }
    this.stopPromise = new Promise<void>((resolve) => {
      const hardKill = setTimeout(() => {
        child.kill('SIGKILL');
      }, STOP_GRACE_MS);
      child.once('exit', () => {
        clearTimeout(hardKill);
        resolve();
      });
      child.kill('SIGTERM');
    });
    return this.stopPromise;
  }
}
