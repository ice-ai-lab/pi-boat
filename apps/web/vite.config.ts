import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// 端口单一来源仍是 protocol 的 PORTS（docs/01 §5.2）。
// 走相对源码路径而不是 `@ice-ai/protocol` 包名：包入口指向 tsc 产物，
// 而 tsc 的 extensionless 相对 import 在 Node ESM 下不可加载
// （`ERR_MODULE_NOT_FOUND`，docs/04 §8-7 已记录，M4 打包阶段统一收敛）。
import { PORTS } from '../../packages/protocol/src/constants.ts';

/**
 * apps/web（Vite + React 19 SPA，ADR-0002/0009）
 *
 * - 端口单一来源：protocol 的 `PORTS`（web 9528 / server 9527）
 * - dev 接入走 **Vite proxy**（ADR-0009）：`/api`（含 SSE）→ 127.0.0.1:9527，
 *   浏览器视角同源 → `AgentClient` 的 baseURL 是相对路径，dev 与 prod 拓扑一致。
 *   `changeOrigin: false` 让 Host 保持 127.0.0.1:9527（server ① 闸正常放行）；
 *   **不要**开启缓冲/压缩，否则 EventSource 收不到帧。
 * - React Compiler：`react({ compiler: true })`（oxc 的 Rust 版实现，ADR-0009；
 *   遇编译期问题可去掉该选项回退为手写 memo，不违反 ADR）
 */
const apiProxy = {
  '/api': {
    target: `http://127.0.0.1:${PORTS.server}`,
    changeOrigin: false,
  },
} as const;

export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss()],
  server: { port: PORTS.web, strictPort: true, proxy: apiProxy },
  preview: { port: PORTS.web, strictPort: true, proxy: apiProxy },
  build: { outDir: 'dist', sourcemap: true },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
});
