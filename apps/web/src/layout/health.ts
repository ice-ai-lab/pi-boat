import { CLIENT_VERSION } from '@ice-ai/client';
import { useEffect, useState } from 'react';

export type ServerHealth = 'checking' | 'up' | 'down';

export interface ServerInfo {
  health: ServerHealth;
  /** pi SDK 版本（由 server 的 /api/health 提供） */
  piVersion: string | null;
}

/** 应用版本（web 侧唯一来源：client 包从 protocol 派生的版本串，如 `0.1.0 (protocol v1)`） */
export const APP_VERSION = CLIENT_VERSION.split(' ')[0] ?? '0.0.0';

/**
 * 服务信息探针：`/api/health` 同时给出连通性与运行时 pi 版本（空态版本块用）。
 * F0 起只承担骨架自检与版本展示；数据面全部走 `@ice-ai/client`。
 */
export function useServerInfo(intervalMs = 15_000): ServerInfo {
  const [info, setInfo] = useState<ServerInfo>({ health: 'checking', piVersion: null });

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch('/api/health');
        if (!alive) return;
        if (!res.ok) {
          setInfo((previous) => ({ ...previous, health: 'down' }));
          return;
        }
        const data = (await res.json()) as { piVersion?: string };
        setInfo({
          health: 'up',
          piVersion: typeof data.piVersion === 'string' ? data.piVersion : null,
        });
      } catch {
        if (alive) setInfo((previous) => ({ ...previous, health: 'down' }));
      }
    };
    ping();
    const timer = setInterval(ping, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return info;
}
