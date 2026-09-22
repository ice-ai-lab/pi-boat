# pi-boat

> 载着 pi 航行的船：基于 `@earendil-works/pi-coding-agent` SDK 的本地 AI 编程助手（一核多端）。

设计文档见 `docs/01-overview.md`，架构决策见 `docs/adr/`，协作规则见 `AGENTS.md`。

## 快速开始

```bash
pnpm install        # Node ≥ 22.19（engines 强制）
pnpm turbo run dev  # agent server (9527, tsx watch) + web (vite dev, 9528)
pnpm turbo run dev:libs   # 要改 packages/* 源码时另开一个终端（tsc watch）
pnpm turbo run build
pnpm turbo run test
pnpm turbo run lint
```

开发期浏览器只访问 **http://localhost:9528**（vite dev），`/api/*`（含 SSE）由 Vite proxy 转发到 9527
（ADR-0009）——与生产同源拓扑一致；不要绕过代理直连 9527（会撞上 Origin / Sec-Fetch-Site 闸）。

- 生产模式：`pnpm turbo run build` 后 `node packages/server/dist/main.js`（或 `piboat-server`），
  单进程同时服务页面 + API + SSE
- 首个会话：首页填写工作目录（绝对路径）→ 发第一条消息（cwd 存在性由 core 校验）
- Agent 需要 pi 的模型凭据（`~/.pi/agent/`，与 pi CLI 共用）
- 端到端验收（不开浏览器也能跑）：`pnpm --filter @ice-ai/client run acceptance:m1`
  （需 server 在跑；会真实调用一次模型）

## 结构

```
apps/web            前端 SPA（Vite + React 19 + TanStack Query + React Router v7）
packages/protocol   API 契约 & 事件 wire 格式（纯类型 + Zod，零业务逻辑）
packages/core       Agent 业务核心（全仓唯一允许依赖 pi SDK 的包）
packages/server     Hono HTTP/SSE 服务，组装 core（bin: piboat-server）
packages/client     类型安全 client SDK + React hooks（`/react` 子导出）
packages/ui         纯展示组件库（token 单一来源 `theme.css`）
packages/config/    typescript-config（lint/format：根 biome.json）
```

依赖方向自上而下单向：`apps/* → client → protocol`；`apps/server → core → protocol`。
