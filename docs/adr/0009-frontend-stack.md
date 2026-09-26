# ADR-0009：前端技术栈与分层（client / ui / web）

- 日期：2026-09-22
- 状态：已接受（Accepted）
- 关联文档：`docs/adr/0002`（本文补其路由留白）· `docs/adr/0003`（Biome/TS）· `docs/adr/0005`（Zod 单一真相源）· `docs/adr/0007`（无凭据，影响 HTTP 层职责）· `docs/05-client-design.md` · `docs/06-ui-design.md` · 视觉基准 `docs/design/piboat-web-v3.html`

## 背景

M1 的 protocol / core / server 已闭环，前端（`packages/client`、`packages/ui`、`apps/web`）尚未写一行真实代码；
同时 Web 原型 v3 定稿，把「事件上方的视图模型」具象化（`docs/05` §6、`docs/06` §4）。开工前必须定两件事：
**工具链选型**（引入哪些依赖、何时引入）与**分层归属**（同一个能力落在 client / ui / web 的哪一层）。

外部参考了一份社区前端技术栈规范（`stack-fe-react` v2.0.1，含可复制模板）。其**规范条目**（Tailwind CSS-first、
TanStack Query 管服务端状态、禁止裸 fetch/CSS-in-JS/Redux/lodash/moment、React Compiler）与本项目取向一致，
故采纳；其**模板工程**不可用（见「被否决的方案」）。**该规范不以 skills 形式引入本仓**，规则沉淀在本 ADR 与
`docs/05`/`docs/06`。

## 决策

| 项 | 值 |
|---|---|
| 样式 | **Tailwind CSS v4**，CSS-first `@theme inline`；token 单一来源 `packages/ui/theme.css`（`:root` + `[data-theme="dark"]` 双套变量） |
| 组件原语 | **shadcn/ui 落位 `packages/ui/src/primitives/`**（CLI 的 `aliases.ui` 指向 workspace 包，不落在 `apps/web`） |
| 图标 | **lucide-react**，原型 sprite 的 31 个图标逐一替换（对账表 `docs/06` §6；仅品牌图标 `i-boat` 自留 SVG） |
| 类名工具 | `cva` + `clsx` + `tailwind-merge`（统一 `cn()`） |
| 前端 HTTP | **Axios 统一实例**（`packages/client/src/http.ts`）；**响应仍由 protocol 的 Zod schema 解析** |
| 服务端类型来源 | **手写端点封装，不用 Hono `hc`** |
| 服务端状态 | **TanStack Query**，且**只出现在 `@ice-ai/client/react`**；ui 与主入口都不依赖它 |
| 实时事件流 | **不走 Query**：`AgentStream`（subscribe/getSnapshot）+ React 侧 `useSyncExternalStore` |
| 路由 | **React Router v7（library 模式）**：`createBrowserRouter` + `RouterProvider`；SPA fallback 由 server 已有 |
| 编译 | **React Compiler**（`@vitejs/plugin-react` + `babel-plugin-react-compiler`，故不用 `-swc` 版）；不手写 `useMemo`/`useCallback`/`memo` |
| markdown 管线 | `react-markdown` + `remark-gfm` + `shiki` + `rehype-sanitize`（**禁裸 `dangerouslySetInnerHTML`**） |
| 客户端（UI）状态 | **Zustand：M2 起**（M1 单会话无全局 UI 状态，不引入） |
| 表单 | **React Hook Form + zodResolver：M2 起**（M1 无校验型表单） |
| 依赖版本纪律 | 一律沿用本仓：**zod 4 / TypeScript 7 / Biome 2 / pnpm 12**；不复制任何外部模板的版本组合 |
| 外部 skills | **不安装**（规范即本 ADR + `docs/05` + `docs/06`） |
| dev 接入 | **Vite proxy**：`/api`（含 SSE）→ `http://127.0.0.1:9527` |

## 理由

**1. 事件流不能交给 TanStack Query。** Query 是「请求—缓存」模型，表达不了 append-only 流 + `seq` 去重 +
重连时的快照重建（`docs/04` §5.5）。硬套会造成「缓存里存着一个不断增长的消息数组」这种反模式。
实时时间线归 client 自身的领域 store（`AgentStream`），它是视图模型（`docs/05` §6）的唯一持有者。

**2. Axios 的职责被 ADR-0007 削掉了大半，必须写清剩下什么。** 删掉 Bearer token 后，拦截器不再需要注入
凭据或处理 401；统一实例的职责收敛为三条：`baseURL` 与 `/api` 前缀、错误信封归一（`CommandError` → 类型化异常）、
以及可选的超时。**响应解析权仍归 protocol 的 Zod schema**——这是 ADR-0005 的铁律，axios 只负责把 JSON 拿回来。

**3. shadcn 落 ui 包而非 app。** AGENTS.md 规定展示层归 `packages/ui`（Web 与 Electron 复用同一套组件）。
若按模板把 shadcn 生成到 `apps/web/src/components/ui`，会让展示资产跟着宿主应用走，Electron 二期只能复制一份。

**4. 不装外部 skills 的原因。** ① 规范的**唯一性**：同一套规则若同时存在于 skill 与本仓文档，必然漂移；
② 该 skill 的**模板版本与本仓冲突**（zod 3 / TypeScript 5.8 / Biome 1.9，本仓为 zod 4 / TS 7 / Biome 2），
一旦被自动激活并"从模板初始化"，会直接破坏 monorepo 的依赖一致性；③ 本项目已有成熟的文档治理
（ADR + docs 01–06 + AGENTS.md），不需要第二套入口。

**5. ui 不引 TanStack Query。** 保持无 Provider 即可单测；取数与容器留在 `apps/web`（`docs/06` §1 边界 2）。

**6. dev 走 Vite proxy（而不用浏览器直连 + CORS）。** 直连方案有一个难以察觉的陷阱：server 的 ③ 闸判的是
site（scheme + registrable domain，**端口不参与**），而 ② 闸的白名单是精确字符串——于是
`localhost:9528 → 127.0.0.1:9527` 会被判 cross-site 直接 403。要求“页面与 API 主机名完全一致”
在浏览器地址栏补全、`vite --host`、复制粘贴面前很脆弱，且症状（403）看起来像权限问题。
走代理后浏览器视角同源：`AgentClient` 的 baseURL 就是相对路径 `/api`，**dev 与 prod 是同一份代码、同一拓扑**。
安全上不亏：恶意网页是直接打 9527，不经过本机的 Vite dev server，②③ 仍在那里拦；
闸门行为由 `packages/server/test/server.test.ts` 断言覆盖（evil origin→403、cross-site→403、dev origin→CORS 头），
不需要靠 dev 期人肉触碰来验证。

**7. 不用 Hono `hc` 生成客户端类型。** 两个理由：① `hc` 只能从路由实现推导 REST 形状，而 client 的
代码主体是 SSE 消费与视图模型推导（`docs/05` §6），它一点都不覆盖；② 它会与 protocol 形成**第二套类型来源**，
与 ADR-0006（protocol 是前后端唯一契约）直接冲突。端点封装只把 protocol 的 schema 拼起来（路由路径用字面量，常量待 client 真正消费时再加），
新增路由时两侧改同一份形状即天然同步。

## 被否决的方案

| 方案 | 否决理由 |
|---|---|
| 整包复制外部模板 `assets/frontend-template` 建 `apps/web` | 版本组合与本仓冲突（见理由 4）；且模板假设单应用，与 `apps/web → ui → client → protocol` 的分层不符 |
| 组件内裸 `fetch` | 与统一实例重复，错误处理/信封解析会各处漂移 |
| 用 TanStack Query 承载 SSE | 见理由 1 |
| CSS-in-JS（styled-components / emotion） | 与 Tailwind 双轨；组件库跨端复用困难 |
| AntD / MUI / Element 作主组件库 | 体积与主题体系无法收敛到 `ui/theme.css` 的双主题变量 |
| Redux / lodash / moment | 无对应需求，按「简单优先」不引入 |
| Zustand、React Hook Form 在 M1 引入 | M1 无真实用例（单会话、无表单），符合 AGENTS.md「不养期货」 |
| 把该 skills 装进 `.agents/skills/` | 见理由 4 |

## 后果

### 正面
- dev 与 prod 共享同一份 token 与组件，视觉基准可被逐项核对（`docs/06` §3/§6/§7 已给出映射表）
- 分层明确：形状（protocol）→ 视图模型（client）→ 呈现（ui）→ 装配（web），任一层都可独立测试
- 组件原语来自 shadcn，无障碍不靠手写

### 负面
- **Tailwind v4 需要显式 `@source`** 扫描 `packages/ui/src`，漏了会让 ui 的类名被摇掉（`docs/06` §2）
- shadcn CLI 写入 workspace 包需要一次配置 spike（`components.json` 的 alias 指到包内路径）
- 暗色**不能**写死在 `@theme` 里（编译期常量），必须 `@theme inline` + 属性选择器，写错则切主题失效
- Axios 与 protocol 的 Zod 形成两段解析，须在 `http.ts` 一处收口，防止有人在调用点二次解析

### 风险与对策
- **React Compiler 较新**：它对逻辑错误不兜底（仍须守 Rules of Hooks）。保留关闭开关——去掉 babel 插件即回退，
  架构不受影响。若遇编译期问题，降级为手写 memo 不违反本 ADR。
- **Shiki 体积**：按需加载语言；M1 只注册常用集合（ts/tsx/js/json/bash/diff/md）。

## dev 接入的实现要点（Vite proxy）

```ts
// apps/web/vite.config.ts —— 端口单一来源仍是 protocol 的 PORTS
server: {
  port: PORTS.web,                 // 9528
  proxy: { '/api': { target: `http://127.0.0.1:${PORTS.server}`, changeOrigin: false } },
}
```

- **SSE 必须保持流式**：不要开启任何响应缓冲/压缩（Vite 的 http-proxy 默认直通；若中间层加了
  `compress`，`EventSource` 会一直不收到帧）。若实测被缓冲，先查是否引入了额外中间件，
  **不要**因此改回直连
- `changeOrigin: false`：让 `Host` 仍是 `127.0.0.1:9527`，① 闸正常放行（改成 true 会伪造 Host，无必要）
- **CORS 白名单保留**（`DEV_WEB_ORIGINS`）：直连场景仍然需要（Electron 主进程调试、LAN / PWA、
  将来用 `curl`/脚本直打 API），且它与 security.ts 的 Origin 校验共用同一份常量，不得删
- ②③ 闸在 dev 期**不经浏览器路径**：代理请求由 Vite 的 Node 进程发出，不带 Origin / Sec-Fetch-*。
  这是代理的固有代价，用单测补偿；将来若改为直连调试，记得回到“页面与 API 同主机名”的硬要求

同步落地的文档：`docs/01-overview.md` §4/§5.2.2、`docs/04-server-design.md` §6/§7、`docs/06-ui-design.md` §2、
`AGENTS.md` 常用命令段。
