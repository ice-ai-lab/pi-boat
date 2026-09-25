/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
// 端口单一来源：protocol 的 PORTS（源码直读，不依赖构建产物；docs/01 §5.2）
import { PORTS } from '../../packages/protocol/src/constants';

export default defineConfig({
  plugins: [
    tailwindcss(),
    // React Compiler（ADR-0009）；F1 若遇不兼容组件可局部跳过（compiler 配置 filter）
    react({ babel: { plugins: ['babel-plugin-react-compiler'] } }),
  ],
  // 单测只扫 src（e2e 是 Playwright 用例，勿让 vitest 误收）
  test: { include: ['src/**/*.{test,spec}.{ts,tsx}'] },
  server: {
    host: '127.0.0.1', // 显式 IPv4：否则可能只绑 ::1，Playwright/代理探活 127.0.0.1 会拒连
    port: PORTS.web,
    strictPort: true,
    // /api（含 SSE）代理到 agent server（docs/06 §2）：浏览器视角同源，与生产拓扑一致。
    // http-proxy 默认不缓冲响应——禁止开启压缩/缓冲类选项，否则 EventSource 收不到帧
    proxy: {
      '/api': { target: `http://127.0.0.1:${PORTS.server}` },
    },
  },
});
