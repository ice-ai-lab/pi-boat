# pi-boat

> 载着 pi 航行的船：基于 `@earendil-works/pi-coding-agent` SDK 的本地 AI 编程助手（一核多端）。

设计文档见 `docs/01-overview.md`，架构决策见 `docs/adr/`，协作规则见 `AGENTS.md`。

## 快速开始

```bash
pnpm install        # Node ≥ 22.19（engines 强制）
pnpm turbo run dev  # 目前仅 agent server (9527)；web 前端待建（Vite + React，dev 端口 9528）
pnpm turbo run build
pnpm turbo run test
pnpm turbo run lint
```

- 生产模式：agent server 静态托管 web 构建产物（`apps/web/dist`），单进程即完整产品（**前端未开工，目录尚未创建**）
- 一期后端已全部落地：57 端点 / 24 命令 / 27 类 wire 事件（进度看板见 `docs/01` §7.1）
- Web 前端选型已定案：Vite + React 19 SPA，不引入 Next.js（`docs/adr/0002`），是当前唯一待办阶段

## 结构

```
apps/web            前端 SPA（Vite + React 19，未建：目录尚未创建）
packages/protocol   API 契约 & 事件 wire 格式（纯类型 + Zod，零业务逻辑）
packages/core       Agent 业务核心（全仓唯一允许依赖 pi SDK 的包）
packages/server     Hono HTTP/SSE 服务，组装 core（bin: piboat-server）
packages/client     类型安全 client SDK + React hooks
packages/ui         纯展示组件库（只依赖 protocol 类型与 client hooks）
packages/config/    typescript-config（lint/format：根 biome.json）
```

依赖方向自上而下单向：`apps/* → client → protocol`；`apps/server → core → protocol`。
