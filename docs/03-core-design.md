# PiBoat —— core 详细设计

> `@ice-ai/core`：Agent 业务核心。本文是 `docs/01-overview.md` §3.1/§5.5 的实现细化，
> API 契约以 `docs/02-protocol-inventory.md` 与 `@ice-ai/protocol` 为准。
> 状态：M1 已落地（2026-09-22） · 与代码不一致时以代码为准并当天更新本文档。

---

## 1. 定位与职责边界

core 是 pi SDK 之上的**传输无关**业务层，补齐 SDK 没有的三件事：

| SDK 缺口 | core 补齐 | 落点 |
|---|---|---|
| 单会话对象，无多会话寻址与生命周期 | 会话注册表 + registryVersion | §3 |
| 事件是进程内内存对象，不可序列化上线 | wire 事件投影（防腐层） | §4 |
| 无断线重连/多端观看语义 | 会话级 seq + late join 时序 | §5 |

铁律（AGENTS.md）：全仓**唯一**允许依赖 `@earendil-works/pi-coding-agent` 的包；
不引入任何 HTTP 概念（为 Electron 进程内直连留路）；SDK 事件/消息字段变动不许泄漏出 core。

## 2. 模块地图

| 文件 | 职责 | 测试 |
|---|---|---|
| `agent/agent-session-service.ts` | 注册表 + 命令分发（FIFO）+ 新建会话 + late-join 订阅入口 | `agent-session-service.test.ts` |
| `agent/session-entry.ts` | 注册表单元：委托订阅 / seq 计数 / 流内状态跟踪 / dispose | `session-entry.test.ts` |
| `events/wire-event.ts` | SDK 事件 → wire 事件投影（**全仓唯一触碰 SDK 事件内部结构的文件**） | `wire-event.test.ts` |
| `events/wire-message.ts` | SDK 消息 → wire 消息（七角色已对齐，仅剥 readonly + 类型边界） | — |
| `read/session-read-service.ts` | `.jsonl` 只读浏览：列表/搜索/详情/分页/改名/统计/级联删除/工具图片读取 | `session-read-service.test.ts` |

## 3. 会话注册表与生命周期

### 3.1 SessionRegistryEntry——为什么在 session 之上再包一层

直接订阅 SDK session 有三个缺口：

1. **runtime 替换**（M2 fork）：旧订阅指向死对象；订阅者挂 Entry，替换时只需在 Entry 上换 `session` 引用并重绑
2. **无序号**：SDK 事件流没有 seq，无法去重与差量重放（§5）
3. **无当前值查询**：SDK 只有事件没有快照查询（排队消息、进行中消息、lastSeq）

Entry 同时做**流内状态跟踪**（投影前先看原始事件）：`queue_update` → queueSnapshot、
`message_update`（assistant）→ streamingMessage、`message_end` → 清空、`agent_settled` → 幂等销账 promptPending。

### 3.2 AgentSessionService

- `entries: Map<sessionId, Entry>` + `commandTails: Map<sessionId, Promise>`（§6 FIFO）
- `#registryVersion`：**只在 create / disposeSession 时 +1**。⚠️ 只反映本进程注册表的结构性
  变动——磁盘侧变化（其他进程写入会话、首条 assistant 消息落盘、改名/fork）不在此列，
  客户端不能只靠它决定是否全量刷新列表（2026-09-21 定案，详见 protocol `rest/sessions.ts` 注释）

### 3.3 dispose 时序

`disposeSession(id, reason)` → 从注册表删除（registryVersion+1）→ `Entry.dispose(reason)`：
**广播 `session_shutdown{reason}` → 清空订阅者 → 解绑 SDK 订阅 → `session.dispose()`**。
订阅者在 shutdown 事件后不会再收到任何事件；server 侧 SSE 据此 graceful 关流（docs/04 §5）。

## 4. 事件投影（wire-event）

SDK 事件不可序列化上线：`partial` 是累积快照（尺寸随流增长）、数组带 readonly、
toolcall 增量缺 `id/toolName`。投影规则（各 case 就近注释于源码）：

| case | 动作 | 理由 |
|---|---|---|
| `toolcall_start / toolcall_delta` | 从 `partial.content[contentIndex]` 补齐 `id / toolName`，剥 partial | 双字段容错提取；增量流不能带累积快照 |
| `message_update` | **丢弃整条累积 message**，只提取 `usage` + 子事件增量 | 累积消息使增量流 O(n²)；完整消息只经 start/end 与快照下发；与 SDK 自家 toJsonEvent 取舍一致 |
| 非 assistant 的 `message_update` | 防御性丢弃（返回 null） | SDK 不变量：只发生于 assistant 流 |
| `turn_end / agent_end / message_start/end` | 消息逐条过 `toWireAgentMessage` | SDK→protocol 契约边界，不许 spread 透传泄漏 SDK 类型 |
| `queue_update` | readonly 数组 → 可变数组 | wire 类型要求 |
| `session_info_changed` | `name === undefined` → 字段缺省 | wire 上不显式携带 undefined |
| 其余（`turn_start / tool_execution_* / compaction_* / auto_retry_* / …`） | 结构透传（TS 结构化检查兜底） | 2026-09-20 定案：与 SDK 对齐，减少分支与心智负担 |

## 5. seq 与 late join 时序

### 5.1 seq 分配规则（SessionRegistryEntry）

1. **先投影后分配**：防御性丢弃的事件不消耗序号
2. **单一计数器**：SDK 事件与服务层自加事件（`connected` / `session_shutdown` / 合成 `message_start`）共用
3. **入参不携带**：载荷工厂与 emitEvent 都不接受外部 seq，调用侧无法伪造

### 5.2 late join 四步时序（`subscribe()`，无 await）

```
①注册 listener → ②connected{sessionId, isStreaming, lastSeq}
→ ③合成 message_start（仅当有进行中的半截消息）→ ④此后增量
```

- **不变式**：「在快照里 ⇒ seq ≤ lastSeq」——②③与真实增量之间无窗口（单线程同步
  分发保证），客户端拿到快照后丢弃流中 `seq ≤ lastSeq` 的重复事件
- **合成 message_start 的载荷非空**：`inFlightMessage` 是 SDK `message_update.message`
  的累积快照；SDK 真实那次 `message_start` 是空壳且发生在订阅前。客户端应**整体替换**，
  不能假设为空（否则接不上后续 delta）
- **工具执行不重放**：`isStreaming: true` 而 `inFlight: null` 是正常态（工具执行中途接入
  只能等 `tool_execution_end` 等事件补齐）

### 5.3 Last-Event-ID 差量重放——承诺与现状

docs/01 §5.4 承诺断线重连走「`Last-Event-ID` 携带 seq 重放差量」。**core 现状只发不存**
（无事件缓冲），server 开工前置缺口见 docs/04 §8。

## 6. 命令通道

### 6.1 FIFO 串行

```
const run = commandTails.get(id) ?? resolved;
const task = run.then(() => dispatch(entry, command));
commandTails.set(id, task.catch(() => {}));   // 队列尾恒 fulfilled
return task;                                   // 错误由本次调用方接住
```

同会话串行、跨会话并行；**前一条命令失败不阻塞后续命令**（错误不传染队列链）。

### 6.2 M1 命令子集与实现要点

| 命令 | 要点 |
|---|---|
| `prompt` | `preflightResult` 回调捕获拒稿 → `PromptRejectedError`；**finally 无条件销账**（见 6.3）；完成信号走事件流 `agent_settled`，返回 null |
| `steer` / `follow_up` | 标记 dispatched；同步失败销账后上抛；入队即返回（销账靠 `agent_settled` 幂等兜底） |
| `abort` / `clear_queue` | 直通 SDK；clear_queue 返回 `{steering[], followUp[]}` 快照 |
| `get_state` | 装配 AgentState：queued/isPromptRunning 来自 **Entry 流内跟踪**，其余直读 SDK；`lastSeq` 与各字段同块同步读取 |
| `get_session_stats` / `get_last_assistant_text` | 直通 SDK 装配 |
| `get_commands` | 聚合三源：扩展命令 + prompt 模板 + 技能（`skill:` 前缀） |
| `get_tools` / `set_tools` | active 集合来自 `agent.state.tools`；set_tools M1 只走 switch 路径（下一轮生效），冷会话重建归 M2 |

### 6.3 isPromptRunning 双来源销账（2026-09-21 修复）

语义是「**调用生命周期**」而非「agent run 生命周期」：SDK `prompt()` 有三条提前 return
路径（扩展命令 / input handler hit / streaming 入队）不起 run、永远不发 `agent_settled`。
销账两条路：①`prompt()` 返回时无条件 `clearPromptPending()`（只会晚不会早，SDK
agent-session.js:776/784/949）②`agent_settled` 事件幂等兜底（steer/follow_up 没有可等的调用）。

### 6.4 命令 vs 轻查——两条通道

`get_state` **命令**与运行中的 prompt 串行（会排队到 run 结束）；`getRunningState()` **轻查**
直读注册表不排队。轮询实时状态必须走轻查（`GET /api/agent/:id`），docs/02 §6.1 ⚠️。

## 7. 只读浏览（read/ 模块组）

数据源是 pi 共享的 `~/.pi/agent/sessions/*.jsonl`（无自建存储，与 pi CLI 天然互见）。
按领域拆分（2026-09-22）：

- `dir-scan.ts` —— 目录元数据扫描 + 指纹（readdir/stat，不解析正文；列表缓存键与
  `listFingerprint` 的单一来源，项目清单与列表共用）
- `ProjectResolver` —— cwd → 项目归一（git 仓库根/worktree/分组键，60s 缓存；ADR-0008）
- `ProjectReadService` —— 项目清单（ADR-0008 分组视图；须与 SessionReadService 共享
  同一 resolver 实例 ⇒ 两处 projectKey 按构造一致，server main.ts 装配）
- `SessionReadService` —— 会话域其余全部（见下）

### 7.1 历史分页算法（`sliceBranchWindow`）

- **沿原始 parentId 父链**迭代（非递归，防爆栈）回溯，**不做压缩过滤**：历史浏览要
  「发生过什么」而不是「模型看到什么」——SDK `buildContextEntries` 是 LLM 上下文投影，
  压缩点之前整体折叠成摘要，`before` 游标落在压缩前条目时失配 → 向上翻页死路
  （08ee0ba 修复）
- **tail 预算只计可见消息**（user/assistant + compaction 分隔条）；toolResult 以附件渲染
  不吃预算，防工具密集会话一页只剩 1 条用户消息
- **raw 条目上限** `max(200, tail*6)`：可见锚点稀疏的长工具流量段兜底
- `before` 语义：excludeLeaf 向上翻页（从其父节点起）；不在会话中/即根 → **空页**而非回退最新窗口
- 条目 → 消息经 SDK `sessionEntryToContextMessages` 平行展开（compaction → 分隔条等），
  再过 `toWireAgentMessage` 收敛契约

### 7.2 其余方法

- `list/search`：`SessionManager.listAll` 扫描（目录指纹缓存，ADR-0008）+ 客户端式过滤（搜索索引 M3）
- `detail`：tree/stats/context 装配；`totalActiveMs` 冷会话置 0（需运行时埋点）
- `rename`：`appendSessionInfo` 追加行（空白名抛 UserInputError）；运行中会话改走命令通道（M2）
- `computeStats`：对齐 SDK `getSessionStats` 聚合口径（导出的纯函数）
- `delete`（docs/04 §8-2）：按 header.parentSession（父会话文件路径）建子链，BFS 收集
  传递闭包，**只级联带子代理标记的子会话**（判定用 custom 条目的 `customType`，字面量
  见 `SessionReadService.delete()`；fork 子会话仍是顶层列表项，不级联）；运行中拦截归 server（409）
- `toolResultImage`（docs/04 §8-3）：按 entryId + blockIndex 读 toolResult 消息的图片块，
  base64 解码为二进制；deferMedia 占位符形状待 protocol 定稿（M1 历史图片全文直发）

## 8. 错误类型

| 类型 | 语义 | server 映射（docs/04 §4） |
|---|---|---|
| `SessionNotFoundError` | 会话不在注册表（未运行/已销毁） | 404 + CommandError |
| `PromptRejectedError` | prompt 输入被拒（扩展拦截），区别于运行失败 | CommandError `{code:'prompt_rejected', accepted:false}` |
| `UserInputError` | 客户端输入错误（模型不可用/空白名），可修正重试 | 400 `{error}`（2026-09-22 server 落地时补） |
| 普通 `Error` | 命令运行失败 | 500 `{error: 'Internal server error'}`（不泄漏堆栈） |

## 9. 测试与事件快照回归

- 六个测试文件（约 1600 行）：service（FIFO/create/late-join）、entry（seq/dispose/销账）、
  wire-event（**事件快照回归**）、read（分页/压缩边界）、project-resolver（归一/缓存）、
  project-read（项目聚合）
- **事件快照回归**（`wire-event.test.ts`）：SDK 事件样例 → wire 输出断言。SDK 升级
  （版本锁 0.85.x）或改投影代码时**必须跑**（AGENTS.md），防事件格式漂移
- 运行：`pnpm turbo run test`（或 `pnpm --filter @ice-ai/core test`）

## 10. 待落地（按里程碑）

- **M2**：fork/压缩/模型组命令（fork 的 runtime 替换在 Entry 上换引用重绑）、扩展 UI 通道、
  set_tools 冷会话重建、ConfigService、改名走命令通道、列表 transient 合并、
  **性能统计累加**（`rounds`←`agent_start`、`steps`←`turn_start`、`llmMs`、`toolMs`、`tps`→
  `SessionStatsInfo.perf?`；累加在 SessionEntry 的流内状态上，**冷会话（本进程未跑过）为 `undefined`**，docs/02 §11.1）、
  **工具预设解析**（模式菜单四项 → 工具名清单；`default` 集只有 core 知道 SDK 的默认工具，docs/02 §11.1）
- **M3**：idle 回收与 liveness lease、SystemService（文件/git worktree）、导出 HTML / auto-name
- **M1 内补**（开工时做，不拖到 M2）：`create()` 前置 **cwd 校验**——不存在或非目录 → `UserInputError` →
  server 400（已有映射）。动机是一个实证结论：SDK `createAgentSession({ cwd })` 对不存在的路径
  **不报错照样建会话**，之后每次 read/bash/edit 工具调用都在会话里失败，用户看到的是“agent 莫名一直报错”
  而不是“路径错了”（docs/02 §4.1、docs/06 §11.3 行 1b）
- **SDK 升级注意**：`systemPrompt` 的来源是 `session.systemPrompt`（0.85.x 即 `agent.state.systemPrompt` 直通）。
  ⚠️ **Pi 0.86 起该字段改为“转录回放”且不可赋值**（升级时必须实测确认），宿主若要下发精确 prompt 只能靠
  `before_agent_start` 扩展覆写——升级 SDK 时必须重验「系统提示词面板显示的仍是否实际发送的 prompt」
  （docs/06 §11.2 附注）
- **server 前置**：SSE 重放缓冲（M1 已降级为忽略 Last-Event-ID，docs/04 §5.5）、
  deferMedia 占位符（待 protocol 定稿；`toolResultImage` 读取已就位）
