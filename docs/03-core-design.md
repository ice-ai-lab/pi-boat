# PiBoat —— core 详细设计

> `@ice-ai/core`：Agent 业务核心。本文是 `docs/01-overview.md` §3.1/§5.5 的实现细化，
> API 契约以 `docs/02-protocol-inventory.md` 与 `@ice-ai/protocol` 为准。
> 状态：**一期全部落地**（M1，2026-09-22；M2/M3 对应模块随 B2–B7 于 2026-02 补齐，见 `docs/07` §6）
> · 与代码不一致时以代码为准并当天更新本文档。

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

20 个源文件 / 12 个 `.test.ts`（+`test/helpers/`，共 180 用例）。按目录分四组：**agent**（运行时）、**read**（磁盘只读）、
**config**（模型与配置）、**resources + system**（资源与宿主能力）。

### 2.1 agent（会话运行时）

| 文件 | 职责 | 测试 |
|---|---|---|
| `agent/agent-session-service.ts` | 注册表 + 命令分发（FIFO，均 24 条命令）+ 新建/reload + fork·clone·navigate_tree 的 runtime 替换 + late-join 订阅入口 | `agent-session-service.test.ts` |
| `agent/session-entry.ts` | 注册表单元：委托订阅 / seq 计数 / 流内状态跟踪（queue、半截消息、扩展 UI、perf 累加）/ dispose | `session-entry.test.ts` |
| `agent/extension-ui-bridge.ts` | 扩展 UI 宿主：阻塞型请求的兜底超时、未决请求结清、widgets/status 代际管理（ADR-0012） | `extension-ui-bridge.test.ts` |
| `agent/liveness.ts` | `LivenessRegistry`：lease + idle 回收（G2-12，判据 = 无观看者且不在跑） | `liveness.test.ts` |
| `agent/session-tool-selection.ts` | 工具预设的会话内持久化（custom 条目读写，`TOOL_SELECTION_CUSTOM_TYPE`） | —（随 service 测） |
| `agent/sdk-types.ts` | SDK 类型的最小再导出（隔离 SDK 依赖面） | — |

### 2.2 read（`.jsonl` 只读与项目视图）

| 文件 | 职责 | 测试 |
|---|---|---|
| `read/session-read-service.ts` | 列表/正文搜索/详情/分页/改名/统计/删除/工具图片/文件指纹（`revision`） | `session-read-service.test.ts` |
| `read/project-read-service.ts` | 项目清单（ADR-0008 派生视图，与列表共用扫描与 resolver） | `project-read-service.test.ts` |
| `read/project-resolver.ts` | cwd → 项目归一（git 仓库根 / worktree / `projectKey`，60s 缓存） | `project-resolver.test.ts` |
| `read/dir-scan.ts` | 会话目录元数据扫描 + 目录指纹（列表缓存键，不解析正文） | —（随 read/project 测） |

### 2.3 config（模型与 models.json）

| 文件 | 职责 | 测试 |
|---|---|---|
| `config/config-service.ts` | models.json 读写、provider 发现/连通测试、目录刷新（仅手动联网，ADR-0011③） | `model-scope.test.ts`（同域） |
| `config/model-scope.ts` | 可见范围编辑引擎：glob/fuzzy 解析、最小编辑、`prune`/`resync`、最后一个模型拒绝（ADR-0011） | `model-scope.test.ts` |
| `config/models-config-store.ts` | models-store overlay 与 cost 归一 | `models-config-store.test.ts` |

### 2.4 resources / system（资源与宿主能力）

| 文件 | 职责 | 测试 |
|---|---|---|
| `resources/resource-service.ts` | skills / plugins / 工具设置 / 项目信任（`DefaultResourceLoader` + `SettingsManager` 同源） | `resource-service.test.ts` |
| `resources/settings-file.ts` | `settings.json` 自由字段读写（`.lock` 目录互斥 + 原子替换，与 pi CLI 互斥） | —（随 resource 测） |
| `system/system-service.ts` | 文件树/读文件/上传、git status·diff、worktree 增删查 | `system-service.test.ts` |
| `system/path-guard.ts` | allowed-roots 判定（`PathGuard` / `isInsideRoot` / `samePath`），全仓唯一安全边界实现 | `system-service.test.ts` |

### 2.5 事件投影

| 文件 | 职责 | 测试 |
|---|---|---|
| `events/wire-event.ts` | SDK 事件 → wire 事件投影（**全仓唯一触碰 SDK 事件内部结构的文件**） | `wire-event.test.ts` |
| `events/wire-message.ts` | SDK 消息 → wire 消息（七角色已对齐，仅剥 readonly + 类型边界） | — |

## 3. 会话注册表与生命周期

### 3.1 SessionRegistryEntry——为什么在 session 之上再包一层

直接订阅 SDK session 有三个缺口：

1. **runtime 替换**（fork/clone/navigate_tree）：旧订阅指向死对象；订阅者挂 Entry，替换时只需在 Entry 上换 `session` 引用并重绑（替换会在旧流上下发 `session_replaced`）
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
| 转录 system 消息（`role === 'system'`） | **整条丢弃**（`message_start` / `message_end` 返回 null；`agent_end.messages` 里过滤） | 携带完整 prompt + 全部工具 schema，尺寸随扩展/技能数量增长，且不是对话内容；历史路径同口径（`context.messages` 跳过它），两侧一致才不漂移（SDK ≥ 0.86） |
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

### 6.2 命令实现要点（24 条命令全量；下表为易踩坑的一批）

| 命令 | 要点 |
|---|---|
| `prompt` | `preflightResult` 回调捕获拒稿 → `PromptRejectedError`；**finally 无条件销账**（见 6.3）；完成信号走事件流 `agent_settled`，返回 null |
| `steer` / `follow_up` | 标记 dispatched；同步失败销账后上抛；入队即返回（销账靠 `agent_settled` 幂等兜底） |
| `abort` / `clear_queue` | 直通 SDK；clear_queue 返回 `{steering[], followUp[]}` 快照 |
| `get_state` | 装配 AgentState：queued/isPromptRunning 来自 **Entry 流内跟踪**，其余直读 SDK；`lastSeq` 与各字段同块同步读取 |
| `get_session_stats` / `get_last_assistant_text` | 直通 SDK 装配 |
| `get_commands` | 聚合三源：扩展命令 + prompt 模板 + 技能（`skill:` 前缀） |
| `get_tools` / `set_tools` | active 集合来自 `agent.state.tools`；`set_tools` 收 `{preset}` 或 `{toolNames}`（恰好一个，core 校验）：运行中走 switch 路径（下一轮生效）返回 `null`；冷会话**重建 runtime** 返回 `{sessionId, recreated:true}` |

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

- `list/search`：`SessionManager.listAll` 扫描（目录指纹缓存，ADR-0008）+ 轻量字段过滤，再对有限候选扫正文（G2-7；候选数与单文件字节数均有上限）
- `detail`：tree/stats/context 装配；`totalActiveMs` 冷会话置 0（需运行时埋点）
- `rename`：`appendSessionInfo` 追加行（空白名抛 UserInputError）；运行中会话 `PATCH` 仍返 **409**（server 提示改走 `set_session_name` 命令，避免与 SDK 写盘竞争）
- `computeStats`：对齐 SDK `getSessionStats` 聚合口径（导出的纯函数）。⚠️ **必须计入 `usage` 条目**（如 `kind: "cache_warm"` 的 prompt 缓存预热，SDK ≥ 0.86）：它不进模型上下文但计费，漏掉它 token / cost 就与 SDK `/session` 不一致；`context_edit` 条目对统计无影响（不改原始消息）
- `delete`（docs/04 §8-2）：删除目标会话文件，返回受影响 id（**只含目标自身**，不级联
  子会话——子代理能力不在本仓范围，见 docs/07 §8-4）；运行中拦截归 server（409）
- `toolResultImage`（docs/04 §8-3）：按 entryId + blockIndex 读 toolResult 消息的图片块，
  base64 解码为二进制；`deferMedia` 占位符形状待后续定（历史图片全文直发）

## 8. 错误类型

| 类型 | 语义 | server 映射（docs/04 §4） |
|---|---|---|
| `SessionNotFoundError` | 会话不在注册表（未运行/已销毁） | 404 + CommandError |
| `PromptRejectedError` | prompt 输入被拒（扩展拦截），区别于运行失败 | CommandError `{code:'prompt_rejected', accepted:false}` |
| `UserInputError` | 客户端输入错误（模型不可用/空白名），可修正重试 | 400 `{error}`（2026-09-22 server 落地时补） |
| 普通 `Error` | 命令运行失败 | 500 `{error: 'Internal server error'}`（不泄漏堆栈） |

## 9. 测试与事件快照回归

- **12 个测试文件 / 180 用例（约 3300 行）**：service（FIFO/create/late-join/fork/命令全集）、
  entry（seq/dispose/销账）、wire-event（**事件快照回归**）、read（分页/压缩边界/正文搜索/指纹）、
  project-resolver（归一/缓存）、project-read（项目聚合）、extension-ui-bridge（超时/结清/代际）、
  liveness（lease/idle 回收）、model-scope（编辑引擎/最后模型拒绝）、
  models-config-store、resource-service、system-service（PathGuard/上传/worktree）
- `test/helpers/fake-runtime.ts`：不启真 SDK 的 runtime 替身（大多数服务测试的基座）
- **事件快照回归**（`wire-event.test.ts`）：SDK 事件样例 → wire 输出断言。SDK 升级
  （版本锁 0.87.x）或改投影代码时**必须跑**（AGENTS.md），防事件格式漂移
- 运行：`pnpm turbo run test`（或 `pnpm --filter @ice-ai/core test`）

## 10. 落地状态与遗留

### 10.1 已落地（原「待落地」清单全部清空）

| 原计划 | 落点 |
|---|---|
| M2：fork/压缩/模型组命令、扩展 UI 通道、`set_tools` 冷会话重建、ConfigService、改名走命令通道、列表 transient 合并 | `agent-session-service.ts` / `extension-ui-bridge.ts` / `session-tool-selection.ts` / `config/`；改名走命令通道已在 `set_session_name` |
| M2：**性能统计累加**（`rounds`/`steps`/`llmMs`/`toolMs`/`tps` → `SessionStatsInfo.perf?`；累加在 SessionEntry 的流内状态上，**冷会话为 `undefined`**） | `agent/session-entry.ts`（docs/02 §11.1） |
| M2：**工具预设解析**（四项预设 → 工具名清单；`default` 集只有 core 知道） | `agent/session-tool-selection.ts` + `set_tools {preset}` |
| M3：idle 回收与 liveness lease、SystemService（文件/git worktree）、导出 HTML / auto-name | `agent/liveness.ts` / `system/`；导出与 auto-name 在 `session-read-service` + model 域 |
| M1 内补：`create()` 前置 **cwd 校验**（不存在或非目录 → `UserInputError` → 400） | ✅ 已落地（`create()`：SDK 对不存在 cwd **不报错照样建会话**，之后每次工具调用都失败，用户看到的是“agent 莫名一直报错”） |
| 外部写入检测 + `resume`（ADR-0013） | ✅ 全量读时比磁盘与内存索引，落后就重建 runtime（`wrapperRebuilt`） |

### 10.2 遗留（有意保留 / 待真机验证）

- **`systemPrompt` 的语义（ADR-0010 已升到 0.87.x；ADR-0015 定案处置）**：`session.systemPrompt` 是
  **转录回放**（从落盘的 system 消息重建），不代表某次请求实际下发的 prompt。**本仓接受这个语义**：
  纯聊天不再做 `before_agent_start` 精确覆写（原 `agent/exact-system-prompt.ts` 已删除），面板显示的就是
  pi 的结构化渲染结果，不得标成「实际下发」。另注：该 getter 内部是
  `buildSystemPrompt(_runSystemPromptOptions ?? _baseSystemPromptOptions)`，而 `_runSystemPromptOptions`
  只在 run 期间存在——注册了强制 prompt 的 handler 时会**随时机变**（run 中显示强制值、空闲显示结构化值），
  这正是删除它的直接原因之一（ADR-0015）
- **`deferMedia` 占位符形状**待后续定（历史图片目前全文直发；`toolResultImage` 惰性读取已就位）
- **SSE 重放缓冲**（Last-Event-ID 差量重放）：core 仍只发不存，重连降级为整体重建（docs/04 §5.5，
  `docs/07` B8 可选）
