# ADR-0002：Web 前端采用 Vite + React 19 SPA，不引入 Next.js

- 日期：2026-09-18
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §4、§5.1、§5.2、§9.2

## 背景

概要设计 v0.2 将 Web 端选型记为 "Next.js 16 (App Router) + React 19，仅用其前端能力，API 能力弃用"，同时在 §9.2 把 Web 端实现与进程模型的联动选择（独立 server A / 内嵌式 B）列为待定，并注明 "若选 A，web 可退化为 Vite SPA"。

M0 工程骨架曾按 Next.js 搭建 `apps/web` 并通过全量构建。复盘发现：进程模型已定案为独立 server（A），Next.js 的核心价值在本项目**全部落空**，而其成本每一项都在支付。趁前端尚未写一行真实代码（`apps/web` 仅 3 个文件壳），此刻是切换成本最低的时点。

## 决策

| 项 | 值 |
|---|---|
| Web 前端形态 | **纯 SPA：Vite + React 19**，静态构建产物（`dist/`） |
| 生产托管 | agent server（Hono）`serveStatic` 托管 `dist/`，单进程即完整产品（维持原设计不变） |
| 路由 | react-router（library mode）或 TanStack Router，前端落地时定；初期可纯状态切视图 |
| Next.js | **不引入**。`apps/web`（Next 版壳）已删除，前端待建（M1 末段） |
| 端口约定 | dev 期 `vite dev` 仍用 **30141**，server CORS 白名单维持 `http://localhost:30141` 不变 |

依赖链不变：`apps/web → ui → client → protocol`；server 侧 "静态托管 web 构建产物" 职责不变（§3.1）。

## 理由

逐项对账 Next.js 核心价值 vs 本项目实际：

| Next.js 卖点 | 本项目实情 |
|---|---|
| SSR / 流式渲染 / SEO | 本地工具、localhost 单用户，零需求 |
| React Server Components | 聊天界面 95% 客户端状态（SSE 流、xterm、虚拟列表），全部 `'use client'`，RSC 只剩边界报错来源 |
| Route Handlers / API 能力 | AGENTS.md 明令禁用，API 全在 Hono |
| next/image / next/font 等服务端优化 | 静态导出模式下禁用或退化 |
| Vercel 式部署 | 部署形态 = Hono 托管静态产物 |

留下的税：① `'use client'` 边界税（用服务端渲染见长的框架，再给所有文件加注解禁用它）；② `output: 'export'` 约束层；③ Next 年度大版本破坏性变更且改动应用代码约定（13→16），对长期本地产品是持续维护税；④ "禁用其 API 能力"这类规则本身就是框架与需求错位的信号。

Vite 方案补齐项均为小事：路由库选型、`lazy()` 手动代码分割、`vite-plugin-pwa`（设计 §6 的 PWA 需求）、`dist/` 直出免静态导出约束。Electron 二期加载静态 `dist` / dev server URL，比 Next standalone 更轻。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| **Vite + React 19 SPA** | ✅ 采用 | 见上；与"纯本地、server 托管静态产物"的架构互为本来面目 |
| Next.js 16（维持原选型） | ❌ 放弃 | 功能全用不上、成本全在付；仅当团队对 Next 熟到无感、且不介意跟版本时才成立 |
| TanStack Start / 其他全栈框架 | ❌ 出局 | 与 Next 同病：服务端能力无处发挥 |

## 后果

**正面**

- 依赖链更薄、`apps/web` 重建时更简单；`vite build` 产物直接 `serveStatic`，无导出模式约束
- 版本演进风险收敛到 `vite.config.ts` 单文件，不再触及应用代码约定
- Electron（二期）加载产物更轻；dev 期桌面壳可直接 `loadURL(30141)` 白拿 HMR

**负面 / 已知风险**

- 路由、代码分割、meta 管理需手动搭（量小、一次性）
- 放弃未来"顺手加个 SSR 页面"的可能性——本产品无此场景，接受
- 团队需熟悉 Vite 约定（成本低于 App Router 心智模型）

## 验证记录

```bash
# 2026-09-18 · 决策落地
rm -rf apps/web                    # Next.js 壳删除（仅 3 个占位文件，无真实代码）
pnpm install && pnpm turbo run build && pnpm turbo run test && pnpm turbo run lint
# 全绿（protocol/core/client/server/ui 5 包构建、测试、lint 通过）
```
