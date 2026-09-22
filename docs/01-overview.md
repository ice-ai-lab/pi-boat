# PiBoat —— 项目概要设计

> 项目代号 `pi-boat`，包作用域 `@ice-ai/*`（命名决策见 `docs/adr/0001`，scope 修订见 `docs/adr/0004`），bin 命令 `piboat`
> 版本：v0.3（概要设计阶段） · 状态：待评审 · v0.3 变更：Web 前端定为 Vite + React 19 SPA，删除 Next.js（ADR-0002）；v0.2 变更：定名 pi-boat（ADR-0001），替换全部占位名

---

## 1. 项目定位与目标

以 `@earendil-works/pi-coding-agent` SDK 为底层能力，构建一套 **"一个核心、多个前端"** 的 AI 编程助手产品矩阵：

| 前端形态 | 阶段 | 说明 |
|---|---|---|
| Web UI | 一期 | Vite + React 19 SPA（ADR-0002），浏览器访问**本机** Agent |
| Electron 桌面端 | 二期 | 壳 + 内嵌核心，复用 Web UI 与全部核心包 |
| 更多（CLI 面板 / 移动端） | 远期 | 移动端三条路径与复用度见 §5.5；HTTP+SSE 传输对移动端天然友好 |

**核心原则**：所有与 Agent 交互的"业务逻辑"只写一次，放进 `packages/`；`apps/` 里的每个前端都是薄壳，只负责渲染与交互。

> **部署定位：纯本地。** Agent 与服务进程始终运行在用户自己的电脑上（绑定 127.0.0.1），不存在服务器端部署、多用户、公网访问等场景。架构中所有设计均以此前提展开。

---

## 2. 总体架构

```
┌────────────────────────────────────────────────────────────────────┐
│                            前端层 (apps/)                           │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────┐  │
│  │  apps/web    │   │  apps/desktop    │   │  (未来: PWA/移动端) │  │
│  │  React SPA   │   │  Electron        │   │                    │  │
│  │  纯前端渲染   │   │  壳+拉起服务进程  │   │                    │  │
│  └──────┬───────┘   └───────┬──────────┘   └─────────┬──────────┘  │
│         │  @ice-ai/client (统一客户端 SDK)          │             │
└─────────┼────────────────────┼─────────────────────────┼────────────┘
          │  HTTP REST + SSE（同一套协议 @ice-ai/protocol）
┌─────────▼────────────────────▼─────────────────────────▼────────────┐
│                       服务层 packages/server                         │
│   Hono HTTP 服务：REST 路由 / SSE 事件流 / 本机访问防护 / 静态托管 web │
│   （常驻本机运行；Electron 作为子进程拉起，与本机 Web 前端共用）       │
├─────────────────────────────────────────────────────────────────────┤
│                       核心层 packages/core                           │
│   AgentSessionService：会话注册表 / 生命周期 / 事件总线 / fork·branch  │
│   SystemService：文件树/文件读取 / PTY 终端 / git worktree            │
│   ConfigService：models.json / providers / skills / plugins / 设置    │
├─────────────────────────────────────────────────────────────────────┤
│                    底层 @earendil-works/pi-coding-agent SDK          │
│   createAgentSession / AgentSessionRuntime / SessionManager /        │
│   ModelRuntime / ResourceLoader / 事件订阅                            │
└─────────────────────────────────────────────────────────────────────┘
```

分层依赖规则（自上而下单向依赖，禁止反向）：

```
apps/web, apps/desktop ──▶ client ──▶ protocol
apps/server            ──▶ core    ──▶ protocol
packages/core          ──▶ pi-coding-agent SDK（唯一允许依赖 SDK 的包）
packages/ui            ──▶ protocol（仅类型）+ client（仅 hooks 层）
```

---

## 3. Monorepo 目录结构

```
pi-boat/
├── apps/
│   ├── web/                      # 前端 SPA：Vite + React 19（待建，见 ADR-0002）
│   └── desktop/                  # Electron 桌面端（二期）
├── packages/
│   ├── protocol/                 # @ice-ai/protocol  API 契约 & 事件 wire 格式
│   ├── core/                     # @ice-ai/core      Agent 核心服务（唯一依赖 pi SDK）
│   ├── server/                   # @ice-ai/server    HTTP/SSE 服务，组装 core（bin: piboat-server）
│   ├── client/                   # @ice-ai/client    前端用类型安全 SDK + React hooks
│   ├── ui/                       # @ice-ai/ui        共享 React 组件库
│   ├── config/
│   │   └── typescript-config/    # @ice-ai/typescript-config（lint/format 见根 biome.json，ADR-0003）
│   └── (可选拆分: terminal/ git/ auth/ —— 初期并入 core，见 §3.2)
├── docs/
│   ├── 01-overview.md（本文档）
│   └── adr/                      # 架构决策记录（0001-project-naming 已定）
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json                   # lint + format 单配置（ADR-0003）
└── package.json
```

### 3.1 各包职责

#### `packages/protocol`（零运行时依赖，纯类型 + Zod schema）

- REST API 请求/响应类型（`/api/sessions`、`/api/agent/:id`、`/api/models`…）
- **事件 wire 格式**：`WireAgentEvent` —— 对 SDK 原生事件做投影/裁剪（补齐 toolcall 的 `id/toolName`、剔除 `turn_start/turn_end`、历史快照过滤）。这是前后端解耦的"防腐层"，SDK 事件字段变动被隔离在 core 内。
- 会话/消息/工具调用的领域类型（含 §8.3 的 toolCall 字段归一化规则）
- Zod schema 用于服务端入参校验与运行时兼容检查

#### `packages/core`（业务核心，**唯一**依赖 pi-coding-agent 的包）

- `AgentSessionService`
  - 会话注册表（`Map<sessionId, SessionEntry>`，idle 超时回收、启动去重锁）
  - 封装 `createAgentSession`（新会话）与 `createAgentSessionRuntime`（new/fork/switch/import 替换语义，运行时替换后**重新订阅事件**）
  - 生命周期操作：`prompt / steer / followUp / abort / compact / navigateTree / fork`
  - 进程内事件总线：多订阅者分发（SSE 连接、将来 Electron IPC、日志记录器共用）
- `SessionReadService`：基于 `SessionManager` 的只读浏览（列表、`.jsonl` 解析、context 快照、导出 HTML）
- `ProjectReadService` / `ProjectResolver`：项目分组视图（ADR-0008：git 仓库根归一 `projectKey`，子目录/worktree 合并；与列表共用目录扫描与 resolver 实例）
- `SystemService`：allowed-roots 安全校验、文件树/文件内容、PTY 终端会话、git worktree 操作
- `ConfigService`：models.json 读写、provider 发现/测试、API Key 与 OAuth 凭据管理、skills/plugins 安装管理
- 不依赖任何 HTTP 概念 —— **传输无关**，为 Electron 进程内直连留路（§5.5）

#### `packages/server`

- Hono（Node 适配器）实现的 HTTP 服务，路由即 protocol 的实现层
- SSE 事件流：30s 心跳、快照先行（先建流再回放快照）、断线重连 `Last-Event-ID` 支持
- 本机访问防护：仅绑定 127.0.0.1 + Host / Origin / Sec-Fetch-Site 三道闸（常开、无凭据；防恶意网页对本机发起 CSRF / DNS 重绑定，详见 §5.6 与 ADR-0007）
- 会话列表与项目分组（ADR-0008）：`GET /api/projects` 按 git 仓库根归一 `projectKey`（子目录/worktree 合并为一项，不分页）；`GET /api/sessions?projectKey&force` 支持按项目拉取；列表缓存以**会话目录指纹**为键（磁盘变动自动失效），响应带 `listFingerprint`
- 静态托管：生产模式直接托管 `apps/web` 构建产物 → **单进程即完整产品**（本地一键启动，Electron 同样受益）
- PTY (node-pty)、原生模块全部收敛在此包与 core

#### `packages/client`

- **框架无关核心**（主入口不得 import React）：typed fetch 封装（端点 = protocol 路径常量 + Zod 解析）、
  SSE 订阅与 seq 对账（`AgentStream`）、事件 → **视图模型**的折叠（`fold.ts` 实时 / `rebuild.ts` 历史）
- `@ice-ai/client/react` 子导出：`useAgentSession` 等 hooks；TanStack Query 只在这一层（事件流不走 Query）
- 详细设计见 `docs/05-client-design.md`——其中的**视图模型契约**是 ui 组件的消费依据

#### `packages/ui`

- 纯展示组件库，三册目录：`primitives/`（基础件）、`chat/`（对话域）、`inspect/`（统计与检视）
  ——组件清单、props 契约、token 映射见 `docs/06-ui-design.md` §4
- 只依赖 `protocol` 类型与 `client` hooks，不依赖任何宿主框架（Next.js / Electron 等）→ Web 与桌面端直接复用
- Tailwind 4 + token 单一来源 `ui/theme.css`（`:root` / `[data-theme="dark"]` 两套变量，经 `@theme inline`
  暴露给 Tailwind；暗色不得写死在 `@theme` 里）
- **视觉与交互基准 = `docs/design/piboat-web-v3.html`（原型 v3，2026-09-22 定稿）**：0.5px hairline /
  superellipse 圆角 / `#4176E6` 业务蓝 / 毛玻璃浮层 / sticky 输入卡等签名细节必须保留（docs/06 §2）

### 3.2 拆包策略：先粗后细

初期 6 个包足够。terminal/git/auth 等先作为 core 内的模块（目录分好），膨胀后再拆独立包 —— 避免早期过度拆分带来的构建/联调成本。`packages/shared` 不单独建：通用工具就近放入 `protocol`（类型相关）或 `client`（运行时相关）。

---

## 4. 关键技术选型

| 维度 | 选型 | 理由 |
|---|---|---|
| 包管理 / 任务 | **pnpm workspace + Turborepo** | 任务编排与缓存成熟，monorepo 事实标准 |
| Node 版本 | ≥ 22.19（engines 强制） | pi-coding-agent 要求；原生 fetch/SSE |
| Agent 底层 | `@earendil-works/pi-coding-agent` 锁 `0.85.x` | SDK 主入口 + `./client`；升级走专门 ADR |
| 服务框架 | **Hono**（Express/Fastify 同类的轻量 TS HTTP 框架，仅是工具选型，可替换） | TS-first、轻量、路由即类型（配合 `hc` 可自动生成 client 类型）、Node 适配好 |
| 前端框架 | **Vite + React 19 SPA**（定案见 ADR-0002） | 纯本地 SPA：无 SSR/SEO/RSC 需求；静态产物由 server 托管，避免为弃用的框架能力付费 |
| 样式 | Tailwind 4（token 单一来源 `ui/theme.css`，docs/06 §3） | 原子化 CSS，组件库跨端复用友好；CSS-first `@theme` 正好承接原型的双主题变量 |
| 路由 | React Router v7（library 模式） | ADR-0002 留白的路由选型，在原型的 `/session/:id` 深链需求下定为库模式（纯 SPA 无 SSR/loader 需求） |
| 服务端状态 | TanStack Query（仅 `client/react` 层） | REST 读的缓存/失效；`listFingerprint` 作为列表失效键（ADR-0008） |
| 客户端状态 | Zustand（**M2 起**） | M1 单会话无全局 UI 状态，按需引入（不养期货） |
| 组件与图标 | shadcn/ui（落位 `ui/primitives`）+ Lucide（ADR-0009） | 无障碍原语不手写；原型 sprite 的 31 个图标逐一换 Lucide（对账表 docs/06 §6） |
| 前端 HTTP | **Axios 统一实例**；响应经 protocol 的 Zod 解析（ADR-0009） | 拦截器只管 baseURL + 错误信封归一（ADR-0007 删 token 后无凭据注入需求） |
| 前端栈基准 | **ADR-0009 已收口（2026-09-22）** | 含 React Compiler、markdown（react-markdown + shiki）、**不引外部 skills**；唯一遗留：dev 接入方式（ADR-0009 文末） |
| 实时通道 | **HTTP + SSE**（首期），WebSocket 预留 | 单向事件流足够；浏览器原生 EventSource、断线重连简单；protocol 不绑定传输 |
| 终端 | node-pty（server 侧）+ xterm.js（ui 侧） | 事实标准组合 |
| 代码质量 | **Biome 2**（lint + format 一体，ADR-0003）+ husky + lint-staged（待接入） | Rust 单工具替代 ESLint+Prettier；当前仅用非类型感知规则 |
| TypeScript | **7.x 原生版**（Go 实现，ADR-0003） | tsc 亚秒级；lint 与 TS 版本解耦（Biome 自研解析器） |
| 测试 | Vitest（core/protocol/client/ui）+ Playwright（web E2E） | |
| 发布 | Changesets（如需发包）；桌面端 electron-builder | |

> **原型登记**：`docs/design/piboat-web-v3.html` 是 v0.1 的视觉/交互基准（未走 ADR，属设计资产而非架构决策）。
> 它定义了一层文档此前没有的东西——**事件上方的视图模型**（处理详情分组 / 折叠行 / 每轮 usage），
> 该形状由 client 承载（docs/05 §6），不进 protocol。

---

## 5. 核心设计

### 5.1 架构决策 AD-01：独立 Agent 服务进程（vs 内嵌式：Agent 装进全栈框架进程）

| | 内嵌式方案（Agent 装进 Next API Routes） | 本项目方案（独立 server 进程） |
|---|---|---|
| 多前端支持 | 每个前端都要重写后端 | Web/Electron 共用同一个本地 server |
| 进程稳定性 | 受 Next dev 热重载影响（需 `globalThis` hack 保活注册表） | 独立进程常驻，注册表天然稳定 |
| 运行形态 | Web 与 Agent 绑死在 Next 进程里 | 同为本机运行：一个常驻本地服务，多个前端接入 |
| Electron | 不适用 | 拉起 server 子进程 + 加载同一套 web UI 即成桌面端 |
| 复杂度 | 低（单项目） | 中（多一跳进程边界，但换来以上全部） |

**进程模型对照**（关键澄清：本项目生产环境同样是单进程）：

| 场景 | 内嵌式 | 本项目 |
|---|---|---|
| 生产 | 1 进程：`next start` 同时服务页面与 Agent API | **1 进程**：Hono server 静态托管 web 构建产物 + Agent API/SSE，一条命令启动 |
| 开发 | 1 进程：`next dev` 兼任前后端 | 2 进程：`vite dev`（UI 热更新）+ agent server（会话常驻）；`turbo dev` 一条命令同时拉起 |
| Electron | — | 主进程 + server 子进程（Electron 标准多进程形态） |

开发模式下浏览器页面来自 `vite dev`（9528），`/api/*`（含 SSE）由 Vite dev server **代理**到 agent server（9527）——浏览器视角同源，与生产拓扑一致（ADR-0009，2026-09-22 定案）。CORS 白名单保留给直连场景（Electron / LAN / PWA）。

**为何不采用内嵌式（即使它单进程）**：① Agent 会话生命周期与 `next dev` 绑死 —— Next 的模块图失效/热重载链路会波及承载 Agent 的路由模块，需要 `globalThis` hack 保活注册表，dev server 排障成本高；拆开后改 UI 代码不影响正在运行的 Agent 任务。② Electron 端将被迫内嵌整个 Next standalone 服务作为子进程（重、启动慢）；拉起精简 Hono server 子进程则很轻。③ node-pty 等原生模块在纯 Node 进程零特殊配置。

**备选方案 B**（已列入 §9 待定决策）：内嵌式 —— web 的 Next API routes 直接 import core，开发/生产均单进程，Electron 拉起 Next standalone。可行、少一个包，代价即上述三条；且若选 B，Web 端就锁定 Next，若选 A，web 可退化为 Vite SPA。两案中 packages/core/ui/protocol/client 结构不变。**已定案（ADR-0002）：选 A，且 Web 前端直接采用 Vite + React 19 SPA，不引入 Next.js。**

### 5.2 运行时模型：启动方式、前后端交互、多会话并发与隔离

#### 5.2.1 agent server 由什么启动

本体是一个**普通 Node.js（≥22）进程**：`packages/server` 提供 bin 入口 `piboat-server`（开发用 `tsx watch src/main.ts`，构建产物为可分发单文件）。启动序列：

```
解析参数(--port/--root) → 绑定 127.0.0.1
→ 初始化 core（SessionRegistry / ConfigService / SystemService）
→ [生产模式] 挂载 web 静态产物目录 → stdout 输出就绪信号
```

| 场景 | 谁来拉起 | 方式 |
|---|---|---|
| 开发 | `turbo run dev` | 并行任务：server（tsx watch，9527）+ web（vite dev，9528） |
| 生产（本地） | 用户 | 执行 `piboat` 命令（npx/全局安装皆可），单进程即完整产品 |
| Electron | 桌面端 main 进程 | `child_process.spawn`（或 utilityProcess）拉起 server 子进程，env 传 port，stdout 健康检查就绪后开窗口 |

#### 5.2.2 web 与 agent server 如何交互

**关键澄清：不存在 "web server → agent server" 的服务端调用链。** vite dev 只是一层**纯转发的薄代理**（`/api/*` → 9527，不含业务逻辑），只有 dev 期的页面与 HMR 由它服务；所有业务交互都发生在**浏览器（前端 JS）↔ agent server** 之间，统一走 `@ice-ai/client`（axios + EventSource）。

> 一句话心智模型：**agent server = 跑在本机的后端 HTTP 服务，Web / Electron = 它的两个客户端**（同 Ollama 本体与各 GUI 的关系）。浏览器始终通过 HTTP 与后端交互，区别只在接口由谁承载（全栈框架内嵌 vs 独立进程）。
>
> Electron 不走原生 IPC 的原因：renderer 直接复用同一套 web UI + 同一个 client SDK 走 HTTP，前端代码无感运行环境；若走 IPC 需为每个接口写映射 bridge，双份维护。IPC 只留给窗口管理、系统对话框等少量原生能力。

```
开发期（2 进程）：  浏览器 ──页面/HMR──▶ vite dev (9528)
                    浏览器 ──/api/*（同源，含 SSE）──▶ vite dev ──转发──▶ agent server (9527)

生产（1 进程）：    浏览器 ──页面+API+SSE（同源）──▶ agent server (127.0.0.1:port)

Electron：         renderer(=web UI) ──API/SSE──▶ agent server（子进程）
                    main ──spawn/健康检查/生命周期管理──▶ agent server
```

- 开发期**走 Vite proxy**（ADR-0009）：浏览器只与 9528 同源通信，`AgentClient` 的 baseURL 是相对路径
  `/api`，**前后端代码不因环境切换**，dev 与 prod 拓扑一致
- 代理转发的请求**不带 Origin / Sec-Fetch-\***（由 Vite 的 Node 进程发出），因此 **②③ 闸在 dev 期不经浏览器路径**
  ——它们防护的是直接打 9527 的来源（用户浏览器里的恶意网页、Electron / LAN / PWA 直连），
  行为由 `packages/server/test/server.test.ts` 断言覆盖，不靠 dev 期人工触碰
- **CORS 白名单保留**（`http://localhost:9528` / `http://127.0.0.1:9528`）供直连备选：该模式下
  页面与 API **必须同一主机名**（`localhost` 与 `127.0.0.1` 混用属 cross-site，会被 ③ 拒）
- 防护靠 Host / Origin / Sec-Fetch-Site 三道闸，**无 token、无鉴权 bootstrap**（ADR-0007）
- 生产同源部署：页面由 agent server 托管，与 API 同源，无需凭据分发（ADR-0007）
- 端口约定单一来源：`packages/protocol` 的 `PORTS`（`PORT` 环境变量可覆盖 server）

#### 5.2.3 多会话并发与隔离

**支持同时多个对话**，这是核心能力而非附加项：

- 一个 agent server 进程内维护 `SessionRegistry`，可同时存活 N 个 `AgentSession`
- **会话间状态完全隔离**：每个会话 = 独立 AgentSession = 独立 `.jsonl` 文件，各自持有消息历史、模型与思考级别、工具集、cwd、已加载扩展/技能，互不可见
- **并发原理**：LLM 流式调用、bash 工具（子进程）、文件 IO 均为异步 I/O，单 Node 事件循环即可支撑多会话同时流式输出，无需多进程
- **会话内串行**：同一会话同一时刻只跑一个 prompt，流式期间的新输入走 `steer`/`followUp` 队列语义（SDK 约束）
- **多端订阅**：同一会话可被多个浏览器 Tab 同时观看（core 事件总线多播），命令在服务端按会话串行化
- **生命周期**：惰性加载（首次访问才从 .jsonl 重建）→ idle 超时回收 → fork 即时销毁重建（§5.3）
- **诚实的隔离边界**：会话间是**状态隔离，不是安全沙箱** —— 所有会话以当前用户权限访问同一文件系统；两个会话指向同一 cwd 时操作的是同一份文件，会互相看到对方改动。需要强隔离（不可信任务）时启用 pi 容器化方案或按 cwd 隔离，列为远期
- **资源护栏**：`maxActiveSessions` 可配置（默认 8~16 活跃流式会话），防失控任务耗尽机器
- 子代理（subagent）会话同样登记于注册表，与主会话同进程并发运行

### 5.3 会话生命周期与两种"分支"语义（§8 详述坑点）

```
创建 ──▶ 运行(prompt/steer/followUp) ──▶ idle ──▶ 回收(超时)
  │                │
  │                ├─ fork(): 新 .jsonl 文件，sidebar 树父子关系（parentSession 仅展示元数据）
  │                └─ navigateTree(): 同一文件内的树导航（"从此处编辑"分支）
  └─ resume / switch / importFromJsonl：走 AgentSessionRuntime 替换，替换后重新订阅事件、重绑扩展
```

`core` 内 `SessionEntry`：

```ts
interface SessionEntry {
  runtime: AgentSessionRuntime;      // 当前生效 runtime（fork 会整体替换）
  listeners: Set<EventListener>;     // 多订阅者事件总线
  lastActiveAt: number;              // idle 回收计时
  startingPromise?: Promise<void>;   // 并发启动去重锁
}
```

**持久化与发现（唯一事实源）**：server 无自建数据库，所有会话事实存于 pi 的 `~/.pi/agent/sessions/*.jsonl`（`SessionManager` 落盘），内存注册表仅是"活会话"缓存。**该目录与 pi CLI 共用** —— 终端里 pi 跑过的会话 web 可见可续聊，反之亦然。

冷启动与接入流程：server 启动不加载任何会话（注册表为空）→ UI `GET /api/sessions` 扫描 sessions 目录出列表（含 parentSession 树）→ 点击会话才惰性水合（从 .jsonl 重建 AgentSession）→ 进注册表 → 走 §5.4 接入时序。

| "现有任务"的三种接续路径 | 数据来源 | 行为 |
|---|---|---|
| server 未重启、任务在跑 | 注册表（内存） | late join，快照含从头至今全部历史，增量直播 |
| server 重启过、任务已成历史 | `.jsonl` 文件 | 惰性重建，浏览/续聊 |
| 跑到一半 server 被杀 | `.jsonl` 最后落盘点 | 该轮中断、不自动续跑；历史保留，可手动接续 |

注意：pi CLI 与 server 可能同时读写同一 `.jsonl`（终端 pi 在跑 + web 打开同一会话），需文件锁（proper-lockfile）协调。

### 5.4 事件流协议（protocol 的核心）

```
客户端                         server                        core
   │ GET /api/agent/:id/events   │                             │
   │────────────────────────────▶│ 立即建立 SSE 流 + 心跳        │
   │                             │ subscribe() ───────────────▶│
   │◀── snapshot(当前完整状态) ───│                             │
   │◀── data: WireAgentEvent ──│ onEvent 投影 ───────────────│ SDK 原生事件
   │   (text_delta / toolcall_* / message_end / …)             │
```

- `toWireAgentEvent()` 投影函数放 **core**，wire 类型放 **protocol**；SDK 升级只改投影函数
- **任意时刻可接入（late join）**：Agent 流式输出中途连接 SSE 完全支持。时序保证：①建流 → ②先订阅事件总线 → ③再抓快照（当前完整状态，含进行中的半截消息/工具执行状态）+ `lastSeq` → ④后续增量续播。"②③之间"重叠窗口的少量事件用每会话单调递增 `seq` 去重（客户端丢弃 `seq ≤ lastSeq`）
- 同一机制支撑三个场景：**新客户端中途接入**（新 Tab / Electron 窗口）/ **断线重连与刷新**（`Last-Event-ID` 携带 seq 重放差量；分阶段兑现——M1 降级为忽略 Last-Event-ID、重连即 connected+快照+增量整体重建，客户端靠 seq 单调去重保证幂等，见 docs/04 §5.5）/ **关掉浏览器再打开**（Agent 在服务端继续运行，与是否有人观看无关；重开时从内存状态或 `.jsonl` 重建历史，任务仍在进行则继续直播）
- 多端同时观看：core 事件总线多播，每个接入者独立拿快照 + 增量
- 服务端为每个 SSE 连接持有 liveness lease：观看连接存在时推迟 idle 回收（空闲但被打开看的会话不被误杀）
- 命令通道与事件通道分离：`POST /api/agent/:id`（命令）+ SSE（事件）

### 5.5 传输无关的核心 → 三种接入形态

```ts
// core 暴露的服务接口（transport-agnostic）
interface AgentService {
  create(input: NewSessionRequest): Promise<SessionSnapshot>;
  send(sessionId: string, cmd: AgentCommand): Promise<void>;   // prompt/steer/abort/setModel…
  subscribe(sessionId: string, listener: (e: WireAgentEvent) => void): () => void;
  // …
}
```

| 形态 | 接入方式 | 阶段 |
|---|---|---|
| Web | browser → HTTP/SSE → server(Hono 适配 AgentService) | 一期 |
| Electron（推荐路径） | main 进程 spawn server 子进程，renderer 加载 web UI（同 HTTP/SSE）；原生能力走少量 IPC | 二期 |
| Electron（备选）/ 测试 | main 进程直接 import core，IPC 适配 AgentService | 按需 |

protocol 的 API 契约（而非 HTTP 细节）是唯一对前端的承诺 —— 传输可替换，前端零改动。

**移动端扩展路径**（后续扩展时各层复用度）：

| 移动端形态 | 复用 | 重写 | 复用度 |
|---|---|---|---|
| 手机浏览器 / PWA（同局域网） | 全部：server/core/protocol/client/ui（即同一个 web 应用） | 响应式布局 + LAN 开关（§9-4） | ~95% |
| React Native 壳 | protocol + client；server 零改动 | ui 层（React DOM ≠ RN 组件） | ~40% |
| 原生 App（Swift/Kotlin） | server + protocol 生成的 API 客户端 | 全部前端 | ~20%，但后端零改动 |

为保持此路径畅通，现在只需三件低成本约定：① `packages/ui` 遵守「禁写死桌面假设」（不把三栏/固定宽度当硬前提）——但**响应式实现与移动端适配位在 M1 冻结**（2026-09-22 决策：M1 只保大屏、<880px 显示过窄提示，`useIsMobile`/drawer 随移动端路径一并排期；见 `docs/06` §9.1）；② protocol 保持 Zod schema → 将来用 zod-openapi 导出 OpenAPI 规范供原生客户端代码生成；③ LAN 开关 + 扫码配对在协议层预留。弱网断线重连（Last-Event-ID）已内建，web-push 完成通知已在 §6 范围内。

### 5.6 安全设计

- **allowed roots**：文件读写/浏览全部收敛到 server 侧白名单校验（白名单 + worktree 机制）
- **项目信任**：进入 cwd 前的项目信任确认（`.pi` 项目级扩展/设置在信任前不加载）
- **本机访问防护**：仅绑定 127.0.0.1；三道闸常开——① `Host` 只认回环主机名（防 DNS 重绑定）② `Origin` 白名单 = 同源 ∪ dev web（防 CSRF）③ `Sec-Fetch-Site: cross-site` 一律拒（覆盖 `<img>`/`<script>`/表单导航等**无 Origin** 的跨站请求；`Sec-` 前缀是 forbidden header name，页面 JS 无法伪造）。纯本地≠无需防护 —— 用户浏览器里的**恶意网页**可以直接向 `http://127.0.0.1:<port>/api/agent` 发请求，让 Agent 在用户机器上执行任意命令。**无 token、无 SSE 票据、无鉴权 bootstrap**（ADR-0007：token 相对 ①② 只多挡一格，而票据层只为 EventSource 无法带 header 而存在，且 dev 期跨源页面无从取得随机 token）；代价是一条硬约束——**GET 不得有副作用**。非回环绑定（LAN）另议，届时用用户可输入的口令而非随机 token
- **服务拥有宿主机文件系统全部权限** —— 这是产品能力也是最大攻击面，任何路由新增必须过 allowed-roots/鉴权检查清单

---

## 6. 功能范围（一期）

会话：列表/恢复/fork/树内分支/导出 HTML · 对话：流式输出、思考、工具调用展示、中断、steer/queue、压缩 · 输入：图片附件、prompt 模板、工具预设(只读/默认/全部/纯聊天) · 模型：models.json 可视化配置、provider 连通测试、OAuth/API Key 管理 · 上下文：文件浏览器、文件查看器(Tab)、git worktree、内置终端(xterm) · 资源：Skills 搜索/安装/开关、插件管理、子代理配置 · 体验：多 Tab、主题、快捷键、完成提示音、浏览器通知/web-push、i18n、PWA。

**原型（v3）补充登记**（2026-09-22，交互形态已给出，组件已收录 docs/06 §4）：

- 已在前述清单内、原型补了形态：会话搜索、工具预设分段控件、主题切换、工作区（项目）下拉
- **新增项**：会话列表重命名/删除的 hover 操作 · 消息 minimap 快速导航 · 内容区宽度把手（可持久化） ·
  footer 统计 pills（in / out / cache / tps / cost / 上下文环） · 会话统计与工具定义弹窗 · toast ·
  输入卡模式菜单（默认/只读/全自动）
- 里程碑落位：M1 只取对话域组件（docs/06 §4.1/§4.2）；统计弹窗、工具预设、会话列表操作属 M2；
  minimap、内容宽度把手属 M2–M3（不影响 M1 验收）
- ⚠️ 原型暴露五处**协议缺口**（性能统计字段缺失、“最近提交”字段、“工具预设”与“模式”语义重复、系统提示词版本号），
  需先定取向再排期：`docs/02-protocol-inventory.md` §11.1

二期（桌面端）：Electron 壳、托盘/全局快捷键、自动更新、原生文件对话框、多工作区窗口。

---

## 7. 演进路线

| 里程碑 | 内容 | 验收标准 | 状态 |
|---|---|---|---|
| **M0 工程骨架**（~0.5 周） | pnpm+turbo、包脚手架、biome/tsconfig/husky、CI（lint+typecheck+test） | turbo build 全绿 | ✅ 完成（2026-09-18） |
| **M1 对话 MVP**（~1.5 周） | core: create/prompt/subscribe/abort；server: REST+SSE+静态托管；web: 单会话聊天（流式+工具调用展示） | 浏览器完成一轮带工具调用的编程任务 | 进行中：protocol ✅ · core ✅（docs/03）· server ✅（docs/04，2026-09-22）· web 原型 v3 定稿（docs/06，2026-09-22）· client/web 代码未开工 |
| **M2 会话与模型**（~2 周） | 会话列表/恢复/fork/分支导航、模型配置、认证流程、工具预设 | 日常可替代 TUI 完成编码工作 | 未开工 |
| **M3 完整体验**（~2 周） | 文件浏览/查看、终端、worktree、skills/插件、通知、多 Tab、minimap 与内容宽度把手 | 功能对齐 §6 一期清单 | 未开工 |
| **M4 桌面端**（~2 周） | Electron 壳 + 子进程 server + 打包分发 | macOS 安装包可用 | 未开工 |

---

## 8. 已知风险与对策

| # | 风险/坑 | 对策（落位） |
|---|---|---|
| 1 | **fork 是破坏性原地变异**：`fork()` 后 wrapper 内 `sessionId` 已变，旧注册表若不销毁会读到脏状态，后续 fork 产生损坏的 parentSession 链 | core 的 `fork()` 捕获新 id 后**立即销毁旧 SessionEntry** 再重建 |
| 2 | **Runtime 替换后事件订阅失效**：new/fork/switch 后 `runtime.session` 已换，旧 subscribe 指向死对象 | core 统一在 SessionEntry 层做"委托订阅"，对上层屏蔽替换；替换后重绑 extensions |
| 3 | **toolCall 双字段体系**：文件存储 `{id,name,arguments}` vs SDK 类型 `{toolCallId,toolName,input}` | 文件存储本就是前者无需归一化；流式增量的双字段在 core 投影层补齐（`toWireAgentEvent`；normalizeToolCalls 已删——零调用点，2026-09-21） |
| 4 | **parentSession 只是展示元数据**，pi 自身迁移会整文件重写 | sidebar 树构建只把它当元数据；级联改父时允许整文件重写 |
| 5 | **SDK 事件格式随版本漂移**（0.84 曾改 message_update 投影） | wire 投影层（§5.4）+ protocol schema 版本号；SDK 升级跑事件快照回归测试 |
| 6 | **node-pty 等原生模块**跨平台安装/打包（Electron 需重编） | 原生模块只进 server/core；Electron 打包用 utilityProcess 跑独立 server 进程，避免在渲染进程 ABI 重编 |
| 7 | **SSE 连接稳定性**：系统休眠/唤醒、后台标签页节流、HTTP/1.1 同域 6 连接上限（多会话多 Tab 并发） | 心跳 + `Last-Event-ID` 重连 + 快照先行；连接数吃紧时评估 HTTP/2 或 WebSocket 多路复用 |
| 8 | **pi-coding-agent 0.x 快速演进**（API 可能破坏性变更） | 版本锁 minor；升级单独 PR + 变更清单 + e2e 全量回归 |
| 9 | 会话注册表生命周期（内嵌式实现需用 `globalThis` 抗 HMR） | 独立 server 进程无 HMR 问题；但保留"启动去重锁"与 idle 回收 |
| 10 | pi CLI 与 server 并发读写同一 `.jsonl` | proper-lockfile 文件锁（§5.3）；跨进程互斥 |
| 11 | **会话目录名编码有损**：`/Users/x/pi-boat/packages` 与 `/Users/x/pi-boat-packages` 编码后同码 | 项目 cwd **只能从会话文件首行头读**（不猜目录名）；目录名仅用于诊断与指纹（ADR-0008） |

---

## 9. 待定决策（进入详细设计前敲定）

1. ~~项目命名与 npm scope~~ **✅ 已决策（ADR-0001）**：定名 `pi-boat` / `@ice-ai/*`，bin `piboat` / `piboat-server`，代号 PiBoat（原占位 pi-studio 因 npm 被同生态同类工具占用而出局）
2. ~~Web 端实现与进程模型联动选择~~ **✅ 已决策（ADR-0002）**：选 A（独立 server + 纯前端，开发期 2 进程），且 Web 前端采用 Vite + React 19 SPA，不引入 Next.js（理由：纯本地 SPA 无 SSR/RSC 需求，静态产物由 server 托管）。详见 §5.1 与 `docs/adr/0002`
3. 事件通道是否二期引入 WebSocket（多向交互如扩展 UI 面板实时渲染时再决策）
4. 是否提供局域网访问开关（手机/平板临时连本机 Agent；默认关闭，仅在用户显式开启时绑定 0.0.0.0 并强制**用户可输入的口令**——随机 token 不适合手动输入，形态见 ADR-0007 备选方案；含 TLS/扫码配对评估）
5. ~~`packages/client` 是否用 Hono `hc` 自动生成 vs 手写类型~~ **✅ 已决策（ADR-0009）**：**手写端点封装**——`hc` 只覆盖 REST 路由形状，而 client 主体是 SSE 消费与视图模型推导；且它会与 protocol（ADR-0006 的唯一契约）形成第二套类型来源
6. 数据层是否引入 SQLite（当前全部复用 pi 的 `.jsonl` + `~/.pi/agent/` 体系，不引入新存储）
7. **前端技术栈** ✅ **已决策（ADR-0009，2026-09-22）**：Tailwind v4、shadcn 落位 `packages/ui`、React Compiler、
   Axios 统一实例（响应仍由 protocol Zod 解析）、TanStack Query 只管 REST（事件流走 client 自有 store）、
   React Router v7 库模式；**外部前端规范不以 skills 引入**；**dev 接入走 Vite proxy**（§5.2.2）。
8. **原型暴露的协议缺口**（已全部收口）：① 性能统计 ✅ **core 累加**（含“冷会话为 undefined”约束）；
   ② 输入卡“模式”与“工具预设” ✅ **合并**（预设解析归 core，删掉 SDK 做不到的“全自动·免确认”）；
   ③ 系统提示词 ✅ **展示**（无需协议改动，删掉无来源的“版本 r42”与 token 估算；参考 pi-web `SystemPromptPanel`）；
   ④ “最近提交”已排入 M3 git 域。存量细节见 `docs/02-protocol-inventory.md` §11.1

---

## 10. 附：请求/事件协议骨架（示意，详细设计展开）

```ts
// protocol（示意）
POST /api/sessions                      → SessionInfo[]
POST /api/agent                         { cwd, message?, toolNames?, modelId? } → SessionSnapshot
GET  /api/agent/:id/state               → SessionSnapshot
POST /api/agent/:id                     AgentCommand → void        // 命令通道
GET  /api/agent/:id/events              SSE: WireAgentEvent      // 事件通道
GET  /api/sessions/:id/context?leafId=  → 指定叶子上下文（树内分支）
GET  /api/sessions/:id/export           → HTML 导出
POST /api/auth/api-key/:provider | /api/auth/login/:provider | GET /api/auth/providers
GET/PUT /api/models-config · GET /api/models · GET /api/files/* · POST /api/cwd/validate
GET  /api/skills · /api/plugins · /api/worktrees · POST /api/terminal（PTY WS/SSE）

type AgentCommand =
  | { type: "prompt"; text: string; images?; streamingBehavior? }
  | { type: "steer" | "followUp"; text: string }
  | { type: "abort" } | { type: "compact" }
  | { type: "setModel"; modelId } | { type: "setThinkingLevel"; level }
  | { type: "navigateTree"; targetId; options? } | { type: "fork" };

type WireAgentEvent =
  | { type: "message_start" | "message_end" }
  | { type: "message_update"; assistantMessageEvent: … }   // text_delta / thinking_delta / toolcall_*
  | { type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end"; … }
  | { type: "agent_start" | "agent_end" | "notice" | "error"; … };
```

---

*详细设计按包推进：《core 详细设计》见 `docs/03-core-design.md`（M1 已落地）、《server 详细设计》见 `docs/04-server-design.md`（M1 已落地）、《client 详细设计》见 `docs/05-client-design.md`、《ui 详细设计》见 `docs/06-ui-design.md`（后两篇为开工前设计稿，随 Web 原型 v3 定稿）；视觉/交互基准为 `docs/design/piboat-web-v3.html`。协议契约以 `docs/02-protocol-inventory.md` 为准（覆盖产品全量 API 面）。*
