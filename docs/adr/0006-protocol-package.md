# ADR-0006：独立 protocol 契约包——前后端唯一契约层

- 日期：2026-09-20
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §3.1 / §5.5；`docs/02-protocol-inventory.md` §1.1；ADR-0005（Zod 单一真相源）；AGENTS.md「Monorepo 结构与依赖铁律」

## 背景

三个事实决定了端与核心之间必须有一份显式契约：

1. **pi-coding-agent SDK 是单会话、进程内的库**——没有多会话寻址、没有可序列化的事件契约、没有断线重连语义。它提供的类型面（`AgentSessionEvent`、`AgentMessage` 等）是内存对象形状：partial 累积快照、readonly 数组、经模块增强追加的角色，均不可直接上线
2. **产品是"一核多端"**：web（Vite SPA，ADR-0002）与 desktop（Electron，二期）之外，任何说同一语言的客户端都应能接入；且 web 端产物不允许把 pi SDK 拖进浏览器 bundle
3. **SDK 是外部依赖**（锁 0.85.x），升级时类型面可能变动，前端不能跟着陪葬

M0 定骨架时必须回答：端与核心靠什么耦合。

## 决策

独立 `packages/protocol`：**前后端唯一契约层**。纯类型 + Zod schema（schema 即类型，单一真相源见 ADR-0005），零业务逻辑，运行时依赖白名单 = zod。它是依赖图最底层的叶子包——core / server / client / ui 全部依赖它；任何包不得绕过 core 直接 import pi-coding-agent，wire 类型只在 protocol 定义。

支撑理由四条，每条对应一个"没有它会怎样"：

| # | 理由 | 没有 protocol 的世界 |
|---|---|---|
| 1 | **多端同语言**：所有端对消息/事件/命令的形状共享一份机器可查的定义 | 每端各自声明"消息长什么样"，联调即猜谜；第二个端出现当天开始还债 |
| 2 | **契约先行，并行开发**：零依赖叶子包使 core/server/client/ui 可同时开工，"契约先行则争议前置，接口即产品" | 接口定义散在各实现里，联调期才能发现形状分歧 |
| 3 | **防腐层的合同面**：SDK 类型面变动被隔离在 core 投影（`toWireAgentEvent` / `toWireAgentMessage`），wire 契约独立演进 | SDK 升级波及所有端 |
| 4 | **传输无关的词汇表**：HTTP/SSE 只是载体；protocol 类型本身即传输无关（wire 类型 ≠ HTTP 概念，见下方定案口径），Electron 进程内直连 core 用同一套词汇 | 换传输 = 重定义一遍类型 |

### 定案口径（2026-09-18 会话沉淀）

- **wire 类型 ≠ HTTP 概念**："core 传输无关"防的是传输机制依赖（hono / node:http / SSE writer），而非 Request/Response 词汇——protocol 类型为全部传输形态共用，core 直接使用（如 `create(input: NewSessionRequest)`）不违反铁律。为此删除了无变化轴的 `NewSessionInput` 别名
- **不做额外收敛设计**：`AgentMessage` 与 SDK 七角色完全对齐（含 `branchSummary` / `compactionSummary`），对齐成本由投影函数单点承担

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 不建 protocol，各端直接 import pi SDK 类型 | ❌ 放弃 | SDK 类型进浏览器 bundle；非 TS 端无法消费；SDK 升级全端爆炸——三条全踩 |
| 契约类型由 core 导出 | ❌ 放弃 | client → core 依赖会把 pi SDK 拖进前端依赖图，"唯一依赖 SDK 的包"铁律作废；core 类型面 = SDK 形状，防腐层失效 |
| 单包单体（protocol 并入 core/server） | ❌ 放弃 | Electron 备选路线（进程内直连 core）要求 core 传输无关；前端只需要类型面，无需拖运行时 |
| tRPC / GraphQL 等 RPC 框架承担契约层 | ❌ 不采用 | 引入运行时与框架锁定；本项目契约主体是 29 变体事件流 + 九域 REST，SSE 单向流不在其甜点区；zod schema + 手写 client（ADR-0005 的 OpenAPI 路线）已覆盖端到端类型需求 |

## 后果

**正面**

- 并行开发已兑现：M1 的 core/protocol 先行落地并有完整测试时，server/client 尚未创建
- SDK 对齐成本单点化：形状漂移只动 protocol schema 与 core 投影两处（实例：`AgentMessage` 七角色对齐，改动范围即一个 schema 文件 + 一个投影文件）
- 移动端 / OpenAPI 代码生成路线保留（ADR-0005）

**负面 / 已知风险**

- 多一个包的骨架成本（tsconfig / 测试 / lint 配置）——一次性，已支付
- 协议与 SDK 类型面需持续对齐：以 docs/02 全量清单 + schema 正反例测试锚定；演进纪律为"不做额外设计"，SDK 升级时对照 `.d.ts` 全量核验（docs/02 的方法）
- 契约即对外承诺：破坏性变更须 `BREAKING CHANGE` 标注（Conventional Commits）并按里程碑切片管理（docs/02 §11）

## 验证记录

```bash
# 2026-09-20 · 现状核查
rg -l "from '@ice-ai/protocol'" packages/*/src apps/*/src
  → client / core / server / ui 均引用（叶子包地位成立）
rg "from 'pi-coding-agent'" packages --glob '!packages/core/**'
  → 0 处（protocol 内仅注释性"对齐提醒"，无 import；依赖铁律未被破坏）
pnpm turbo run build test → 全绿（protocol 独立构建、独立测试）
```
