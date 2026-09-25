import { useEffect, useState } from 'react';

export type ServerHealth = 'checking' | 'up' | 'down';

/**
 * F0 连通性探针：经 vite proxy 打 `/api/health`（生产同源直连）。
 * F1 起数据面全部走 `@ice-ai/client`，此探针仅承担骨架自检（验收线：health 打通）。
 */
export function useServerHealth(intervalMs = 15_000): ServerHealth {
  const [health, setHealth] = useState<ServerHealth>('checking');

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const res = await fetch('/api/health');
        if (alive) setHealth(res.ok ? 'up' : 'down');
      } catch {
        if (alive) setHealth('down');
      }
    };
    ping();
    const timer = setInterval(ping, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return health;
}
