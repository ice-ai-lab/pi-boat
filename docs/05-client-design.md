# PiBoat —— client 详细设计

> `@ice-ai/client`：类型安全的客户端 SDK。本文是 `docs/01-overview.md` §3.1 的实现细化，
> API 契约以 `docs/02-protocol-inventory.md` 与 `@ice-ai/protocol` 为准，服务端语义见
> `docs/04-server-design.md`，组件侧消费契约见 `docs/06-ui-design.md`。
> 状态：**已随一期前端落地**（client 包已实现；本文为设计稿，与代码不一致时以代码为准并当天更新本文）。技术栈基准已由 ADR-0009 收口（Axios / TanStack Query 边界 / 路由）。
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
├── http.ts              # 统一请求：Axios 实例 + protocol Zod 解析 + 错误信封解包（ADR-0009）
├── endpoints/           # 按 protocol 的 rest 域分批的薄封装（一个域一文件）
│   ├── agent.ts         #   new / send(命令) / state /
│   ├── sessions.ts      #   list / search / detail / context / rename / delete
│   └── projects.ts      #   list
├── stream/
│   ├── event-source.ts  # SSE 连接、心跳、断线重连（EventSource 包装）
│   ├── fold.ts          #   ★ 事件 → 视图模型（纯函数，本文 §6）
│   ├── rebuild.ts       #   ★ REST 历史 → 视图模型（纯函数，本文 §6.4）
│   └── agent-stream.ts  #   AgentStream：subscribe/getSnapshot + seq 对账
├── index.ts             # 框架无关导出（无 React）
└── react/
    ├── index.ts         # '@ice-ai/client/react' 子导出
    ├── use-agent-session.ts
    └── queries.ts       # TanStack Query hooks + queryKeys 工厂
```

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

- 单一 Axios 实例（`ADR-0009`）：`baseURL` 指向 server，**拦截器只做两件事**——错误信封归一
  （非 2xx → 解出 `CommandError` 并以类型化异常抛出）与可选超时；**不做**凭据注入（ADR-0007 已无凭据）
- 每个端点 = `protocol` 的请求/响应 schema（路由路径用字面量），**不自造形状**（与 server 路由同一份契约）
- 流程固定为：`axios.request` → **`schema.safeParse`** → 成功返回 `data` / 失败抛带 path 的错误
  （ADR-0005 铁律：Axios 只负责把 JSON 拿回来，解析权归 Zod）
- 错误信封（docs/04 §4.1）：非 2xx 统一解出 `CommandError`（含 `code`，如 `prompt_rejected`），
  **不**在组件里判断状态码
- 不做重试、不做缓存——重试与缓存都是 Query 的职责

## 5. SSE 订阅与 seq 对账

### 5.1 建立时序（对应 server 侧 docs/04 §5.1）

`GET /api/agent/:id/events` → 立刻收到注释帧 → `connected {sessionId, isStreaming, lastSeq}`
→ 快照 `message_start`（若有半截消息）→ 此后增量。

**命令必须在收到 `connected` 之后才派发**（`AgentStream.waitUntilReady()`，`send`/`steer`/`followUp`
已内置）——服务端的注释帧先于 `core.subscribe()` 下发，所以 `EventSource` 的 `open` 事件**不算**
订阅生效；而 `prompt` 被接受的那一刻服务端就广播了这条 user 消息的 `message_start`，它同时是
`fold` 建 Turn 的锚点。订晚了只会拿到半截 assistant 快照，整轮消息在界面上都不渲染
（表现为「发出去了但界面什么都没有」）。等待上限 2s：连接上不来时照常派发，退化成旧行为。

### 5.2 seq 对账规则（两条，缺一即错乱）

1. `connected.lastSeq` 与每次 REST 快照（`AgentState.lastSeq`）都是水位线：**丢弃 `seq ≤ lastSeq` 的事件**
2. 未取到水位线前收到的事件按到达顺序折叠，取到后按 §1 规则重扫一遍（幂等）

### 5.3 重连是"整体重建"而非差量（服务端仍降级，客户端接口不变）

按 docs/04 §5.5 的决定，`Last-Event-ID` 差量重放未实现（属 B8 可选）：重连 = 重新 `connected` + 快照 + 此后增量。
因此 `fold` 必须支持"从快照半截消息重建轨迹尾部"，且 `AgentStream` 在重连时**清空事件派生态但不清空 REST 派生态**。
（环形缓冲与差量是 core 的待补项，client 侧接口不变。）

落位（2026-09-27，修「刷新中途接流丢流式态」）：

- `AgentStream.applyEvent` 的 `connected` 帧**不过 seq 门禁**：它同时给水位线（重建过的 runtime seq 从头计数，
  旧水位线必须被这一帧覆盖）与运行态。`fold` 用 `connected.isStreaming`（runtime 真相）对齐 `chat.streaming`，
  并把本地还挂着 `streaming` 状态的轮收口——断线期间丢过 `agent_settled` 的连接靠这一帧才不会永久停在「运行中」
- 快照 `message_start`（content 是累积快照而非空壳）由 `fold` 的 `applyAssistantSnapshot` 接回末轮：
  轨迹行按 `toolCallId`（工具）/ thinking 文本前缀认领并**整体替换**，正文写回 `Turn.final` 草稿。
  刷新后轨迹里没有这段 → 直接追加；重连时已有增量行 → 替换而非重复。没有轮锚点时先建孤儿轮（§7.3）
- REST 派生态（`.jsonl` 历史）本身没有「正在跑」的信息，由 `open()` 的 `applyLiveRun` 显式折运行态（§7.2）

### 5.4 必须处理的 SSE 边界

| 情况 | 处理 |
|---|---|
| 心跳注释帧 | 忽略（仅用于保活） |
| 未知事件类型 / 校验失败帧 | 丢弃 + 计数上报（不 crash、不断流） |
| `session_shutdown` | 标记会话终止（`terminated`，composer 禁用）：这是 **runtime 没了**，不是会话没了——`.jsonl` 还在，客户端应显式 `resume` 再接回来（`useAgentSession` 的 revive，ADR-0013） |
| server 重启 / 被 idle 回收（无 shutdown 事件） | 命令回 404 → 先 revive 再重发一次（`dispatchWithRevive`）；lease 心跳 `renewed:false` 是兜底，最长 30s 自愈 |
| 标签页休眠 / 系统唤醒 | `EventSource` 的 `error` → 退避重连；唤醒后必定走整体重建 |
| 一页多会话 | 每个会话一个 `EventSource`（HTTP/1.1 同域 6 连接上限是已知风险 docs/01 §8-7；M1 只有单会话） |

> ‼️ revive 不能只 `POST …/resume`：重建出来的 `SessionRegistryEntry` 是**新对象，seq 从 1 重新计数**，
> 必须同时 `restore()` 重置客户端水位线，否则后续事件全被「seq ≤ watermark」丢掉。因此 revive 直接复用
> `open()`（重建历史 → 冷会话 resume → restore → 重连流）。

---

## 6. 视图模型（View Model）——本包最重要的契约

### 6.0 先说清 `fold.ts` / `rebuild.ts` 是什么

本节反复提到的这两个文件是**纯函数模块**，既不是组件也不是 store（名字容易让人误以为是框架概念）：

- **`fold.ts`**：`fold(事件, 当前视图模型) → 新视图模型`。「fold」是 reduce 的同义词——把 append-only 的
  事件流**折叠**成一个可直接渲染的结构（`Turn[]`）。例如：`message_update` + `thinking_delta` → 往当前
  `ThinkingRow.text` 追加一个字；`message_end`(assistant) → `final` 定稿（中间轮正文降级进轨迹，
  只剩最后一个 process 块之后的 text）、**累计** `usage`（`combineUsage` 轮内求和，2026-10-05 起，
  旧实现覆盖式只剩最后一次调用的数字）。**无状态、无 IO、不 import React** → 单测就是“喂一串事件，断言 `Turn[]`”。
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
  usage: Usage | null;       // 每轮用量 = 轮内全部 LLM 调用累计（combineUsage）→ usage-pills
  endedAt?: number;          // 末条 assistant 消息时间戳（配合 user.at 算轮耗时）
  model: ModelRef | null;
  status: 'streaming' | 'done' | 'stopped' | 'error';
}

type TrailItem = ThinkingRow | ToolRow | TextRow | ProcessGroupData | SystemRow;

interface ThinkingRow { kind: 'thinking'; text: string; streaming: boolean; durationMs?: number }

/** 中间轮的普通文本（非思考、非最终回答）：随轨迹平铺/进组，防止被逐条覆盖的 `final` 吞掉 */
interface TextRow { kind: 'text'; text: string }

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

// 过程组：连续轨迹行在被“最终回答”封口时收拢（原型：“处理详情 · 5 条消息 · 7 次工具调用 · 2 段文本”）
// 类型名带 Data 后缀，避开与 ui 的 ProcessGroup 组件同名；duration 由 ui 从 items 现算，不落模型
interface ProcessGroupData { kind: 'group'; items: TrailItem[]; messageCount: number; toolCallCount: number; textCount: number }

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
| `message_update` + `thinking_start/delta/end` | 追加/更新 `ThinkingRow`（`streaming` 用原型的 `.shimmer` 态），`end` 时定稿；`start` 时若回答草稿已有正文，先降级为 `TextRow`（保块序） |
| `message_update` + `text_start/delta/end` | 写 `Turn.final` draft；草稿被后随 process 块（thinking/toolcall）证明为中间内容时降级为 `TextRow`（§6.5 规则 3） |
| `message_update` + `toolcall_start/delta/end` | 追加/更新 `ToolRow`（`delta` 期 `preparing`，`end` 补齐 `args`/`title`）；`start` 时先把非空草稿降级为 `TextRow` |
| `message_end`（assistant） | `stopReason=toolUse`（中间轮）：残余草稿降级为 `TextRow`、`final` 清空——否则中间正文会被逐条覆盖的 `final` 吞掉（2026-09-30 报障回归）；其余（stop/aborted/error）：`final` = 最后一个 process 块之后的 text（§6.5 规则 3）。**累计**写 `usage`（`combineUsage`，含失败尝试的已计费调用，与 SDK 会话统计同口径）+ `endedAt` |
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
assistant 消息按块序折进轮，与 fold 同规则（§6.5 规则 3/4）：`stopReason=toolUse` 的中间轮整条
进轨迹（text 一律落 `TextRow`）；其余消息只有最后一个 process 块之后的 text 归 `final`。
这是"刷新页面不丢形状"的唯一实现路径，也是 `fold.ts` 的测试对照物（同一轮对话，两条路径产出应等价）。

### 6.5 封口时机：候选方案与硬约束

分组规则（**已定**）如下：

1. **轮的锚点**：`isMessageGroupAnchor(msg)` = `role === 'user'`，或 custom 消息且 `customType` 为 compaction /
   子代理通知 → **一轮 = 从一个锚点到下一个锚点**（不是 SDK 的 `turn_start`）
2. **轮内找最终回答**：从后往前找第一条“`answerBlocks` 含非空 text/image”的 assistant 消息（找不到则取末条 assistant）
3. **单条消息内再切一刀**：`splitFinalAssistantBlocks` = 找最后一个 process block（`thinking` / `toolCall`）的位置，
   其后的 text/image 归 `answerBlocks`，之前的归 `processBlocks`；无 process block 则全是 answer
4. **归组**：最终回答之前的消息 + 最终消息的 `processBlocks` 进组，答案区在组外
   （实现落点：中间轮整条消息的 text 以 `TextRow` 落轨迹——fold 在 thinking_start/toolcall_start/
   message_end(toolUse) 时把回答草稿降级进轨迹；rebuild 按 `stopReason` 同规则切；否则
   会被逐条覆盖的 `final` 吞掉，2026-09-30 报障即此）
5. **⭐ 流式期间不分组**（`ChatWindow.tsx:1104`）：`isLiveTail = (sessionBusy \|\| isStreaming) && 这是最后一轮`
   → 该轮所有消息**平铺渲染，根本不生成组**；轮结束（不再 busy/streaming）后才一次性成组。
   也就是说——**这条规则就是本节方案 2（静止后收拢），而且是它的彻底版**
6. **组的默认展开策略**：`defaultExpanded={!finalAnswerMessage}`——有最终回答则收起；**没拿到回答**
   （中断 / 报错 / 输出长度截断）则默认**展开**，避免点开一片空白
7. `reveal` prop **与流式无关**，它只服务**搜索结果跳转**（`pendingSearchScroll`）自动展开命中行

> ⚠️ **硬约束（决定选项取舍）**：这套规则**只依赖消息序列（role + content blocks）**，
> 不依赖 `turn_start` / `agent_end` 事件。因为 `.jsonl` 的 `SessionEntry` 只有
> `session / message / thinking_level_change / model_change / compaction / branch_summary / custom / label /
> session_info / custom_message`——**没有 turn 或 agent 边界条目**。任何基于 turn/agent 事件的封口规则，
> 都会让 `rebuild()`（历史）与 `fold()`（实时）产出不同形状，而两者等价是 §6.4 的硬要求。

**候选方案**（组边界均为“消息序列驱动”，差别在流式期间**何时真正收拢**）：

| # | 方案 | 视觉 | 可复现 | 成本 |
|---|---|---|---|---|
| 1 | **即时收拢**：末尾一出现非空文本就把之前的 thinking/toolCall 收进组；若之后又出现 `toolCall`，那段文本降级回组内（组自动重新展开）。**原型演示脚本就是这个行为** | “说一句 → 塌陷 → 又展开 → 再说一句”，与真实推理节奏一致，但流式中有跳动 | ✅ 完全由块序列决定 | 低（规则本身就是折叠逻辑） |
| 2 | **静止后收拢（⭐ 已采用）**：边界规则同 1，但**流式期间该轮平铺、根本不生成组**，只在轮结束时（不再 busy/streaming）才一次性成组并收起 | 平稳：过程实时长出，结束时塌陷一次 | ✅ 重连/刷新时已静止 → 直接是成组态；流式中刷新 → `isStreaming` 仍为真 → 仍是平铺 | 中（多一个 `isLiveTail` 判定，分组规则不变） |
| 3 | 事件驱动（`turn_end` / `agent_end` 封口） | 表面简单 | ❌ **历史无此边界 → 刷新后形状漂移** | 低但错 |
| 4 | 不封口（只折叠单行，不分组） | 丢掉“处理详情 · N 条消息 · M 次工具调用”这一层信息 | ✅ | 最低 |

**已定：方案 2（静止后收拢）**（2026-09-22 决策）：① 它在实际使用中被验证为最平稳的形状；② run 期间用户最想看的是**过程**
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
useAgentSession()            // → { sessionId, chat, send, abort, steer, followUp, open, start, liveState, … }（URL 驱动）
useAgentStream(sessionId)    // 底层：subscribe + useSyncExternalStore（非 Suspense 场景）
useSessionsQuery(projectKey) // REST：列表（按项目取；项目未定时不发请求），ADR-0026
useSessionDetailQuery(id)    // REST：详情
useSessionContextQuery(id)   // REST：历史分页（→ rebuild.ts）
useProjectsQuery()           // REST：项目清单（ADR-0008 / 0026 的侧栏项目列表来源）
useCwdProjectQuery(cwd)      // REST：cwd → 项目身份（POST /cwd/validate，兼作 allowed-roots 授权）
queryKeys                    // 工厂：失效粒度与 domain 一一对应
```

- 事件流走 `useSyncExternalStore`（`AgentStream` 提供 `subscribe` + `getSnapshot`），**走 Query 是错的**
  （§8-2）；REST 走 Query，`staleTime` 与 `retry` 在 app 侧 `QueryClient` 统一配
- hooks 不搬 UI 状态（窗口宽度、折叠偏好等留在 ui/app，见 docs/06 §8）
- TanStack Query 依赖放在 `/react` 子导出（`peerDependencies` + `peerDependenciesMeta.optional`），
  主入口保持零 React 依赖

### 7.0 图片一律换算成 src（ADR-0024）

历史请求一律带 `deferMedia=1`，所以 `context.messages` 里的图片块只有 `mimeType`（`data` 为空）。
`stream/image-src.ts` 的 `messageImageSrcs(content, coords)` 是唯一判别处：内联字节 → `data:` URL；
空 data + 有坐标 → `/api/sessions/:id/entries/:entryId/image?blockIndex=N`；没坐标 → 跳过。
坐标里的 `entryId` 由 `context.entryIds`（与 messages 平行的数组）给出，块下标就是消息内下标。

因此视图模型的 `Turn.user.images` / `ToolRow.images` 装的是**可渲染 src**，不是 base64——ui 拿到就
能直接 `<img src>`（`ChatImageList`）。URL 自带 `/api` 前缀：它不经过 axios 的 baseURL。

### 7.1 一份详情，两个消费方（2026-09-26）

会话详情（`GET /api/sessions/:id`）有两个互不知情的需求方：`useAgentSession.open()` 要用它
重建历史与取事件流水位线，`useSessionDetailQuery` 要用它渲染分支树/统计/条目数。它们曾经
各拉一份，加上开发期 `<StrictMode>` 把导航 effect 再跑一遍，**一次切换发了 2–3 份 2.4 MB
的详情**，服务端每份还要全量解析一次会话文件（本机实测切换要等 ~500 ms 量级）。

现归一到内部函数 `fetchSessionDetail(queryClient, id)`（不在 `react/index.ts` 的公开导出里，
只服务 `open()`）：与 `useSessionDetailQuery` 共用同一 query
（key/fetcher 同源，同一个工厂函数），先到的那方真发请求，后到的那方直接读结果或合并
in-flight。两者的 `staleTime` 不同是因为**语义不同**：

| 消费方 | staleTime | 理由 |
|---|---|---|
| `open()`（`fetchSessionDetail`） | `0` | 打开会话必须磁盘最新：旧快照的 `lastSeq` 会把水位线之后重现的历史消息当重复事件丢掉 |
| `useSessionDetailQuery` | 5 s | 只需覆盖「open() 写完 → 组件挂载」这几百毫秒；轮次结束/改名等写路径各自显式重取 |

回归锁：`apps/web/e2e/session-switch.spec.ts`（真浏览器数请求次数——这是两个消费方共缓存的
行为，client 的 react 层没有 renderHook 设施）。

### 7.2 打开「正在跑」的会话：`applyLiveRun`（2026-09-27）

`rebuildChatState` 只认 `.jsonl` 事实，而磁盘上还没有的那一段（进行中的 assistant 消息、
未落盘的 toolResult）它一无所知。所以 `open()` 在拿到 `GET /api/agent/:id` 的 `AgentState` 后
必须把运行态折进重建结果（`stream/rebuild.ts` 的 `applyLiveRun`），否则**刷新中途接流**会同时丢：

| 丢什么 | 后果 | 折法 |
|---|---|---|
| `chat.streaming`（`isStreaming \|\| isPromptRunning`） | composer 回到「发送」态、Esc 不接管 abort——正在跑的任务停不下来 | 直接取 `AgentState` |
| 末轮 `status !== 'streaming'` | `isLiveTail` 为假 → 该轮被收成「过程组」，看不到实时长出来的思考/工具 | 末轮标回 `streaming` |
| 工具行停在 `preparing`（历史里没有 toolResult 可回填） | 「正在运行 bash」显示成已完成且无输出 | 末轮无结果的工具行标回 `running` |
| 排队消息 | steering / followUp 条消失 | 取 `AgentState.queuedMessages` |

`rebuildTurns` 里工具行的起点因此从 `ok` 改成 `preparing`（有结果一律由 `applyToolResult`
回填成 ok/error）：停在 `preparing` 的旧轮与之前的绿色行等价，只有运行中的轮才被标成 `running`。

### 7.3 未落盘会话（首轮刷新）的两道兜底

pi 直到**首条 assistant 消息**落盘才写 `.jsonl`（`SessionManager._persist`：文件里没有 assistant 条目就
不落盘）。所以 `ensure_session` 建的会话在首条 assistant 消息流完之前是「磁盘上不存在」的：
`GET /api/sessions/:id` 回 404、`open()` 只能拿到运行态，**用户消息不在任何通道里**
（快照只补进行中的 assistant 消息）。附带发现（未在本次修）：core 的 `transientInfos()` 按
`sessionFile === undefined` 过滤，而 SDK 建会话时就已分配路径（只是文件未写）——该分支实测永不命中，
所以这个窗口内的会话同样不会出现在会话列表里。两道兜底：

1. `fold`：assistant 侧事件没有轮锚点时先建**孤儿轮**（`orphan: true`，与 `rebuildTurns` 的前导孤儿轮同形）
   —— 否则 `lastTurn(...) === undefined` 会把整段流式内容（含后续 `text_delta`）静默丢掉
2. `useAgentSession`：记下这个 404 过一回的会话 id（`transientRef`），在 `chat.streaming` 回落为假时**只补一次**
   `open()`——那时文件必定已落盘，重开就能补回完整历史（用户气泡 + 轮锚点）；仍在跑时不重开
   （重开会把已 fold 的流式内容冲成历史快照）

仍在的缺口（已知，不在本次范围）：`.jsonl` 没有「过期」概念，所以**已经中断**的旧轮里那个没结果的
工具行也只能显示 `preparing`（无从区分「正在跑」与「跑挂了」）；运行态行总表里「正在运行 xxx 工具 /
等待模型…」的 phase 文案仍未实现（`docs/09` C18 / `docs/10` C18）。

### 7.4 会话作用域缓存随会话切换作废（2026-09-28）

`useAgentSession` 里有一组**只属于当前会话**的 state：`stats` / `liveState` / `tools` / `commands`。
渲染侧读它们的方式统一是「详情查询（按 `sessionId` 分键，切换后 `detail.data` 立刻为空）→ 兜底读这份 state」，
所以只要它们跟着上一次会话活下来，就会把上一个会话的读**当成当前会话的**：

- 空态（新建会话）上整块带出统计行 / 上下文环（点「新会话」后指标行还在，实测复现）与扩展货架；
- 新会话首帧先显示旧会话的模型 / 思考档位。

因此 `switchSession(id)` 是**唯一**的切会话入口，它除了同步 ref + state，还要在 id **真的变了**时
把上面四项清空（`reset()` 走的就是 `switchSession(null)`）。

> ⚠️ 不能无条件清：`revive()` 自愈复用 `open(id)`（同一个 id），清了没人再取——`commands`/`tools`/`stats`
> 只在 `sessionId` 变化时由 web 的预取 effect 重取，界面会一直空着。

中栏 `chat-pane` 另有一道同源护栏：指标行不渲染（空态 / 无统计）时收起「会话信息」面板
（它的定位基准就是指标行；行没了面板会悬在旧位置，且入口一起消失）。

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
| 6 | 分组与自动展开时机 | ✅ **已定（2026-09-22）：方案 2（静止后收拢）**——组边界由消息序列决定，流式期间末轮平铺不分组，轮结束才成组；`defaultExpanded = 本轮无最终回答`。规格见 §6.5，消费侧见 `docs/06` §8.1 |

### 8.2 未决项

**client 侧无未决设计分叉**（2026-09-22：分组/展开时机定案后全部收口）。
剩余未定的是**跨包的 UI 流程细节**，集中在 `docs/06-ui-design.md` §11.3（新建会话的 `cwd` 来源、
自动滚底脱离策略、<880px 形态、深色主题是否进 M1）。

---

*本文与代码不一致时以代码为准并当天更新（AGENTS.md）。`docs/06-ui-design.md` 是消费侧（ui 组件）
的配套文档，两文共享"视图模型 → 组件 props"的对应关系，改一侧须同时改另一侧。*
