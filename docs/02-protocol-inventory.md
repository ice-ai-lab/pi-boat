# PiBoat —— 协议层清单（protocol 包实施依据）

> 版本：v0.2 · 状态：待评审 · 依据：概要设计 `docs/01-overview.md` §3.1/§5.4/§10，对照本仓 SDK 0.85.1 `.d.ts` 类型面全量核验；v0.2 修订：修正事件清单（§5.1）、命令计数与误列条目（§4）、补 4 条遗漏路由（§6）及若干字段
> 用途：`packages/protocol` 的实施清单。形状以 SDK 0.85.1 实际类型面为准，命名与结构按 PiBoat 规范收敛

---

## 1. 定位与总原则

### 1.1 protocol-first，但按里程碑切片

> 为什么需要独立的 protocol 层：决策记录见 [ADR-0006](adr/0006-protocol-package.md)。

- **protocol 优先是对的**：它是零依赖叶子包，core/server/client/ui 全部依赖它，先定它则各包可并行开工；契约先行则争议前置，接口即产品
- **但"先定义" ≠ "先全量定义"**：一次定完全部协议会推迟首个可运行功能 1~2 周。每个里程碑开工的第一件事是定该里程碑的 schema（切片见 §11）
- 本文档是**全量清单**（产品功能全集），各里程碑从中取子集

### 1.2 量级总览

| 类别 | 数量 | 说明 |
|---|---|---|
| REST 路由 | 49 个路由文件（52 个端点文件，其中 2 个为 SSE，部分含多方法） | 九大功能域（§6） |
| SSE 事件流 | 2（agent 事件 + auth 登录流） | `agent/[id]/events`、`auth/login/[provider]`（GET） |
| RPC 命令 | 26（命令通道 25 + `agent/new` 专属 `ensure_session`；2026-09-22：删 Shell 直连组） | `POST /api/agent/:id` 请求体判别联合（§4） |
| 领域类型 | ~40 个 | domain/ 七文件（§3、§10） |
| 事件 wire 类型 | 24 种（SDK 透传 22 + 服务层自加 2；2026-09-22：删 bash_execution_update） | SDK `JsonAgentSessionEvent` 投影 + 服务层事件（§5.1） |

### 1.3 铁律（源自 AGENTS.md / 概要设计，本文档所有条目受其约束）

1. 纯类型 + Zod schema，**零业务逻辑、零运行时依赖**（zod 除外）
2. wire 类型（`WireAgentEvent`）只在 protocol 定义；SDK 事件→wire 的投影函数 `toWireAgentEvent()` 在 **core**（SDK 字段变动不许泄漏出 core）
3. 每个领域类型同时给 TS type 与 Zod schema（服务端入参校验 + 将来 zod-openapi 导出移动端客户端，见概要设计 §5.5）
4. REST 路由形状一旦定稿即是对前端的承诺，变更需 bump `PROTOCOL_VERSION`

---

## 2. ① 基础约定（constants / envelope / errors）

| 条目 | 内容 | 备注 |
|---|---|---|
| `PROTOCOL_VERSION` | 协议版本号 | 已在 M0 骨架落地 |
| `PORTS` | `{ server: 9527, web: 9528 }` | 端口单一来源，已落地 |
| 命令响应信封 | `{ success: true, data: T } \| { error: string, code?, accepted? }` | agent 命令类路由统一信封 |
| 错误码枚举 | `prompt_rejected`（+ `accepted: false`）等 | 区分"输入被拒"与"运行失败"；集中定义避免字符串散落 |
| SSE 元约定 | 心跳 30s（注释帧 `:\n\n`）；断线重连 `Last-Event-ID` | 终端流用 offset 游标重放；agent 事件流附每会话单调递增 `seq`（去重 + 差量重放，概要设计 §5.4）——必须定义进 wire 类型 |
| SSE 票据 | 一次性 query 票据（EventSource 无法带 header） | 与 token 鉴权配套（概要设计 §5.6） |

---

## 3. ② 领域类型（domain）—— protocol 最大的一块资产

**按需定义，不养期货**：schema 随所属里程碑开工再定（§1.1 切片原则）；已定义而无人消费的类型视同期货，删除待消费方出现再加回（加字段是非破坏性的；2026-09-20 定案，取代此前"M1 一次定完惰性资产"）。基础形状须与 SDK 0.85.1 对应类型保持同步，升级时核对。

### 3.1 会话文件条目（对应 `.jsonl` 每行，`SessionEntry` 判别联合）

| 类型 | 字段要点 |
|---|---|
| `SessionHeader` | `type:"session"`, `id`, `timestamp`, `cwd`, `parentSession?` |
| `SessionMessageEntry` | `message: AgentMessage` |
| `ThinkingLevelChangeEntry` | `thinkingLevel` |
| `ModelChangeEntry` | `provider`, `modelId` |
| `CompactionEntry` | `summary`, `firstKeptEntryId`, `tokensBefore`, `usage?`, `fromHook?` |
| `BranchSummaryEntry` | `fromId`, `summary` |
| `CustomEntry` / `CustomMessageEntry` | 扩展自定义数据 |
| `LabelEntry` | `targetId`, `label`（分支命名） |
| `SessionInfoEntry` | `name?`（改名历史行） |

### 3.2 消息与内容块

- `AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | CustomMessage | BashExecutionMessage | BranchSummaryMessage | CompactionSummaryMessage`（与 SDK AgentMessage 完全一致；bashExecution 含 `command/output/exitCode/cancelled/truncated/fullOutputPath`；branch/compactionSummary 为注入 LLM 上下文的合成消息，无 display 字段）
- 内容块：`TextContent | ImageContent | ThinkingContent | ToolCallContent`
- `AgentUsage`：input/output/cacheRead/cacheWrite token 数 + cost 四项分解 + total
- `ContextUsage`：`percent | null`、`contextWindow`、`tokens | null`

### 3.3 会话列表项与树

| 类型 | 要点 |
|---|---|
| `SessionInfo` | `path/id/cwd/name/created/modified/messageCount/firstMessage`；`relation: {kind:"fork", originSessionId?} \| {kind:"subagent", parentSessionId, profile, description, status}`（fork 仍为顶层，仅 subagent 形成父子树；原列出的独立 `parentSessionId` 字段已并入 relation，0.85.1 实现勘误）；`projectRoot/projectKey`（项目分组键，Windows 大小写/分隔符不敏感）；`branch/isWorktree`；`transient`（内存会话未落盘） |
| `SubagentSessionStatus` | `starting/queued/running/completed/failed/aborted/interrupted` |
| `SessionTreeNode` | `entry/children/label?/labelTimestamp?` |
| `SessionContext` | `messages[] + entryIds[]`（平行数组）、`oldestEntryId/hasMore`（向上分页）、`thinkingLevel`、`model` |

### 3.4 状态与统计

| 类型 | 要点 |
|---|---|
| `AgentState`（`get_state` 返回） | `sessionId/sessionFile/isStreaming/isPromptRunning/isCompacting/autoCompactionEnabled/autoRetryEnabled/model/messageCount/pendingMessageCount/queuedMessages{steering,followUp}/lastSeq/contextUsage/systemPrompt/thinkingLevel/extensionStatuses/extensionWidgets`（`lastSeq` 为快照水位线，客户端丢弃 SSE 流中 `seq ≤ lastSeq` 的事件，docs/01 §5.4；`isBashRunning` 已随 Shell 直连组删除，2026-09-22） |
| `isPromptRunning` 语义 | **服务端尚有 prompt/steer/follow_up 调用未销账**（不是「agent run 未结束」）。为什么不能只认 `agent_settled`：SDK `prompt()` 有三条提前 return 路径不进 `_runAgentPrompt`——扩展命令（`/tui` 这类只执行 handler 的）、input handler 返回 `handled` 的、streaming 入队的——它们永**不发** `agent_settled`（`agent-session.js:828/844/864` vs `_emitAgentSettled` 只在 `:784`）。它是事件流盲区（handler 执行期、预检期 `isStreaming=false` 但有事在跑）的唯一判据，客户端用 `isStreaming \|\| isPromptRunning` 判定「还没完」（2026-09-21 修订） |
| `SessionStatsInfo` | userMessages/assistantMessages/toolCalls/toolResults/tokens/cost/contextUsage/totalActiveMs/**sessionName**（rpc 层附加） |
| `ToolInfo` | `name/description/parameters/promptGuidelines/sourceInfo` + `active`（get_tools 时叠加） |
| `SlashCommandInfo` | `name/description/source("prompt"|"skill"|"extension")/sourceInfo`（斜杠命令面板） |

### 3.5 扩展 UI 协议（M2 规划；schema 未定义，2026-09-20 定案随里程碑再定）

- `ExtensionUiRequest`（**10 种 method**）：`select / confirm / input / editor / notify / setStatus / setWidget / setTitle / set_editor_text / custom`，阻塞型（select/confirm/input/editor/custom）带 `id/timeout/expiresAt`；各 method 载荷：`notify {message, notifyType?}`、`setStatus {statusKey, statusText?}`（statusText=undefined 即清除该项）、`setWidget {widgetKey, widgetLines?, widgetPlacement?}`（同上，undefined 即清除）、`setTitle {title}`、`set_editor_text {text}`（向编辑器插入文本）、`custom {…, closed?}`（closed=true 为服务端关闭通知，客户端据此撤下 UI）
- `ExtensionUiResponse`：`{id, value} | {id, confirmed} | {id, cancelled:true}`
- `ExtensionStatusItem / ExtensionWidgetItem`
- ⚠️ 最容易被漏掉的协议成员；扩展交互经命令通道（`extension_ui_response/input`）与事件通道（`extension_ui_request`）双向完成

---

## 4. ③ Agent 命令通道（commands）

`POST /api/agent/:id` 请求体判别联合（**26 命令** = 命令通道 25 个 + `agent/new` 专属 `ensure_session`。⚠️ `custom_message` 不是命令——它是会话条目类型 `CustomMessageEntry`，见 §3.1）：

| 分组 | 命令（参数 → 返回） |
|---|---|
| 对话 | `prompt {message, images?, streamingBehavior?}` → null；`steer / follow_up {message, images?}`；`abort`；`clear_queue` → `{steering[], followUp[]}` |
| 状态 | `get_state` → AgentState；`get_session_stats` → SessionStatsInfo；`get_last_assistant_text` → `{text}` |
| 模型/思考 | `set_model {provider, modelId}` → `{id, provider}`；`set_thinking_level {level}` |
| 压缩 | `compact {customInstructions?}`；`abort_compaction`；`set_auto_compaction {enabled}`；`set_auto_retry {enabled}` |
| 分支 | `fork {entryId}` → `{cancelled, newSessionId}`（**破坏性原地替换**，见概要设计 §8-1）；`fork_branch {entryId}` → 新会话不改当前；`clone {leafId?}`；`navigate_tree {targetId}` → `{cancelled, editorText?}` |
| 工具 | `get_tools` → ToolInfo[]（含 active）；`set_tools {toolNames}` → **双路径**：运行中会话走 switch 返回 null；冷会话走 route 层 `setRpcSessionTools` 重建 runtime，信封 data 为 `{sessionId, recreated}`（返回形状不同，协议需两态） |
| 命令面板 | `get_commands` → `{commands: SlashCommandInfo[]}` |
| 会话管理 | `set_session_name {name}` → null（空白名报错）；`reload` → `{success}`（重绑扩展/同步信任/刷新模型缓存）；`ensure_session`（仅 `agent/new` 的 type 值：只建 runtime 不发首条消息，供客户端预查命令） |
| 扩展 UI | `extension_ui_response`；`extension_ui_input {id, data}` |

> ⚠️ 2026-09-22 决策：**Shell 直连组（`bash` / `abort_bash`，即 TUI `!`/`!!` 直接执行）不实现**，
> 随之删除 `bash_execution_update` 事件（§5.1）、`/bash-output` 端点（§6.3）与
> `AgentState.isBashRunning`（§3.4）。两个边界：① `BashExecutionMessage` 消息角色**保留**
> （§3.2）——会话文件与 pi CLI 共用，历史中的 `!` 执行记录仍须可读可渲染；
> ② LLM 的 bash **工具调用**（tool_use）不受影响——那是 Agent 工具，不是直连命令。

### 4.1 新建会话

`POST /api/agent/new`，body：`{ cwd, type?, message?, images?, provider?, modelId?, toolNames?, thinkingLevel? }`
→ `{ success, sessionId, data, model: {provider, modelId} | null, thinkingLevel }`
（provider 与 modelId 必须成对；thinkingLevel 枚举 `off/minimal/low/medium/high/xhigh/max`）

---

## 5. ④ Agent 事件通道（events，SSE wire）

### 5.1 wire 类型 `WireAgentEvent`

**投影规则**（`toWireAgentEvent()` 归 core，此处将其固化为 schema 约束）：

- `toolcall_start / toolcall_delta` 补齐 `id / toolName`（从 `partial.content[contentIndex]` 提取，双字段容错）
- 剥离 `partial`（完整消息只经快照/历史下发）
- `message_update` 附带 `usage`（SDK JSON 协议固定携带累积用量，尺寸恒定不随流增长）
- `turn_*` 及其余结构一致的事件原样透传（与 SDK 对齐，2026-09-20 定案：删除剔除规则，减少分支与心智负担）

**事件全集**（= SDK `JsonAgentSessionEvent` 透传 ∪ 服务层自加；SDK 0.85.1 `.d.ts` 实测，共 24 种 = 透传 22 + 自加 2；2026-09-22 删 bash_execution_update）：

| 来源 | 事件（载荷） |
|---|---|
| SDK：消息流（pi-agent-core `AgentEvent`） | `agent_start`；`message_start {message}`；`message_update {usage, assistantMessageEvent}`；`message_end {message}`；`tool_execution_start / update {toolCallId, toolName, partialResult} / end`；`agent_end {messages: AgentMessage[], willRetry}`（AgentSessionEvent 增强版，非裸 turn 结束）；`turn_start {}`；`turn_end {message, toolResults[]}`（2026-09-20 改透传） |
| SDK：assistantMessageEvent 子事件（pi-ai，内嵌于 message_update） | `start`、`done`、`error`、`text_start / text_delta / text_end`、`thinking_start / thinking_delta / thinking_end`、`toolcall_start / toolcall_delta / toolcall_end`（start/delta 投影补齐 `id / toolName`）—— 共 12 种，Zod 需全量定义，不可用省略号带过（0.85.1 实测无 `adaptive`，原记 13 种系笔误勘误） |
| SDK：会话生命周期（agent-session 扩展） | `agent_settled`（agent 完全静止，客户端 UI settle 依据）；`queue_update {steering[], followUp[]}`；`compaction_start {reason: manual\|threshold\|overflow}`；`compaction_end {reason, result?, aborted, willRetry, errorMessage?}`；`auto_retry_start {attempt, maxAttempts, delayMs, errorMessage}`；`auto_retry_end {success, attempt, finalError?}`；`summarization_retry_scheduled / _attempt_start（branchSummary 与 compaction 两种变体）/ _finished`；`entry_appended {entry: SessionEntry}`；`session_info_changed {name}`；`thinking_level_changed {level}` |
| **服务层自加**（SDK 没有，server 必须自行定义） | `connected {sessionId, isStreaming, lastSeq}`、`session_shutdown {reason?}`。~~`startup_error` / `prompt_done` / `prompt_error` / `extension_ui_request` / `extension_error` / `extension_ui_closed`~~（2026-09-20 删除：死 schema / agent_settled 平替 / REST 信封覆盖 / M2 再定） |
| PiBoat 新增 | 每事件附 `seq`（会话级单调递增；快照携带 `lastSeq`，客户端丢弃 `seq ≤ lastSeq`） |

> ⚠️ 两点边界（v0.2 勘误）：① wire 上**不定义** `notice` 与顶层 `error` 事件——通知条属前端 UI 概念，错误一律走 REST 信封 `CommandError`（及 assistantMessageEvent.error；prompt_error/startup_error/extension_error 事件已删，2026-09-20）；② 不定义 `auto_compaction_start/end`——SDK 0.85 只发 `compaction_start/end`（reason 字段区分 auto/manual），不留旧别名。

### 5.2 接入时序（late join）

`connected` → 快照 `message_start`（进行中的半截消息）→ 增量续播。快照与订阅间隙的少量事件靠 `seq` 去重（概要设计 §5.4 时序 ①②③④）。

## 5.3 终端事件流 `TerminalEvent`（已移除）

> ⚠️ 2026-01 决策：当前不准备支持终端能力（PTY），本节及 §6.8 终端端点从协议中移除，
> 重启支持时再重新设计。

- `output {data, offset, reset?}`（offset 做 `Last-Event-ID`/`?after=` 游标重放，SSE `id:` 帧即 offset；`reset=true` 表示 backlog 被清空需整体重绘）、`exit {exitCode}`、`closed`
- 心跳 30s；exit/closed 后关流

---

## 6. ⑤ REST 资源类型（rest，按功能域 9 组）

### 6.1 会话列表

| 端点 | 形状 |
|---|---|
| `GET /api/sessions?force=1` | → `{ sessions: SessionInfo[], registryVersion, runningSessionIds[], completionNotificationSuppressedSessionIds[] }`（磁盘扫描与运行时注册表合并） |
| `GET /api/agent/running` | 轻量轮询（可见 Tab 池）：`{ registryVersion, runningSessionIds, 通知抑制ids }` |
| `GET /api/agent/:id` | **单会话状态轻查**：`{running: false}` 或 `{running: true, state: AgentState}`（未运行不报错；客户端在 `agent_end` 后靠它同步模型/上下文/队列状态）。⚠️ 走 `getRunningState()` 直读注册表、**不进命令 FIFO**；`get_state` **命令**则与运行中的 prompt 串行，run 期间发它会排队到 run 结束——轮询实时状态必须走这个路由 |
| `GET /api/sessions/search?q` | → 搜索结果（q ≤ 200 字符） |

> ⚠️ `registryVersion` **只反映运行时注册表的结构性变动**（`create` / `disposeSession`，core 的 `#registryVersion`）。列表本身是「磁盘扫描 ∪ 注册表」合并出来的，但以下磁盘侧变化**不会**改变它：其他进程写入会话（终端 pi / 第二个 server 实例）、本 server 建的会话首条 assistant 消息落盘（空会话在首次落盘前不写文件，见 §3.3 `transient`）、改名 / fork。
>
> 所以它回答的是「**本进程的注册表变了吗**」，不是「列表内容变了吗」。客户端不能只靠它决定要不要全量刷新；跨进程与磁盘侧变更的通知机制待 M2 定（2026-09-21 由 `sessionListVersion` 改名定案）。

### 6.2 会话详情与生命周期

| 端点 | 形状 |
|---|---|
| `GET /api/sessions/:id` | → `{ sessionId, filePath, info, leafId, tree, context, stats, totalActiveMs, toolNames? }`（tail 默认 50，上限 1000） |
| `PATCH /api/sessions/:id` | `{name}` 改名（历史未运行会话直接追加 session_info 行） |
| `DELETE /api/sessions/:id` | 删除（**级联删除全部 subagent 子会话**，返回受影响 id） |
| `GET /api/sessions/:id/state` | 同 `/api/agent/:id` 形状，但会话文件不存在时 **404**（而非 `{running:false}`；语义差异需保留） |
| `GET /api/sessions/:id/export` | → HTML 导出（attachment/inline） |
| `POST /api/sessions/:id/auto-name` | → `{title, usage}`（LLM 生成会话名） |

### 6.3 历史分页与惰性加载

| 端点 | 形状 |
|---|---|
| `GET /api/sessions/:id/context?leafId&before&tail≤1000&deferMedia` | → `SessionContext`；`before` = 客户端已有最老条目（excludeLeaf 向上翻页，不在会话中/即根 → 空页）；`tail` 只计 user/assistant/压缩分隔条；`deferMedia` = 工具结果图片以占位符下发（deferThinking 已删，历史 thinking 全文直发，2026-09-20）。**分页不做压缩过滤**：压缩前条目照常可翻，compaction 投影为 compactionSummary 分隔条而非翻页终点（2026-09-21） |
| `GET /api/sessions/:id/entries/:entryId/thinking?blockIndex` | → `{thinking}`（全量推理文本） |
| `GET /api/sessions/:id/entries/:entryId/tool-result-image?blockIndex` | → 二进制图片 |

> bash-output 端点（超长输出临时文件）已随 Shell 直连组移除（2026-09-22，见 §4 决策注）。

### 6.4 模型

| 端点 | 形状 |
|---|---|
| `GET /api/models?cwd` | → `{ models: Record<provider:id, name>, modelList: [{id,name,provider,input}], defaultModel, thinkingLevels: Record<key, string[]>, thinkingLevelMaps, thinkingLevelPins, modelScopeWarnings?, error? }` |
| `GET/PUT /api/models-config` | models.json 原文读写（PUT 校验后落盘） |
| `POST /api/models-config/discover` | `{providerName, provider:{baseUrl, api, apiKey?}}` → 按 /models 端点发现模型列表（20s 超时） |
| `POST /api/models-config/test` | `{providerName, provider, model:{id}}` → `{ok, error?, …}` 真实补全请求测连通（临时 models.json，20s 超时） |
| `GET /api/models-config/catalog?q` | → models.dev 目录（1h 缓存，服务端代理） |

### 6.5 认证与用量

| 端点 | 形状 |
|---|---|
| `GET /api/auth/providers` | → `{ providers, oauthProviders, apiKeyProviders }` |
| `GET /api/auth/login/:provider` | **SSE**：登录流事件全集 8 种——`auth {url, instructions, token}`（跳转地址 + 等待码回填用 token）、`select_request {message, options, token}`（多账号选择）、`prompt_request {message, placeholder, token}`（手动输码）、`device_code {userCode, verificationUri, intervalSeconds, expiresInSeconds}`、`progress {message}`、`success`、`error {message}`、`cancelled` |
| `POST /api/auth/login/:provider` | `{token, code}` → `{ok, provider}`（token 即 SSE 流下发的登录令牌） |
| `POST /api/auth/api-key/:provider` | `{apiKey}` → `{success}` |
| `POST /api/auth/logout/:provider` | → `{ok}`（OAuth/API Key 类型不匹配返回 409） |
| `POST /api/provider-usage/query` | `{providerId}` → 余额/用量（失败返回 `{status:"query-failed"}`） |

### 6.6 文件系统

| 端点 | 形状 |
|---|---|
| `GET /api/home` | → `{home}`（家目录） |
| `POST /api/default-cwd` | → `{cwd}`（创建 `~/pi-cwd-YYYYMMDD`） |
| `GET /api/cwd/browse?path` | → `{path, parentPath, directories[], drives?}`（目录选择器；Windows 盘符列表） |
| `POST /api/cwd/validate` | `{cwd}` → `{success, cwd, projectRoot, projectKey}`（支持 `~` 展开；选定即加入 allowed-roots） |
| `GET /api/files/*?type=&sessionId=` | `list / read / download / meta / preview / watch` 六种请求类型（忽略 node_modules/.git 等目录）；`sessionId` = **会话引用放行**：allowed-roots 之外的文件若被该会话引用（如工具产出的图片）则可读（type=list 不适用）——协议级访问控制语义，非实现细节 |
| `POST /api/files/*?type=` | `type=upload`（multipart 上传：单文件 ≤ 25MB、总量 ≤ 100MB、文件名校验、冲突策略参数）或 `type=upload-check`（JSON `{fileNames[]}` 上传前冲突预检 → 冲突检查结果） |
| `GET /api/file-index?cwd&q` | → 模糊搜索索引（无 q 时全量索引 ≤ 5000 条；git 仓库走 tracked 文件，硬上限 20 万） |

### 6.7 Git

| 端点 | 形状 |
|---|---|
| `GET /api/git/status?cwd` | → `{isGitRepository, repositoryRoot, files: GitFileStatus[], additions, deletions}`；`GitFileStatusKind: modified/added/deleted/renamed/untracked/conflict` |
| `GET /api/git/diff?cwd&path` | → `{supported, status?, patch?}`（单文件 unified diff） |
| `GET /api/worktrees?cwd` | → `{projectRoot, projectKey, isGit, isTopLevel, currentWorktreePath, worktrees[]}` |
| `POST /api/worktrees` | `{cwd, branch}` → `{path, branch}` |
| `DELETE /api/worktrees` | `{cwd, path, force?}` |

### 6.8 终端（PTY）（已移除，见 §5.3 决策）

| 端点 | 形状 |
|---|---|
| `POST /api/terminal` | `{cwd, cols=80, rows=24, id?}` → `{id}`（32 位 hex） |
| `GET /api/terminal/:id` | → `{id, cwd}` |
| `POST /api/terminal/:id` | `{type:"input", data≤64KB}` 或 `{type:"resize", cols∈[2,1000], rows∈[2,1000]}` |
| `DELETE /api/terminal/:id` | 关闭 |
| `GET /api/terminal/:id/events` | SSE：`TerminalEvent`（§5.3） |

### 6.9 信任与资源（skills / plugins / subagents / 工具设置）

| 端点 | 形状 |
|---|---|
| `GET /api/project-trust?cwd` | → `{requiresTrust, trusted}` |
| `POST /api/project-trust` | `{cwd}` → 信任后状态（无可信资源 409；该 cwd 有活跃会话 409） |
| `GET /api/skills?cwd` | → `{skills: SkillInfo[], diagnostics, projectResourcesLoaded}` |
| `PATCH /api/skills` | 切换 disable-model-invocation |
| `POST /api/skills/search` | `{query, limit?}` → `{package, installs, url}[]` |
| `POST /api/skills/install` | `{package, scope:"global"\|"project", cwd?}` |
| `POST /api/skills/check` / `update` | → `SkillUpdateResult {package, state, currentVersion?, latestVersion?}`（state: up-to-date/update-available/unsupported/error） |
| `GET /api/plugins?cwd` | → `{packages: PluginPackageInfo[], standaloneExtensions, totals, diagnostics, projectResourcesLoaded}` |
| `POST /api/plugins` | `{action: "install"\|"remove"\|"update"\|"disable"\|"enable", source?, scope?, cwd}` |
| `POST /api/plugins/check` | → `PluginUpdateResult[]` |
| `GET/PUT /api/tools/settings` | → `{isWindows, powerShellEnabled}` |
| `GET/PUT /api/subagents/settings` | → `{enabled, maxConcurrent}` |
| `GET/PUT/PATCH/DELETE /api/subagents/profiles?cwd` | subagent 档案 CRUD |
| `GET/POST /api/subagents/:id` | GET → `{run: SubagentRunInfo}`（`sessionId/sessionPath/parentSessionId/parentToolCallId/profile/description/task/runInBackground/status/createdAt/completedAt?/result?/error?/worktreePath?/worktreeBranch?/worktreeCleanupError?`）；POST `{action: "steer"\|"abort", message?}` → `{ok, run}`（steer 需非空 message；不在运行 409） |

---

## 7. ⑥ 辅助通道

| 端点 | 形状 | 备注 |
|---|---|---|
| `POST /api/agent/:id/lease` | → `{success, renewed}` | SSE 观看期间续 liveness lease，推迟 idle 回收（概要设计 §5.4 已纳入设计） |
| `GET /api/push/config` | → `{publicKey}` | VAPID 公钥（私钥不出服务端） |
| `POST /api/push/subscribe` | `{subscription{endpoint,keys{p256dh,auth}}, locale}` | 按 endpoint upsert |
| `GET /api/health` | → `{ok, name}` | M0 已落地 |
| 鉴权 bootstrap | token 经同源接口下发（跨源页面不可读） | 随机 token + Origin/Host 校验 + SSE 一次性票据（概要设计 §5.6）；不采用密码 + cookie + 限流模型，若将来开 LAN 再评估 |
| 应用更新检查 | —（暂缓） | 发布通道未定，暂不纳入协议 |

---

## 8. 不进 protocol 的内容（明确划出）

以下为实现细节，归各包自行消化，**禁止**泄漏进 protocol：

- ANSI 清洗/渲染、MIME 与文件类型判断、预览字节数上限
- markdown/mermaid/katex 渲染配置（前端 ui 层）
- 各类缓存策略（models-cache、session-list 缓存、catalog 缓存）
- allowed-roots 判定逻辑本身（protocol 只定义"403 Access denied"错误形状；判定归 server/core）
- 前端布局/草稿/主题/i18n 状态（`panel-layout`、`draft-store`、theme）
- idle 回收计时、启动去重锁（core 内部机制，对协议只体现为会话存在性）

---

## 9. 关键设计决策（已定）

| # | 议题 | 决策 |
|---|---|---|
| 1 | agent 事件流断线恢复 | 事件附会话级 `seq` + `Last-Event-ID` 差量重放，不做整体刷新（概要设计 §5.4） |
| 2 | 命令信封 | 收敛为 protocol 的泛型信封类型 + 每命令返回类型，不内联在路由实现里 |
| 3 | 协议归置 | 全量收敛进 `@ice-ai/protocol`，server 路由即协议实现层 |
| 4 | 鉴权模型 | 纯本地定位：随机 token + 同源 bootstrap + SSE 一次性票据（§5.6）；LAN 场景另议 |
| 5 | 应用更新检查 | 暂缓（发布通道未定） |
| 6 | 路径风格 | 资源身份进路径、子资源嵌套于所属资源（`/api/sessions/:id/entries/:entryId/thinking`），查询修饰进 query（`?before&tail`）。否决 ID 进 body：GET 无 body（fetch 抛错、SSE 物理不可带）、丢失缓存/重放/日志排查能力；否决 ID 进 query：混淆资源寻址与查询参数（2026-09-22 补记理由）。UUID 过长的排查痛点用日志缩写 ID 解决，不改寻址；鉴权相关端点单独设计 |

## 10. 协议包目录结构

```
packages/protocol/src/
├── index.ts            # 汇总导出
├── constants.ts        # PROTOCOL_VERSION / PORTS / 错误码 / thinkingLevel 枚举
├── domain/             # ②领域类型（纯 TS + Zod）
│   ├── session-entry.ts    # SessionHeader + SessionEntry 联合
│   ├── message.ts          # AgentMessage + 内容块 + AgentUsage
│   ├── session-info.ts     # SessionInfo / SessionContext / SessionTreeNode / SubagentSessionStatus
│   ├── state.ts            # AgentState / SessionStatsInfo / ContextUsage
│   ├── tool.ts             # ToolInfo / SlashCommandInfo
│   ├── extension-ui.ts     # Status/Widget 快照（AgentState 用；Request/Response 交互通道随 M2 再定）
├── commands/           # ③命令通道
│   └── agent-command.ts    # AgentCommand 联合 + NewSessionRequest/Response + 各命令返回类型
├── events/             # ④事件通道
│   ├── wire-agent-event.ts  # WireAgentEvent + seq 语义
│   └── terminal-event.ts      # TerminalEvent
└── rest/               # ⑤⑥REST 资源（按域一文件：类型 + 路径常量 + Zod）
    ├── agent.ts           # agent 运行时域：new / 命令通道 / SSE / running / 轻查
    ├── sessions.ts         # 列表/详情/分页/惰性加载/搜索/导出/auto-name
    ├── models.ts           # models / models-config / discover / test / catalog
    ├── auth.ts             # providers / login(SSE) / api-key / logout / provider-usage
    ├── files.ts            # home / default-cwd / cwd browse+validate / files / file-index
    ├── git.ts              # status / diff / worktrees
    ├── terminal.ts         # PTY CRUD
    ├── resources.ts        # skills / plugins / subagents / tools-settings / project-trust
    └── misc.ts             # health / lease / push
```

> 落地状态：M1 的 protocol 侧已定稿（2026-01）——domain/ 七文件全量、commands M1 子集、
> events/wire-agent-event（终端 TerminalEvent 已按 2026-01 决策移除）、rest/agent + rest/misc +
> rest/sessions（agent 域自 sessions 拆出，按 core 双服务边界分域，2026-09-22）；
> M2/M3 条目按里程碑追加。

## 11. 里程碑切片（从本清单取子集）

| 里程碑 | 取自本清单 | 验收对应 |
|---|---|---|
| **M1 对话 MVP** | §2 全部 + §3 领域类型全量 + §4 命令子集（prompt/steer/followUp/abort/get_state/get_session_stats/get_commands/get_tools/set_tools/get_last_assistant_text）+ 新建会话 + §5 事件全量 + §6.1/6.2/6.3（列表/详情/分页）+ health —— protocol 侧已定稿，待 server/client 实现 | 浏览器完成一轮带工具调用的编程任务 |
| **M2 会话与模型** | §4 剩余命令（分支组/压缩组/set_model/set_thinking_level/set_session_name/reload/custom_message）+ §6.4 模型 + §6.5 认证 | 日常可替代 TUI |
| **M3 完整体验** | §6.6 文件 + §6.7 git + ~~§6.8 终端~~（已移除） + §6.9 资源 + §7 辅助（lease/push） | 端到端功能完整 |
| **M4 桌面端** | 无新增（Electron 复用同一协议） | — |

---

*本文档随协议定稿演进：形状定稿一项勾一项；与代码不一致时以代码为准并当天更新本文档（AGENTS.md）。*
