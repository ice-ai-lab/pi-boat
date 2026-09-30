#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTS } from '@ice-ai/protocol';
import { startPiboatServer } from './start';

/**
 * 仓库内入口（dev / Docker / Electron 子进程）：环境变量 PORT 覆盖端口。
 * 启动序列与优雅退出见 start.ts；npm 分发的 `pi-boat` CLI 复用同一函数。
 */
// apps/web/dist：src 与 dist 同深度（packages/server/<dir> → 仓库根的 apps/web/dist）
const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../..', 'apps/web/dist');

startPiboatServer({
  port: Number(process.env.PORT ?? PORTS.server),
  staticRoot: webDist,
});
