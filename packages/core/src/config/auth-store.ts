/**
 * auth.json 的凭据存取（`~/.pi/agent/auth.json`）。
 *
 * 为什么不直接调 SDK 的 ModelRuntime.login()：login 在持久化凭据后会做一次
 * **不设上限的目录联网刷新**，慢网络下保存请求会被它挂住（参考实现 #实测同坑）。
 * 所以这里走 provider 自己的 `auth.apiKey.login()` 拿到凭据后，用同一个
 * proper-lockfile 锁（与 pi 的 AuthStorage 同一把）做读改写落盘。
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import lockfile from 'proper-lockfile';

const AUTH_FILE_OPTIONS = { encoding: 'utf-8' } as const;

export type CredentialRemovalResult =
  | { status: 'removed' }
  | { status: 'not_found' }
  | { status: 'type_mismatch'; storedType: string };

/** auth.json 的路径（测试可注入） */
function authStoragePath(agentDir: string = getAgentDir()): string {
  return join(agentDir, 'auth.json');
}

function ensureAuthFile(authPath: string): void {
  const parent = dirname(authPath);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (!existsSync(authPath)) {
    writeFileSync(authPath, '{}', { ...AUTH_FILE_OPTIONS, mode: 0o600 });
    chmodSync(authPath, 0o600);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function updateStoredCredentials<T>(
  authPath: string,
  update: (credentials: Record<string, unknown>) => { result: T; changed: boolean },
): Promise<T> {
  ensureAuthFile(authPath);

  let lockCompromisedError: Error | undefined;
  const release = await lockfile.lock(authPath, {
    retries: {
      retries: 10,
      factor: 2,
      minTimeout: 100,
      maxTimeout: 10_000,
      randomize: true,
    },
    stale: 30_000,
    onCompromised: (error) => {
      lockCompromisedError = error;
    },
  });

  const throwIfCompromised = () => {
    if (lockCompromisedError !== undefined) throw lockCompromisedError;
  };

  try {
    throwIfCompromised();
    const parsed: unknown = JSON.parse(readFileSync(authPath, 'utf-8'));
    if (!isRecord(parsed)) throw new Error('Invalid auth.json: expected an object');

    const { result, changed } = update(parsed);
    if (changed) {
      throwIfCompromised();
      writeFileSync(authPath, `${JSON.stringify(parsed, null, 2)}\n`, {
        ...AUTH_FILE_OPTIONS,
        mode: 0o600,
      });
      chmodSync(authPath, 0o600);
      throwIfCompromised();
    }
    return result;
  } finally {
    try {
      await release();
    } catch {
      // 上面抛出的 compromised-lock 错误比 unlock 错误更有用
    }
  }
}

/** 写入（或替换）一个 provider 的凭据，不触发目录刷新 */
export function storeProviderCredential(
  providerId: string,
  credential: unknown,
  authPath = authStoragePath(),
): Promise<void> {
  return updateStoredCredentials(authPath, (credentials) => {
    credentials[providerId] = credential;
    return { result: undefined, changed: true };
  });
}

/** 只在现存凭据类型匹配时删除（OAuth 凭据不被 API Key 的「断开连接」误删） */
export function removeStoredCredentialIfType(
  providerId: string,
  expectedType: 'api_key' | 'oauth',
  authPath = authStoragePath(),
): Promise<CredentialRemovalResult> {
  return updateStoredCredentials<CredentialRemovalResult>(authPath, (credentials) => {
    if (!Object.hasOwn(credentials, providerId)) {
      return { result: { status: 'not_found' }, changed: false };
    }
    const credential = credentials[providerId];
    const storedType =
      isRecord(credential) && typeof credential.type === 'string' ? credential.type : 'unknown';
    if (storedType !== expectedType) {
      return { result: { status: 'type_mismatch', storedType }, changed: false };
    }
    delete credentials[providerId];
    return { result: { status: 'removed' }, changed: true };
  });
}
