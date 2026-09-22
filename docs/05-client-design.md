# PiBoat —— client 详细设计

> `@ice-ai/client`：类型安全的客户端 SDK。本文是 `docs/01-overview.md` §3.1 的实现细化，
> API 契约以 `docs/02-protocol-inventory.md` 与 `@ice-ai/protocol` 为准，服务端语义见
> `docs/04-server-design.md`，组件侧消费契约见 `docs/06-ui-design.md`。
> 状态：**M1 已落地**（2026-09-23，实现见 `packages/client/src/`）。技术栈基准由 ADR-0009 收口
> （Axios / TanStack Query 边界 / 路由）。
> 与代码不一致时以代码为准并当天更新本文档。

---

## 1. 定位与三条边界

client 是**前端与 server 之间唯一的落地层**：把 protocol 的契约变成可调用的方法，把 wire 事件流变成
可直接渲染的视图模型。三条边界不容逾越：

| # | 边界 | 规则 | 原因 |
|---|---|---|---|
| 1 | 与 React 解耦 | 主入口 `@ice-ai/client` **不得 import React**；React 绑定居 `@ice-ai/client/react` 子导出 | 主入口要能在 Electron 主进程 / Node / vitest 里跑（ADR-0001、docs/01 §5.5 传输无关） |
| 2 | 不碰 SDK | 只能依赖 `protocol`，不得 import `pi-coding-agent` | AGENTS.md 依赖铁律：SDK 只进 core |
| 3 | 不建缓存真相 | 事件流的**当前值**由本包持有（内存态），历史事实仍归 `.jsonl` + REST | 刷新/多端接入靠 REST 重建（§6.4），不引入前端持久化 |

---

## 2. 模块地图

```
packages/client/src/
├── http.ts              # Axios 实例 + protocol Zod 解析 + 错误信封归一（ADR-0009）
│                        #   ApiError / NetworkError / ResponseSchemaError；baseURL 默认空串 = 同源
├── endpoints/           # 按 protocol 的 rest 域分批的薄封装（一个域一文件）
│   ├── agent.ts         #   newSession / sendCommand / getRunningState / getRunningSessions / agentEventsUrl
│   ├── sessions.ts      #   list / search / detail / context / state / rename / delete
│   └── projects.ts      #   list / primaryCwd
├── stream/
│   ├── event-source.ts  #   ★ SSE 连接：单帧 Zod 校验、非法帧计数、session_shutdown 停流
│   ├── fold.ts          #   ★ 事件 → 视图模型（纯函数）+ 形状定义 + groupTrail/mergeTurns/sumUsage
│   ├── rebuild.ts       #   ★ REST 历史 → 视图模型（纯函数，本文 §6.4）
│   └── agent-stream.ts  #   AgentStream：subscribe/getSnapshot + seq 对账 + 命令 + 轻查
├── index.ts             # 框架无关导出（无 React）
└── react/
    ├── index.ts         # '@ice-ai/client/react' 子导出
    ├── client.ts        # getApiClient / setApiClient（默认同源实例）
    ├── use-agent-session.ts
    └── queries.ts       # TanStack Query hooks + queryKeys 工厂
```

实现备注（与设计稿的差异，均已落地）：
- 视图模型的形状定义放在 **fold.ts**（而非独立 view-model 文件）——形状与折叠规则必须同文件演进
- 新增 `TextRow`（过程文本行）：模拟在最终回答之前的旁白（如「先读文件」）；
  不落这一行会让更早的文本在最终回答定稿时凭空消失（`TrailRow = thinking | tool | text | system`）
- `ToolRow.startedAt` 是 fold 内部字段（算 durationMs 用），历史重建路径没有它
- `ChatView.activeAssistantKey` 是 fold 内部状态：`message_update` 不带消息标识，
  增量行必须挂到 `message_start` 定下的 key 上，`message_end` 才能按同一 id 覆盖
- 折叠行/组的「用户手动展开过不被自动收起覆盖」由 **ui 组件本地 state** 实现，
  不写回视图模型（docs/06 §8.1 的 `userToggled` 未落到数据形状上）

`package.json` 需从单入口改为**双入口**：`"." → dist/index.js`、`"./react" → dist/react/index.js`
（`tsconfig.build.json` 相应分两个 rootDir 产物，或统一 tsc 后按目录导出）。

---

## 3. 技术基准

| 项 | 选型 | 备注 |
|---|---|---|
| HTTP | **Axios 统一实例**（`http.ts`，ADR-0009） | 拦截器职责收敛为 baseURL + 错误信封归一（ADR-0007 删 token 后无凭据注入需求）；响应解析仍归 protocol Zod |
| SSE | 浏览器 `EventSource` | 不能带自定义 header → 所以凭据只能走闸门（ADR-0007 的票据层因此被删）；dev 期跨源问题见 §5.3 |
| 响应校验 | `WireAgentEventSchema.safeParse` 逐帧 | ADR-0005 §SSE 行的承诺，`core` 的 SDK 漂移探针 |
| 子导出 | `@ice-ai/client/react` | React 19 + `useSyncExternalStore` |
| 服务端状态 | TanStack Query（仅 `/react` 子导出依赖） | 只用于 REST 读；**不用于事件流**（§8-2） |
| 测试 | Vitest（jsdom + 假 EventSource） | `fold.ts` / `rebuild.ts` 是纯函数，必测 |

---

## 4. HTTP 层

- 单一 Axios 实例（`ADR-0009`）：`baseURL` 默认 **空串 = 同源**——protocol 的路径常量自带 `/api`
  前缀，dev 由 Vite proxy、生产由 server 同源托管，两种拓扑下前端代码一致（ADR-0009 的“相对路径”意图）；
  直连场景（Electron / LAN）用 `createApiClient('http://127.0.0.1:9527')`。
  **拦截器只做两件事**——错误信封归一（非 2xx → 解出 `CommandError` 并以类型化异常抛出）与可选超时；
  **不做**凭据注入（ADR-0007 已无凭据）
- 每个端点 = `protocol` 的路径常量 + 请求/响应 schema，**不自造形状**（与 server 路由同一份契约）
- 流程固定为：`axios.request` → **`schema.safeParse`** → 成功返回 `data` / 失败抛带 path 的错误
  （ADR-0005 铁律：Axios 只负责把 JSON 拿回来，解析权归 Zod）
- 错误信封（docs/04 §4.1）：非 2xx 统一解出 `CommandError`（含 `code`，如 `prompt_rejected`），
  **不**在组件里判断状态码
- ⚠️ **信封解开点两处不同**（2026-09-23 端到端验收抓到的缺陷）：命令通道的响应是
  `{success:true, data}`，所以 `sendCommand()` 用 `commandOkSchema(结果 schema)` 再取 `.data`；
  而 REST 读端点直接返回资源体（列表/上下文/轻查），schema 直接套 body。
  两者混用会得到 `expected null, received object` 这类只在真机上暴露的错误——
  `test/http.test.ts` 用 axios adapter 把两条路径都钉住了
- 不做重试、不做缓存——重试与缓存都是 Query 的职责

## 5. SSE 订阅与 seq 对账

### 5.1 建立时序（对应 server 侧 docs/04 §5.1）

`GET /api/agent/:id/events` → 立刻收到注释帧 → `connected {sessionId, isStreaming, lastSeq}`
→ 快照 `message_start`（若有半截消息）→ 此后增量。

### 5.2 seq 对账规则（两条，缺一即错乱）

1. `connected.lastSeq` 与每次 REST 快照（`AgentState.lastSeq`）都是水位线：**丢弃 `seq ≤ lastSeq` 的事件**
2. 未取到水位线前收到的事件按到达顺序折叠，取到后按 §1 规则重扫一遍（幂等）

### 5.3 M1 降级：重连是"整体重建"而非差量

按 docs/04 §5.5 的 M1 决定，`Last-Event-ID` 差量重放推迟：重连 = 重新 `connected` + 快照 + 此后增量。
因此 `fold` 必须支持"从快照半截消息重建轨迹尾部"，且 `AgentStream` 在重连时**清空事件派生态但不清空 REST 派生态**。
（缓冲与差量是 core 的 M1 内增强/M2 项，client 侧接口不变。）

### 5.4 必须处理的 SSE 边界

| 情况 | 处理 |
|---|---|
| 心跳注释帧 | 忽略（仅用于保活） |
| 未知事件类型 / 校验失败帧 | 丢弃 + 计数上报（不 crash、不断流） |
| `session_shutdown` | 先折叠（`notice` + 末轮 `stopped`）再主动 `close()` 停流（否则会对着已销毁的会话无限重连） |
| 标签页休眠 / 系统唤醒 | `EventSource` 的 `error` → 退避重连；唤醒后必定走整体重建 |
| **首次建流就失败（从未 `connected`）** | 分两种情况：冷会话（server 对 SSE 回 404，docs/04 §5.3 阻塞项 3）**不算断线**——此时不写 `notice`，由宿主用 REST 历史渲染只读态并自行说明「未在运行」；只有**已经连上过再失败**才是真断线，写 `notice: 事件流已断开（重连失败…）`（2026-09-22：侧栏上线后点开历史会话是主路径，误报“会话不存在”会误导） |
| 一页多会话 | 每个会话一个 `EventSource`（HTTP/1.1 同域 6 连接上限是已知风险 docs/01 §8-7；M1 只有单会话） |

---

## 6. 视图模型（View Model）——本包最重要的契约

### 6.0 先说清 `fold.ts` / `rebuild.ts` 是什么

本节反复提到的这两个文件是**纯函数模块**，既不是组件也不是 store（名字容易让人误以为是框架概念）：

- **`fold.ts`**：`fold(事件, 当前视图模型) → 新视图模型`。「fold」是 reduce 的同义词——把 append-only 的
  事件流**折叠**成一个可直接渲染的结构（`Turn[]`）。例如：`message_update` + `thinking_delta` → 往当前
  `ThinkingRow.text` 追加一个字；`message_end`(assistant) → `final` 定稿、把前面的思考/工具行收进
  `ProcessGroupData`、快照 `usage`。**无状态、无 IO、不 import React** → 单测就是“喂一串事件，断言 `Turn[]`”。
- **`rebuild.ts`**：`rebuild(历史 entries) → 视图模型`，产出**同一形状**，供刷新/首屏用（§6.4）。
- **谁持有它？** `agent-stream.ts` 里的 `AgentStream`（有状态、可订阅）调用 `fold` 并在变更后通知订阅者；
  React 侧只用 `useSyncExternalStore` 订阅，自己不折叠（§7）。

本节的其余部分就是这两个函数的**规格**（形状 + 逐事件规则）。

**为什么这层不放进 protocol**：原型 `docs/design/piboat-web-v3.html` 已画出 wire 事件之上的这一层
（处理详情分组、折叠行、每轮 usage），而 docs/02 只到 wire 事件。但协议不承诺 UI 形状，且历史（REST `entries`）
与实时（SSE 事件）需蒸出同一种形状——所以它归 client 私有契约（决策记录见 docs/02 §9 #8）。

### 6.1 形状

```ts
// 一个 turn = 一条用户消息 + 它触发的全部轨迹 + 最终回答
interface Turn {
  id: string;
  user: { text: string; images?: string[]; at: number };
  trail: TrailItem[];        // 折叠的中间轨迹
  final: { markdown: string } | null;   // 最终回答（流式期间为 draft）
  usage: Usage | null;       // 每轮用量 → 原型 usage-line
  model: ModelRef | null;
  status: 'streaming' | 'done' | 'stopped' | 'error';
}

type TrailItem = ThinkingRow | ToolRow | ProcessGroupData | SystemRow;

interface ThinkingRow { kind: 'thinking'; text: string; streaming: boolean; durationMs?: number }

interface ToolRow {
  kind: 'tool';
  toolCallId: string;
  toolName: string;          // → ui 的 tag 色（docs/06 §7）
  title: string;             // 命令 / 文件路径 / 任务描述，来自参数
  args: unknown;             // 折叠体原文
  status: 'preparing' | 'running' | 'ok' | 'error' | 'stopped';
  output: string | null;     // tool_execution_* / toolResult 内容
  /**
   * 结构化 diff（仅 edit/write 类工具）。**不是要在前端算 diff**：SDK 的 edit 工具已经生成了
   * 带行号的展示用 diff 字符串（`+<行号> 文本` / `-<行号> 文本` / ` <行号> 文本`，附 firstChangedLine），
   * 放在 toolResult 的 `details.diff` 里；protocol 的 toolResult 已定义 `details`（z.unknown）→
   * **零依赖、零协议改动**，只需一个窄化访问器 + 行解析。解析失败则退化为不展示 diff。
   */
  diff?: string;
  durationMs?: number;
}

// 过程组：连续轨迹行在被“最终回答”封口时收拢（原型：“处理详情 · 5 条消息 · 7 次工具调用”）
// 类型名带 Data 后缀，避开与 ui 的 ProcessGroup 组件同名
interface ProcessGroupData { kind: 'group'; items: TrailItem[]; messageCount: number; toolCallCount: number; durationMs: number }

interface SystemRow { kind: 'system'; text: string; tone: 'info' | 'warn' | 'error' }  // 压缩/重试/终止
```

### 6.2 为什么不能是扁平消息列表

原型的三个视觉结构直接决定折叠算法，扁平列表无法事后还原：① 轨迹行**成组**且组头带汇总计数；
② 组的边界是"最终回答出现"这一刻（不是 round 边界）；③ 每轮 `usage` 单独成行。
把结构留在 client 而非 ui，是为了让它可被 `rebuild.ts`（历史）与 `fold.ts`（实时）**共同产出**——
两条路径共用同一形状，刷新与首屏历史才不会有视觉跳变。

### 6.3 折叠规则（wire 事件 → 视图模型）

| wire 事件 | 视图模型变更 |
|---|---|
| `connected {lastSeq}` | 记录水位线；触发整体重建（§5.3） |
| `message_start`（user） | 追加 `Turn`，写 `user` |
| `message_start`（assistant） | 开 draft（重连时即"半截消息"恢复）；此前的轨迹行开始"可被收拢" |
| `message_update` + `thinking_start/delta/end` | 追加/更新 `ThinkingRow`（`streaming` 用原型的 `.shimmer` 态），`end` 时定稿 |
| `message_update` + `text_start/delta/end` | 写 `Turn.final` draft |
| `message_update` + `toolcall_start/delta/end` | 追加/更新 `ToolRow`（`delta` 期 `preparing`，`end` 补齐 `args`/`title`） |
| `message_end`（assistant） | `final` 定稿；**把本段之前的 thinking/tool 行收进 `ProcessGroupData`**；写 `usage` |
| `message_end`（toolResult） | 更新对应 `ToolRow.output`（按 `toolCallId` 匹配） |
| `tool_execution_start/update/end` | `ToolRow.status`（`running`→`ok`/`error`）+ `output` + `durationMs` |
| `turn_start` / `turn_end` | 边界标记；`turn_end` 兜底封口 |
| `agent_end {messages, willRetry}` | 兜底对账（增量已覆盖，用于丢帧后自愈） |
| `agent_settled` | 全流 settle：`status='done'`，composer 恢复可用 |
| `queue_update` | 排队消息条（steering / followUp 两组） |
| `compaction_start/end` | 插入 `SystemRow`（正文加系统行，不吞掉轨迹） |
| `auto_retry_*` / `summarization_retry_*` | `SystemRow`（warn） |
| `entry_appended` | M1 忽略（重连靠 REST 分页，不靠事件重放） |
| `session_info_changed` / `thinking_level_changed` | 会话名 / 思考档位 |
| `session_shutdown` | `Turn.status='stopped'` + 终止标记 |

两条易错点：**① `ToolRow` 的生命周期跨两类事件**（`toolcall_*` 是模型发起、`tool_execution_*` 是执行），
只处理一类会得到"有标题无输出"或"有输出无标题"；**② `usage` 随 `message_update` 累积下发**
（docs/02 §5.1），必须在 `message_end` 时快照，否则流式期间数字会抖动。

### 6.4 历史重建（`rebuild.ts`）

`GET /api/sessions/:id/context` 的 `entries` 是**会话文件事实**（`SessionEntry` 判别联合），需要另一条
纯函数映射到同一视图模型：`entries → Turn[]`。分组规则与 §6.3 一致（轨迹行 + 最终回答封口）。
这是"刷新页面不丢形状"的唯一实现路径，也是 `fold.ts` 的测试对照物（同一轮对话，两条路径产出应等价）。

### 6.5 封口时机：候选方案与硬约束

先看参照实现——**pi-web 的分组规则**（`lib/message-display.ts` + `components/ChatWindow.tsx`）：

1. **轮的锚点**：`isMessageGroupAnchor(msg)` = `role === 'user'`，或 custom 消息且 `customType` 为 compaction /
   子代理通知 → **一轮 = 从一个锚点到下一个锚点**（不是 SDK 的 `turn_start`）
2. **轮内找最终回答**：从后往前找第一条“`answerBlocks` 含非空 text/image”的 assistant 消息（找不到则取末条 assistant）
3. **单条消息内再切一刀**：`splitFinalAssistantBlocks` = 找最后一个 process block（`thinking` / `toolCall`）的位置，
   其后的 text/image 归 `answerBlocks`，之前的归 `processBlocks`；无 process block 则全是 answer
4. **归组**：最终回答之前的消息 + 最终消息的 `processBlocks` 进组，答案区在组外
5. **⭐ 流式期间不分组**（`ChatWindow.tsx:1104`）：`isLiveTail = (sessionBusy \|\| isStreaming) && 这是最后一轮`
   → 该轮所有消息**平铺渲染，根本不生成组**；轮结束（不再 busy/streaming）后才一次性成组。
   也就是说——**pi-web 实现的是本节方案 2（静止后收拢），而且是它的彻底版**
6. **组的默认展开策略**：`defaultExpanded={!finalAnswerMessage}`——有最终回答则收起；**没拿到回答**
   （中断 / 报错 / 输出长度截断）则默认**展开**，避免点开一片空白
7. `reveal` prop **与流式无关**，它只服务**搜索结果跳转**（`pendingSearchScroll`）自动展开命中行

> ⚠️ **硬约束（决定选项取舍）**：pi-web 这套规则**只依赖消息序列（role + content blocks）**，
> 不依赖 `turn_start` / `agent_end` 事件。因为 `.jsonl` 的 `SessionEntry` 只有
> `session / message / thinking_level_change / model_change / compaction / branch_summary / custom / label /
> session_info / custom_message`——**没有 turn 或 agent 边界条目**。任何基于 turn/agent 事件的封口规则，
> 都会让 `rebuild()`（历史）与 `fold()`（实时）产出不同形状，而两者等价是 §6.4 的硬要求。

**候选方案**（组边界均为“消息序列驱动”，差别在流式期间**何时真正收拢**）：

| # | 方案 | 视觉 | 可复现 | 成本 |
|---|---|---|---|---|
| 1 | **即时收拢**：末尾一出现非空文本就把之前的 thinking/toolCall 收进组；若之后又出现 `toolCall`，那段文本降级回组内（组自动重新展开）。**原型演示脚本就是这个行为** | “说一句 → 塌陷 → 又展开 → 再说一句”，与真实推理节奏一致，但流式中有跳动 | ✅ 完全由块序列决定 | 低（规则本身就是折叠逻辑） |
| 2 | **静止后收拢（⭐ 已采用 = pi-web 的实现）**：边界规则同 1，但**流式期间该轮平铺、根本不生成组**，只在轮结束时（不再 busy/streaming）才一次性成组并收起 | 平稳：过程实时长出，结束时塌陷一次 | ✅ 重连/刷新时已静止 → 直接是成组态；流式中刷新 → `isStreaming` 仍为真 → 仍是平铺 | 中（多一个 `isLiveTail` 判定，分组规则不变） |
| 3 | 事件驱动（`turn_end` / `agent_end` 封口） | 表面简单 | ❌ **历史无此边界 → 刷新后形状漂移** | 低但错 |
| 4 | 不封口（只折叠单行，不分组） | 丢掉“处理详情 · N 条消息 · M 次工具调用”这一层信息 | ✅ | 最低 |

**已定：方案 2（= pi-web 的实现）**（2026-09-22 决策）：① 它是经过日常使用验证的形状；② run 期间用户最想看的是**过程**
（思考/工具/输出都在实时长），结束时才需要把过程收起来——方案 1 的“塌陷→又展开”反而是噪声；
③ 两种终态（实时结束 / 刷新后）完全一致，不会出现“刷新一下布局变了”。

**方案 2 对 `fold` / `rebuild` 的要求：**

- 分组宜实现为**派生函数** `groupTrail(trail, { isLiveTail })`，而不是在 `fold` 里写死结构：同一个输入
  两种输出，天然满足 §6.4 的等价要求（历史轮的 `isLiveTail` 恒为 `false`）
- `Turn` 需要一个可判定的“是否仍在进行”（`status === 'streaming'` + 是否为末轮），供 ui 算 `isLiveTail`

**两案共用的子规则（已定）**：① 新出现的轨迹行在流式中**自动展开**（`.shimmer` 态），结束后自动收起；
② **用户手动展开过的行/组不得被自动收起覆盖** → `TrailItem` 带 `userToggled` 标记（docs/06 §8.1）。

---

## 7. React 子导出

```ts
// '@ice-ai/client/react'
useAgentSession(sessionId)   // → { turns, streaming, state, send, abort, notice, reconnect }
useAgentStream(sessionId)    // 底层：subscribe + useSyncExternalStore（非 Suspense 场景）
useSessionsQuery()           // REST：列表（含 listFingerprint 失效）
useSessionDetailQuery(id)    // REST：详情
useSessionContextQuery(id)   // REST：历史分页（→ rebuild.ts）
useProjectsQuery()           // REST：项目清单（ADR-0008 的 projectKey）
queryKeys                    // 工厂：失效粒度与 domain 一一对应
```

- 事件流走 `useSyncExternalStore`（`AgentStream` 提供 `subscribe` + `getSnapshot`），**走 Query 是错的**
  （§8-2）；REST 走 Query，`staleTime` 与 `retry` 在 app 侧 `QueryClient` 统一配
- hooks 不搬 UI 状态（窗口宽度、折叠偏好等留在 ui/app，见 docs/06 §8）
- TanStack Query 依赖放在 `/react` 子导出（`peerDependencies` + `peerDependenciesMeta.optional`），
  主入口保持零 React 依赖

---

## 8. 决策状态

### 8.1 已收口（ADR-0009，2026-09-22）

| # | 议题 | 结论 |
|---|---|---|
| 1 | HTTP 层 | **Axios 统一实例**（响应仍由 Zod 解析）；拦截器职责见 §4 |
| 2 | 事件流是否入 TanStack Query | **不入**：`AgentStream` 自持（§7），Query 只管 REST |
| 3 | 外部前端规范是否以 skills 引入 | **不引入**；规范沉淀在 ADR-0009 + 本文 + `docs/06` |
| 4 | dev 接入方式 | **Vite proxy** `/api`（含 SSE）→ `127.0.0.1:9527`（ADR-0009）；浏览器视角同源，`http.ts` 的 `baseURL` 用相对路径 `/api` |
| 5 | `ToolRow.diff` | **用 SDK 现成的串**：取 `toolResult.details.diff`（edit 工具已生成带行号的展示 diff），前端不做 diff 运算、不加依赖（§6.1 注解）→ ui 的 `DiffView` **在 M1 有真实消费方** |
| 6 | 分组与自动展开时机 | ✅ **已定（2026-09-22）：方案 2（静止后收拢）**——组边界由消息序列决定（照 pi-web），流式期间末轮平铺不分组，轮结束才成组；`defaultExpanded = 本轮无最终回答`。规格见 §6.5，消费侧见 `docs/06` §8.1。**已落地**：`groupTrail(rows, {isLiveTail})` + 组件本地 open 状态 |

### 8.3 M1 落地后的验收记录（2026-09-23）

- **单测 17 例**（`packages/client/test/`）：fold↔rebuild 等价（含思考+工具调用+最终回答整轮）、
  late-join 快照不重复、工具行跨两类事件、晚到工具结果补行、`groupTrail` 分组、
  `mergeTurns` 合成轮并入、AgentStream 的 seq 去重 / 重连清空 + onReconnect / 非法帧计数 /
  shutdown 停流 / prompt↔steer 分流
- **事件流时序实测**（curl + 真实 server）：`:`(注释帧) → `connected{lastSeq:0}` → 增量，
  `id:` 帧即 seq（docs/04 §5.2 一致）

### 8.2 未决项

**client 侧无未决设计分叉**（2026-09-22：分组/展开时机定案后全部收口）。
剩余未定的是**跨包的 UI 流程细节**，集中在 `docs/06-ui-design.md` §11.3（新建会话的 `cwd` 来源、
自动滚底脱离策略、<880px 形态、深色主题是否进 M1）。

---

*本文与代码不一致时以代码为准并当天更新（AGENTS.md）。`docs/06-ui-design.md` 是消费侧（ui 组件）
的配套文档，两文共享"视图模型 → 组件 props"的对应关系，改一侧须同时改另一侧。*
