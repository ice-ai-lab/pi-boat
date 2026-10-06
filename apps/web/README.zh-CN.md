# @ice-ai/web

[English](./README.md) | **简体中文**

PiBoat 的 Web 前端 —— Vite + React 19 SPA（[ADR-0002](../../docs/adr/0002-web-frontend-vite-react-spa.md)，一期方案见 [`docs/08`](../../docs/08-web-frontend-plan.md)）。它是一个**薄壳**：Agent 的全部业务逻辑都在 `packages/` 里，本应用只负责渲染状态与交互，通过 `@ice-ai/client` 走同一套 HTTP + SSE 契约与 agent server 通信。

生产态下，`dist/` 构建产物由 server 直接托管（同源，单进程即完整产品）；开发态下，vite dev server 在 `9528` 端口出页面，并把 `/api`（含 SSE）代理到 `9527` 的 agent server——浏览器视角与生产拓扑同源一致（[ADR-0009](../../docs/adr/0009-frontend-stack.md)）。

## 技术栈

- **React 19**，启用 React Compiler（[ADR-0009](../../docs/adr/0009-frontend-stack.md)）
- **React Router 7** 路由，**TanStack Query** 管理服务端状态
- **Tailwind CSS 4**，按领域拆分 CSS Modules（[ADR-0028](../../docs/adr/0028-css-modules-by-domain.md)）
- UI 组件来自 `@ice-ai/ui`（纯展示组件，不依赖任何宿主框架）
- **Vite 7** + **Vitest** 单测，**Playwright** E2E

## 快速开始（从源码启动）

需要 Node.js ≥ 22.19.0 与 pnpm。

```bash
# 在仓库根目录执行
pnpm install
pnpm turbo run dev   # agent server（9527，tsx watch）+ web（9528，vite dev）
```

打开 <http://127.0.0.1:9528>。vite dev server 会把 `/api` 代理到 agent server，无需任何 CORS 配置。如果还没有配置模型 provider，启动后打开「模型」面板登录或填入 API Key 即可。

> 单独执行 `pnpm --filter @ice-ai/web run dev` 只起页面层，需要 `9527` 上已有 agent server（用 `pnpm --filter @ice-ai/server run dev` 启动），否则所有 API 调用都会失败。

## 常用命令

以下命令均可从仓库根目录通过 `pnpm --filter @ice-ai/web run <script>`（或 `pnpm turbo run <script> --filter @ice-ai/web`）执行：

| 命令 | 用途 |
| --- | --- |
| `dev` | vite dev server，监听 `127.0.0.1:9528`（strictPort），`/api` 代理到 `9527` |
| `build` | `tsc --noEmit` 类型检查后 vite 生产构建到 `dist/` |
| `test` | Vitest 单测（`src/**/*.{test,spec}.{ts,tsx}`） |
| `test:e2e` | Playwright E2E；自动拉起两个 dev server（`reuseExistingServer`） |
| `lint` | Biome 检查（lint + format） |
| `typecheck` | `tsc --noEmit` |

### E2E 测试

```bash
pnpm --filter @ice-ai/web run test:e2e
```

Playwright 配置（[`playwright.config.ts`](./playwright.config.ts)）把两个 dev server 都声明为 `webServer`——agent server（以 `/api/health` 探活）和 vite——并复用已在运行的实例，因此不需要手动先起服务。smoke 与会话切换用例在 [`e2e/`](./e2e/)；`manual-*.mjs` 是手工驱动脚本，不是测试用例。

## 源码结构

```text
src/
  main.tsx           入口：Provider、QueryClient
  router.tsx         路由表（React Router 7）
  layout/            应用外壳：侧栏、顶栏、全局面板
  pages/             顶层页面
  panes/             功能面板（会话工作区、文件、设置等）
  services/          基于 @ice-ai/client hooks 的数据访问
e2e/                Playwright 用例 + 手工驱动脚本
public/             静态资源
```

端口不在本包硬编码：`vite.config.ts` 与 `playwright.config.ts` 均从 `packages/protocol` 直读 `PORTS`（单一来源）。构建注入的 `__APP_VERSION__` 取自 `packages/pi-boat/package.json`，页面版本与 npm 包版本天然一致（[ADR-0030](../../docs/adr/0030-npm-distribution-packaging.md)）。
