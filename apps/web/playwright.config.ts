import { defineConfig } from '@playwright/test';
// 端口单一来源（vite.config.ts 同款：源码直读）
import { PORTS } from '../../packages/protocol/src/constants';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${PORTS.web}` },
  webServer: [
    {
      command: 'pnpm --filter @ice-ai/server run dev',
      url: `http://127.0.0.1:${PORTS.server}/api/health`,
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm run dev',
      url: `http://127.0.0.1:${PORTS.web}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
