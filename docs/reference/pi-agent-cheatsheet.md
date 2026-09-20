## 目录
1. [架构总览](#1-架构总览)
2. [事件系统全景（核心）](#2-事件系统全景)
3. [pi.on 全部 36 个事件](#3-pion-全部-36-个事件)
4. [Agent Loop 循环机制](#4-agent-loop-循环机制)
5. [工具系统](#5-工具系统)
6. [核心 API 速查](#6-核心-api-速查)
7. [扩展系统（Extension API）](#7-扩展系统extension-api)
8. [Harness 新架构（v0.85+）](#8-harness-新架构v085)
9. [pi-ai 模型层速查](#9-pi-ai-模型层速查)
10. [配置与资源体系](#10-配置与资源体系)
11. [常见坑](#11-常见坑)
12. [源码文件索引](#12-源码文件索引)

---

## 1. 架构总览
### 1.1 三层堆栈 + 正交 UI 库
```plain
pi-coding-agent（产品层：CLI/SDK、会话管理、扩展机制、内置工具）
    ├──> pi-agent-core（引擎层：Agent、AgentLoop、AgentEvent、harness）
    │        └──> pi-ai（模型层：35+ Provider 抽象、流式协议、成本追踪）
    └──> pi-tui（终端 UI 库，零依赖 pi-* 兄弟包，可独立复用）
```

| 包（npm scope `@earendil-works/`） | 职责 | 关键导出 |
| --- | --- | --- |
| `pi-ai` | 多供应商 LLM 抽象、流式输出、上下文跨供应商交接 | `createModels`、`streamSimple`、`AssistantMessageEvent`、`Message` |
| `pi-agent-core` | Agent 引擎：循环、工具执行、事件流 | `Agent`、`runAgentLoop`、`AgentEvent`、`AgentTool`、`AgentHarness` |
| `pi-coding-agent` | 完整 CLI 产品 + SDK | `createAgentSession`、`AgentSession`、`ExtensionAPI`、内置工具 |
| `pi-tui` | 差分渲染终端组件库 | `TUI`、`Component` |
| `chord` | 传输无关 facet 服务原语 | `JsonRepresentation` |
| `protocol` | framed CBOR RPC 协议（client/server） | — |
| `session-backends` | 会话存储后端（SQLite 独立包） | `pi-session-backend-sqlite-node` |


**每层可独立使用**：只用 pi-ai 调模型、只用 agent-core 跑循环、或直接用 coding-agent 全家桶。

### 1.2 版本差异速览（教程 v0.80.x → 本地 0.85.1）
| 项 | v0.80.x（教程） | v0.85.1（本地 fork） |
| --- | --- | --- |
| 内核事件名 | `AgencyEvent` | `AgentEvent`（同一批事件，改名） |
| `pi.on` 重载数 | 30 | **36**（新增 `project_trust`、`resources_discover`、`before_provider_headers`、`ui_prompt_start/end`、`session_before_tree`、`session_tree` 等） |
| 内置工具 | 7 个 | **8 个**（新增 `powershell`） |
| harness | 无 | 新增 `AgentHarness`（lane / drive / HookMap 11 钩子） |


---

## 2. 事件系统全景
### 表 1：`AssistantMessageEvent` —— pi-ai，LLM token 流（12 种）
> 描述“一条 assistant 消息是怎么逐字长出来的”。除 `done/error` 外，每个事件都携带 `partial`（累积到当前时刻的半成品消息快照，UI 可直接渲染）。
>

| 事件 | 语义（何时触发） | 载荷字段含义 | 示例 |
| --- | --- | --- | --- |
| `start` | 一条 assistant 消息开始流式生成 | 仅 `partial` 初始骨架 | `{type:"start"}` |
| `text_start` | 一个文本块开始 | `contentIndex`：该块在消息 content 数组中的下标 | `{type:"text_start",contentIndex:0}` |
| `text_delta` | 文本块收到新字符 | `contentIndex` + `delta`：本批新增文本 | `{type:"text_delta",contentIndex:0,delta:"你好"}` |
| `text_end` | 文本块结束 | `contentIndex` + `content`：该块最终全文（权威值） | `{type:"text_end",contentIndex:0,content:"你好，世界"}` |
| `thinking_start` | 一个思考（reasoning）块开始 | 同 `text_start`，对象是思考内容 | `{type:"thinking_start",contentIndex:0}` |
| `thinking_delta` | 思考块收到新字符 | 同 `text_delta` | `{type:"thinking_delta",contentIndex:0,delta:"让我想想"}` |
| `thinking_end` | 思考块结束 | 同 `text_end`；注：被审查(redact)的思考可能 start 即完整、无 delta | `{type:"thinking_end",contentIndex:0,content:"…全文"}` |
| `toolcall_start` | 一个工具调用块开始 | `contentIndex`；此时尚无 id/name，参数是 provider 原始格式，藏在 `partial` 里 | `{type:"toolcall_start",contentIndex:1}` |
| `toolcall_delta` | 工具调用参数 JSON 增量到达 | `contentIndex` + `delta`：参数 JSON 的新增片段 | `{type:"toolcall_delta",contentIndex:1,delta:"\"command\":\"ls\""}` |
| `toolcall_end` | 工具调用解析完成 | `contentIndex` + `toolCall`：结构化结果（id、工具名、参数） | `{type:"toolcall_end",contentIndex:1,toolCall:{id:"tc_1",name:"bash",…}}` |
| `done` | 消息正常结束 | `reason`：停止原因（`stop` 正常；`length` 超 token；`toolUse` 要调工具；`deferred` 延后）+ `message`：最终完整消息 | `{type:"done",reason:"stop",message:{…}}` |
| `error` | 消息异常终止 | `reason`：`aborted`（用户中断）或 `error`（出错）+ `error`：承载错误信息的消息 | `{type:"error",reason:"aborted",error:{…}}` |


### 表 2：`AgentEvent` —— pi-agent-core，Agent 循环（10 种）
> 描述“一次 run（agent_start → agent_end）的执行过程”。`message_update` 内嵌表 1 的子事件。
>

| 事件 | 语义（何时触发） | 载荷字段含义 | 示例 |
| --- | --- | --- | --- |
| `agent_start` | 一次 agent run 开始 | 无载荷 | `{type:"agent_start"}` |
| `turn_start` | 一轮（LLM 调用 + 工具执行）开始 | 无载荷 | `{type:"turn_start"}` |
| `message_start` | 一条 assistant 消息开始 | `message`：消息初始骨架 | `{type:"message_start",message:{…}}` |
| `message_update` | 消息流式更新（每个 token 事件一次） | `message`：累积快照 + `assistantMessageEvent`：触发的底层 token 事件（表 1） | `{type:"message_update",message:{…},assistantMessageEvent:{type:"text_delta",…}}` |
| `message_end` | 一条消息最终定稿 | `message`：权威完整消息 | `{type:"message_end",message:{…}}` |
| `tool_execution_start` | 某工具调用开始执行 | `toolCallId` + `toolName`：定位哪个调用；`args`：参数 | `{type:"tool_execution_start",toolCallId:"tc_1",toolName:"bash",args:{command:"ls"}}` |
| `tool_execution_update` | 工具执行中间输出（如 bash 流式输出） | 同上 + `partialResult`：中间结果 | `{type:"tool_execution_update",toolCallId:"tc_1",…,partialResult:"file1\n"}` |
| `tool_execution_end` | 工具执行结束 | 同上 + `result`：最终结果；`isError`：是否失败 | `{type:"tool_execution_end",toolCallId:"tc_1",…,result:"…",isError:false}` |
| `turn_end` | 一轮结束 | `message`：本轮 assistant 消息 + `toolResults`：本轮工具结果消息 | `{type:"turn_end",message:{…},toolResults:[…]}` |
| `agent_end` | 一次 run 结束 | `messages`：本次 run 产生的全部消息 | `{type:"agent_end",messages:[…]}` |




### 表 3：`AgentSessionEvent` —— pi-coding-agent SDK，会话级（23 种）
> 在 AgentEvent 之上描述“会话生命周期”：多轮重试、历史压缩、队列、持久化。前 10 种继承自表 2（`agent_end` 增加了 `willRetry` 字段：run 失败后是否会自动重试），此处只列新增的 13 种 + 增强的 1 种。
>

| 事件 | 语义（何时触发） | 载荷字段含义 | 示例 |
| --- | --- | --- | --- |
| `agent_end`（增强） | run 结束 | 同表 2 + `willRetry`：将自动重试（此时 UI 不应显示为最终失败） | `{type:"agent_end",messages:[…],willRetry:true}` |
| `agent_settled` | run 完全落定：监听器回调执行完、历史已持久化 | 无载荷 | `{type:"agent_settled"}` |
| `queue_update` | 用户在 run 进行中排队了新输入 | `steering`：插队消息（下轮立即生效）；`followUp`：追加消息（run 结束后触发新 run） | `{type:"queue_update",steering:["改用 pnpm"],followUp:[]}` |
| `compaction_start` | 会话历史压缩开始（手动 / 超阈值 / 超上下文溢出） | `reason`：触发方式 | `{type:"compaction_start",reason:"threshold"}` |
| `compaction_end` | 压缩结束（成功/中止/失败） | `reason` + `result`：摘要、首个保留条目 id、压缩前后 token 数；`aborted`：是否被中断；`willRetry`：将重试；`errorMessage`：失败原因 | `{type:"compaction_end",reason:"manual",result:{summary:"…",…},aborted:false,willRetry:false}` |
| `auto_retry_start` | run 失败、安排自动重试 | `attempt`/`maxAttempts`：第几次/上限；`delayMs`：等待毫秒数；`errorMessage`：上次失败原因 | `{type:"auto_retry_start",attempt:1,maxAttempts:3,delayMs:2000,errorMessage:"429"}` |
| `auto_retry_end` | 自动重试流程收尾 | `success`：最终是否成功；`attempt`：总次数；`finalError`：仍失败时的原因 | `{type:"auto_retry_end",success:true,attempt:2}` |
| `summarization_retry_scheduled` | 摘要生成失败、安排重试 | 同 `auto_retry_start` | `{type:"summarization_retry_scheduled",…}` |
| `summarization_retry_attempt_start` | 一次摘要重试开始 | `source`：重试来源——分支摘要（`branchSummary`）或压缩摘要（`compaction`，此时附 `reason`） | `{type:"summarization_retry_attempt_start",source:"compaction",reason:"threshold"}` |
| `summarization_retry_finished` | 摘要重试全部结束 | 无载荷 | `{type:"summarization_retry_finished"}` |
| `entry_appended` | 会话持久化追加一条历史条目（用户输入/工具调用…） | `entry`：条目对象（含 id、角色、内容、时间戳等） | `{type:"entry_appended",entry:{…}}` |
| `session_info_changed` | 会话元信息变更 | `name`：新会话名；`undefined` 表示清除命名 | `{type:"session_info_changed",name:"修 bug"}` |
| `thinking_level_changed` | 思考级别被调整 | `level`：`off`/`minimal`/`low`/`medium`/`high` | `{type:"thinking_level_changed",level:"medium"}` |
| `bash_execution_update` | bash 工具执行中的增量输出 | `delta`：新增输出文本；`id`：可选定位 | `{type:"bash_execution_update",delta:"done\n"}` |


### 表 4：`JsonAssistantMessageEvent` —— pi-boat protocol，wire 子事件（12 种）
> 表 1 的 **wire 投影形态**：语义完全相同，但剥掉 `partial`（完整消息只走快照，流上只有增量、省带宽），且 `toolcall_start/delta` **补齐** `id`/`toolName`（双字段容错后收敛，客户端不用自己去挖）。
>

| 事件 | 与表 1 的差异 | 新增/保留字段含义 | 示例 |
| --- | --- | --- | --- |
| `start` | 剥 `partial` | 无载荷，仅标记消息开始 | `{type:"start"}` |
| `text_start` | 同上 | `contentIndex` | `{type:"text_start",contentIndex:0}` |
| `text_delta` | 同上 | `contentIndex` + `delta` | `{type:"text_delta",contentIndex:0,delta:"你好"}` |
| `text_end` | 同上 | `contentIndex` + `content`（最终全文） | `{type:"text_end",contentIndex:0,content:"…"}` |
| `thinking_start` | 同上 | `contentIndex` | `{type:"thinking_start",contentIndex:0}` |
| `thinking_delta` | 同上 | `contentIndex` + `delta` | `{type:"thinking_delta",contentIndex:0,delta:"…"}` |
| `thinking_end` | 同上 | `contentIndex` + `content` | `{type:"thinking_end",contentIndex:0,content:"…"}` |
| `toolcall_start` | 剥 `partial`，**投影补齐** | + `id`：工具调用 id；`toolName`：工具名 | `{type:"toolcall_start",contentIndex:1,id:"tc_1",toolName:"bash"}` |
| `toolcall_delta` | 同上 | `contentIndex` + `delta` + `id` + `toolName` | `{type:"toolcall_delta",contentIndex:1,id:"tc_1",toolName:"bash",delta:"\"cmd…\""}` |
| `toolcall_end` | 同上 | `contentIndex` + `toolCall`（结构化结果） | `{type:"toolcall_end",contentIndex:1,toolCall:{…}}` |
| `done` | 原样 | `reason` + `message`：最终消息 | `{type:"done",reason:"toolUse",message:{…}}` |
| `error` | 原样 | `reason` + `error`：错误消息 | `{type:"error",reason:"error",error:{…}}` |


### 表 5：`ClientAgentEvent` —— pi-boat protocol，SSE wire（25 种 = SDK 透传 23 + 服务层自加 2）
> 前后端唯一契约。**所有事件统一携带 **`seq`：会话级单调递增序号，即 SSE `id:` 帧，断线重连按 Last-Event-ID 差量重放；快照带 `lastSeq`，客户端丢弃重复。SDK 事件语义同表 2/3，此处不赘述，重点列差异与服务层自加事件。
>

| 事件 | 语义（何时触发） | 相对 SDK 的载荷差异 | 示例 |
| --- | --- | --- | --- |
| `agent_start` | run 开始 | +seq | `{type:"agent_start",seq:10}` |
| `turn_start` | 单轮开始（透传，与 SDK 对齐） | +seq | `{type:"turn_start",seq:11}` |
| `turn_end` | 单轮结束（透传，与 SDK 对齐） | +seq；`message` 定稿 + `toolResults` | `{type:"turn_end",seq:29,message:{…},toolResults:[…]}` |
| `message_start` | 消息开始 | +seq | `{type:"message_start",seq:11,message:{…}}` |
| `message_update` | 消息流式更新 | +seq；`message` 换成 `usage`（累积用量：输入/输出/缓存 token 数）；`assistantMessageEvent` 用表 4 形态 | `{type:"message_update",seq:12,usage:{…},assistantMessageEvent:{type:"text_delta",…}}` |
| `message_end` | 消息定稿 | +seq | `{type:"message_end",seq:30,message:{…}}` |
| `tool_execution_start` | 工具开始执行 | +seq | `{type:"tool_execution_start",seq:31,toolCallId:"tc_1",toolName:"bash",args:{…}}` |
| `tool_execution_update` | 工具中间输出 | +seq | `{type:"tool_execution_update",seq:32,…,partialResult:"…"}` |
| `tool_execution_end` | 工具执行结束 | +seq | `{type:"tool_execution_end",seq:40,…,result:"…",isError:false}` |
| `agent_end` | run 结束 | +seq（含 `willRetry`） | `{type:"agent_end",seq:41,messages:[…],willRetry:false}` |
| `agent_settled` | run 完全落定 | +seq | `{type:"agent_settled",seq:42}` |
| `queue_update` | 排队输入变更 | +seq | `{type:"queue_update",seq:43,steering:[],followUp:["继续"]}` |
| `compaction_start` | 历史压缩开始 | +seq | `{type:"compaction_start",seq:50,reason:"threshold"}` |
| `compaction_end` | 压缩结束 | +seq；`result` 可选（失败时缺省） | `{type:"compaction_end",seq:55,reason:"threshold",result:{…},aborted:false,willRetry:false}` |
| `auto_retry_start` | 自动重试开始 | +seq | `{type:"auto_retry_start",seq:60,attempt:1,maxAttempts:3,delayMs:2000,errorMessage:"…"}` |
| `auto_retry_end` | 自动重试收尾 | +seq | `{type:"auto_retry_end",seq:65,success:true,attempt:2}` |
| `summarization_retry_scheduled` | 摘要重试安排 | +seq | `{type:"summarization_retry_scheduled",seq:70,…}` |
| `summarization_retry_attempt_start` | 摘要重试一次尝试开始 | +seq；`source` 二选一，仅 `compaction` 附 `reason` | `{type:"summarization_retry_attempt_start",seq:71,source:"branchSummary"}` |
| `summarization_retry_finished` | 摘要重试结束 | +seq | `{type:"summarization_retry_finished",seq:75}` |
| `entry_appended` | 历史条目追加 | +seq | `{type:"entry_appended",seq:80,entry:{…}}` |
| `session_info_changed` | 会话名变更 | +seq；`name` 缺省 = 清除命名 | `{type:"session_info_changed",seq:81,name:"修 bug"}` |
| `thinking_level_changed` | 思考级别变更 | +seq | `{type:"thinking_level_changed",seq:82,level:"high"}` |
| `bash_execution_update` | bash 增量输出 | +seq | `{type:"bash_execution_update",seq:83,delta:"done\n"}` |
| `connected` | **服务层自加**：SSE 建流成功，随发快照再续流 | `sessionId`；`isStreaming`：是否有进行中的半截消息 | `{type:"connected",seq:0,sessionId:"s_1",isStreaming:true}` |
| `session_shutdown` | **服务层自加**：会话被关停 | `reason`：`idle`（闲置回收）/ `server_shutdown`（服务关闭）/ `error` | `{type:"session_shutdown",seq:100,reason:"idle"}` |


> 2026-09-20 定案：turn_* 改为透传；`startup_error`（死 schema）、`prompt_done`（`agent_settled` 平替）、`prompt_error`（REST 信封 `CommandError` 覆盖）、extension 三事件（M2 再定）已删除。settle 依据 = `agent_settled`。
>





## 3. pi.on 全部 36 个事件
> 定义：`packages/coding-agent/src/core/extensions/types.ts:1252-1301`（`ExtensionAPI.on` 重载）。  
Handler 签名统一为 `(event, ctx: ExtensionContext) => Result | void`。★ = Agent 等待返回值并能改变行为。
>

### 3.1 决策点事件（14 个，有返回值）
| 事件 | 时机 | 返回值能力 |
| --- | --- | --- |
| ★ `tool_call` | 工具执行前（"安检门"） | `{ block, reason, terminate }`；**可直接原地改 **`event.input` 改参数 |
| ★ `tool_result` | 工具执行后 | `{ content, details, isError, usage }` 字段级覆盖，链式 |
| ★ `input` | 用户输入后、skill/template 展开前 | `{ action: "continue" | "transform" | "handled" }`，handled 可短路 |
| ★ `before_agent_start` | Agent 开跑前 | `{ message, systemPrompt }` 覆盖本轮系统提示词 |
| ★ `context` | 每次 LLM 调用前 | `{ messages }` 链式改写最终发给 LLM 的消息列表 |
| ★ `before_provider_request` | HTTP 请求发出前 | 替换 payload |
| ★ `before_provider_headers` | 请求头组装后 | **原地 mutate** `headers`（注入 tracing 等），返回值忽略 |
| ★ `after_provider_response` | 收到响应、消费流之前 | 通知型（status/headers） |
| ★ `message_end` | 消息定稿 | `{ message }` 替换定稿消息（角色不变） |
| ★ `user_bash` | 用户 `!`/`!!` 前缀执行 bash | `{ operations, result }` 可接管执行 |
| ★ `project_trust` | 项目信任判定 | `{ trusted: "yes"|"no"|"undecided", remember }` |
| ★ `resources_discover` | session_start 后发现资源路径 | `{ skillPaths, promptPaths, themePaths }` |
| ★ `session_before_switch` | 切换会话前 | `{ cancel }` |
| ★ `session_before_fork` | 分叉会话前 | `{ cancel, skipConversationRestore }` |
| ★ `session_before_compact` | 压缩前 | `{ cancel, compaction }`（可自带压缩结果） |
| ★ `session_before_tree` | 树导航前 | `{ cancel, summary, customInstructions, label }` |


### 3.2 通知型事件（22 个，返回值忽略）
| 分类 | 事件 |
| --- | --- |
| 会话生命周期 | `session_start`（reason: startup/reload/new/resume/fork）、`session_info_changed`、`session_shutdown`、`session_tree` |
| 压缩结果 | `session_compact`、`session_compact_failed` |
| Agent 生命周期 | `agent_start`、`agent_end`、`agent_settled` |
| Turn/Message/Tool | `turn_start`、`turn_end`、`message_start`、`message_update`、`tool_execution_start`、`tool_execution_update`、`tool_execution_end` |
| 模型 | `model_select`（model/previousModel/source: set/cycle/restore）、`thinking_level_select` |
| UI | `ui_prompt_start`、`ui_prompt_end`（kind: select/confirm/input/editor/custom） |


> ⚠️ `tool_call` ≠ `tool_execution_start`：在 `subscribe` 里写 `event.type === "tool_call"` 分支永远命中不了（那是管道 B 独占事件）。
>

---

## 4. Agent Loop 循环机制
> 源码：`packages/agent/src/agent-loop.ts`、`packages/agent/src/agent.ts`；教程第 3 章。
>

### 4.1 入口与签名
```typescript
// 低层
async function runAgentLoop(
  prompts: AgentMessage[],     // 本次注入的消息
  context: AgentContext,       // 快照 { systemPrompt, messages, tools }
  config: AgentLoopConfig,     // 模型 + 全部钩子
  emit: AgentEventSink,        // 事件发射器
  signal?: AbortSignal,
  streamFn?: StreamFn,
): Promise<AgentMessage[]>

// 高层（常用）
const agent = new Agent({ initialState, convertToLlm, streamFn });
await agent.prompt("Hello!");
```

### 4.2 双层循环
```plain
Agent.prompt() → runAgentLoop() → runLoop()
  外层 while(true)：followUp 续命
    内层 while(有工具调用 || 有 pendingMessages)：
      ① 注入 pendingMessages（steering）
      ② streamAssistantResponse()：transformContext → convertToLlm → 调 LLM 流式
      ③ 检查 stopReason：error/aborted → 硬停止
      ④ executeToolCalls()：准备(顺序) → 执行(并行) → 事件(有序)
      ⑤ emit turn_end
      ⑥ prepareNextTurn → shouldStopAfterTurn → 再查 steering
    → 查 followUp 队列：有则续命，无则 emit agent_end
```

消息流转：`AgentMessage[] → transformContext() → convertToLlm() → Message[] → LLM`。  
`convertToLlm` 只保留 `user`/`assistant`/`toolResult` 三种标准消息，其余（自定义/UI 消息）过滤。

### 4.3 steering vs followUp
|  | steering（转向） | followUp（追发） |
| --- | --- | --- |
| 检查时机 | 循环开始前 + 内层每圈结尾 | 内层循环全部结束后 |
| 语义 | 紧急插队（工具执行间隙注入） | 排队等叫号（当前任务完成后继续） |
| QueueMode | `"all" | "one-at-a-time"` | 同左 |


### 4.4 四条退出路径
| 路径 | 条件 | 说明 |
| --- | --- | --- |
| 正常退出 | `stop`/`length` + 队列空 | 实际驱动循环的是 `toolCalls.length > 0 && !terminate` |
| 硬停止 | `error` / `aborted` | 立即退出，**不检查 followUp**（fail-fast） |
| 钩子停 | `shouldStopAfterTurn()` 返回 true | 上下文快满、最大 Turn 数 |
| 工具终止 | 一批工具结果**全部** `terminate: true` | 用 every 而非 some（保守策略） |


`StopReason`：`"pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred"`（前 3+toolUse 来自模型 API，error/aborted 由框架注入，deferred 为 0.85 新增异步工具语义）。

---

## 5. 工具系统
> 源码：`packages/agent/src/types.ts`、`packages/coding-agent/src/core/tools/`；教程第 5 章。
>

### 5.1 三层类型体系
| 层 | 包 | 接口 | 职责 |
| --- | --- | --- | --- |
| 1 | pi-ai | `Tool` | `name` + `description`（给 LLM）+ `parameters`（TypeBox Schema）+ 可选 `constrainedSampling` |
| 2 | pi-agent-core | `AgentTool` | + `label`（给 UI）、`prepareArguments`（参数兼容垫片）、`execute(toolCallId, params, signal?, onUpdate?)`、`executionMode`、`replay` |
| 3 | pi-coding-agent | `ToolDefinition` | + `execute` 第 5 参 `ctx: ExtensionContext`（闭包注入）、`renderCall`/`renderResult`（TUI 自定义渲染）、`promptSnippet`/`promptGuidelines`（注入系统提示词） |


```typescript
// AgentToolResult 结构
{
  content: (TextContent | ImageContent)[],  // 返回给模型
  details: T,                               // 给日志/UI 的结构化数据
  usage?: Usage,                            // 工具自身 token 消耗
  addedToolNames?: string[],                // 延迟加载工具（deferred tool loading）
  terminate?: boolean,                      // 提前停止提示
}
```

### 5.2 内置工具（8 个）
> `packages/coding-agent/src/core/tools/index.ts`。默认只启用前 4 个（`defaultActiveToolNames = ["read", "bash", "edit", "write"]`）。
>

| 工具 | 功能 | 关键参数 | Operations 依赖 |
| --- | --- | --- | --- |
| `read` | 读文件（支持行偏移、图片 MIME 检测、截断） | `path`, `offset?`, `limit?` | readFile, access |
| `bash` | 执行 shell（超时/中止/退出码包装） | `command`, `timeout?`, `runInBackground?` | exec |
| `powershell` | Windows 对应物（0.85 新增） | 同 bash | exec |
| `edit` | 多段文本替换 `edits: [{oldText, newText}]` | `path`, `edits` | readFile, writeFile |
| `write` | 写文件（自动 mkdir） | `path`, `content` | writeFile, mkdir |
| `grep` | 按模式搜内容（上下文行、文件过滤） | `pattern`, `path?`, `include?`, `contextLines?` | isDirectory, readFile |
| `find` | glob 查找文件 | `pattern`, `path?` | exists, glob |
| `ls` | 列目录 | `path` | exists, stat, readdir |


分组工厂：

```typescript
import { createCodingTools, createReadOnlyTools, createAllToolDefinitions } from "@earendil-works/pi-coding-agent";

createCodingTools(cwd)   // [read, bash, edit, write]
createReadOnlyTools(cwd) // [read, grep, find, ls]
createAllToolDefinitions(cwd) // 全部 8 个（含 powershell）
// 单个：createReadTool(cwd) / createBashTool(cwd) / ...
```

关键设计：

+ **Operations 抽象**：工具不直接碰 `fs`/`child_process`，通过最小接口（`BashOperations` 等）调用 → 可 Mock、可远程化。
+ **文件安全**：`withFileMutationQueue` 保证对同一文件的编辑串行化（第二道防线）。
+ **harness 层工具**（`packages/agent/src/harness/tools/`）：bash/edit/read/write 的 ExecutionToolContext 版本 + `image` 工具。

### 5.3 五步执行管道
```plain
LLM 输出 ToolCall
→ ① prepareArguments（参数垫片，处理模型怪癖）
→ ② validateToolArguments（TypeBox 运行时校验）
→ ③ beforeToolCall（前置钩子，可 block）
→ ④ tool.execute（onUpdate 流式进度）
→ ⑤ afterToolCall（结果覆盖）
→ ToolResultMessage
```

**错误即消息**：6 种失败（工具未找到 / 垫片异常 / 校验失败 / beforeToolCall 阻止 / execute 异常 / afterToolCall 异常）全部编码为 `isError: true` 的正常 ToolResultMessage，**循环永不中断**。

### 5.4 执行模式
+ `"parallel"`（默认）：准备阶段顺序（beforeToolCall 有副作用）→ 执行并行 → `tool_execution_end` 按完成顺序发、toolResult 消息按 assistant 源顺序发。
+ `"sequential"`：逐个执行。
+ **一票否决**：批次中任一工具 `executionMode: "sequential"` → 整批串行。全局 `toolExecution` 或 per-tool `executionMode` 设置。

---

## 6. 核心 API 速查
### 6.1 `Agent`（pi-agent-core，`packages/agent/src/agent.ts`）
```typescript
const agent = new Agent({
  initialState: { systemPrompt, model, thinkingLevel, tools, messages },
  convertToLlm,             // 必需
  streamFn,                 // Models.streamSimple 满足该签名
  transformContext?, getApiKey?, shouldStopAfterTurn?, prepareNextTurn?,
  getSteeringMessages?, getFollowUpMessages?,
  toolExecution?, beforeToolCall?, afterToolCall?,
  onPayload?, onResponse?,  // provider 请求/响应拦截
  steeringMode?, followUpMode?,
});

agent.subscribe((event: AgentEvent) => void);   // 返回注销函数
await agent.prompt("Hello!")                     // string 或 AgentMessage[]
await agent.continue();                          // 继续上次
agent.steer(msg); agent.followUp(msg);           // 入队
agent.clearAllQueues(); agent.hasQueuedMessages();
agent.abort(); await agent.waitForIdle(); agent.reset();
agent.state;  // { systemPrompt, model, thinkingLevel, tools, messages, isStreaming, pendingToolCalls... }
```

### 6.2 `AgentSession`（pi-coding-agent，`agent-session.ts:310`）
| 分类 | 方法 |
| --- | --- |
| 驱动 | `prompt(text, options?: PromptOptions)`、`steer(text, images?)`、`followUp(text, images?)`、`sendUserMessage(content, options?)` |
| 订阅 | `subscribe(listener): () => void` |
| 队列 | `clearQueue()`、`getSteeringMessages()`、`getFollowUpMessages()` |
| 中止/等待 | `abort()`、`waitForIdle()` |
| 模型 | `setModel(model, opts?)`、`cycleModel(...)`、`setThinkingLevel(level, opts?)`、`cycleThinkingLevel()`、`getAvailableThinkingLevels()`、`supportsThinking()`、`setScopedModels()` |
| 工具 | `getActiveToolNames()`、`getAllTools()`、`getToolDefinition(name)`、`setActiveToolsByName(names)` |
| 压缩 | `compact(customInstructions?)`、`abortCompaction()`、`abortBranchSummary()`、`setAutoCompactionEnabled(b)` |
| 重试 | `abortRetry()`、`setAutoRetryEnabled(b)` |
| bash | `executeBash(...)`、`recordBashResult(...)`、`abortBash()` |
| 会话树 | `navigateTree(targetId, options?)`、`getUserMessagesForForking()` |
| 元信息 | `setSessionName(name)`、`getSessionStats()`、`getContextUsage()`、`getLastAssistantText()` |
| 导出 | `exportToHtml(path?)`、`exportToJsonl(path?)` |
| 生命周期 | `bindExtensions(...)`、`reload()`、`dispose()` |


`PromptOptions`：`{ expandPromptTemplates?, images?, streamingBehavior?: "steer"|"followUp", source? }`。

### 6.3 `createAgentSession`（SDK 主入口，`core/sdk.ts`）
```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai";

const { session, extensionsResult, modelFallbackMessage } = await createAgentSession({
  cwd?,                 // 默认 process.cwd()
  agentDir?,            // 默认 ~/.pi/agent
  model?,               // getModel('anthropic', 'claude-sonnet-4-6')
  thinkingLevel?,       // 默认 'medium'（clamp 到模型能力）
  scopedModels?,        // Ctrl+P 循环切换的模型集
  tools?: string[],     // 启用白名单；默认 ["read","bash","edit","write"]
  excludeTools?: string[],
  noTools?: "all" | "builtin",
  customTools?: ToolDefinition[],
  resourceLoader?, sessionManager?, settingsManager?, modelRuntime?,
});

session.subscribe((e) => { /* 管道 A */ });
await session.prompt("hi");
```

---

## 7. 扩展系统（Extension API）
> 定义：`packages/coding-agent/src/core/extensions/types.ts`。扩展 = 接收 `pi: ExtensionAPI` 的工厂函数。
>

### 7.1 `pi.*` 全清单（ExtensionAPI）
| 分类 | API |
| --- | --- |
| 事件订阅 | `on(event, handler)` —— 36 个事件（见第 3 节） |
| 工具 | `registerTool(ToolDefinition)` |
| 命令 | `registerCommand(name, { description, handler, getArgumentCompletions? })` |
| 快捷键 | `registerShortcut(KeyId, { description, handler })` |
| CLI 旗标 | `registerFlag(name, { type: "boolean"|"string", default?, description? })`、`getFlag(name)` |
| 渲染 | `registerMessageRenderer(customType, renderer)`、`registerMarkdownTransformer(fn)`、`registerEntryRenderer(customType, renderer)` |
| 消息动作 | `sendMessage(customMsg, { triggerTurn?, deliverAs?: "steer"|"followUp"|"nextTurn" })`、`sendUserMessage(content, { deliverAs?, expandPromptTemplates? })`、`appendEntry(customType, data?)`（持久化、不进 LLM） |
| 会话元数据 | `setSessionName(name)`、`getSessionName()`、`setLabel(entryId, label?)` |
| 工具查询 | `getActiveTools()`、`getAllTools()`、`setActiveTools(names)` |
| 模型 | `setModel(model): Promise<boolean>`、`getThinkingLevel()`、`setThinkingLevel(level)` |
| Provider | `registerProvider(name, config)` / `registerProvider(provider)`、`unregisterProvider(name)` |
| 其他 | `exec(cmd, args, opts)`、`getCommands()`、`events: EventBus`（扩展间通信总线） |


### 7.2 `ctx.*`（ExtensionContext，事件处理器的第二参数）
| 能力 | 字段/方法 |
| --- | --- |
| UI | `ctx.ui.select/confirm/input/notify/editor/custom/setWidget/setFooter/setHeader/setTitle/setStatus/setTheme/...` |
| 运行环境 | `ctx.mode`（"tui"|"rpc"|"json"|"print"）、`ctx.hasUI`、`ctx.cwd` |
| 状态 | `ctx.sessionManager`（**只读** ReadonlySessionManager）、`ctx.model`、`ctx.scopedModels`、`ctx.thinkingLevel`、`ctx.modelRegistry` |
| 运行控制 | `ctx.isIdle()`、`ctx.signal`、`ctx.abort()`、`ctx.hasPendingMessages()`、`ctx.shutdown()`、`ctx.compact()`、`ctx.getContextUsage()`、`ctx.getSystemPrompt()`、`ctx.isProjectTrusted()` |
| 命令上下文加成 | `ExtensionCommandContext`：+ `waitForIdle()`、`newSession()`、`fork(entryId)`、`navigateTree()`、`switchSession()`、`reload()` |


### 7.3 最小扩展示例
```typescript
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

export const timeExtension: ExtensionFactory = (pi) => {
  pi.on("context", (event) => {
    return { messages: [{ role: "user", content: `当前时间：${new Date().toISOString()}` }, ...event.messages] };
  });
  pi.registerTool({
    name: "get_weather", label: "天气", description: "查询天气",
    parameters: Type.Object({ city: Type.String() }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: `${params.city} 晴` }], details: {} };
    },
  });
};
```

挂载方式：`~/.pi/agent/extensions/`（全局）或项目 `.pi/extensions/` 目录，或 `DefaultResourceLoader({ extensionFactories: [...] })` 内联传入。

---

## 8. Harness 新架构（v0.85+）
> 源码：`packages/agent/src/harness/`。0.85 把"多 lane 会话树 + 持久化运行"抽象为 AgentHarness，是未来主推架构；Agent/AgentSession 仍并行存在。
>

### 8.1 核心概念
+ `AgentHarness.create(options, context)`：把 harness 绑定到一个 open session。
+ **Lane（车道）**：会话树中的一条分支。`harness.lane(name)` 获取，lane 上可以 `prompt()/steer()/followUp()/compact()/navigateTree()/resume()/abort()`。
+ **OperationRequest**：`{ kind: "prompt" | "skill" | "prompt_template" | "compaction" | "navigation" }`。
+ **accept → drive** 两段式：先准入（admission），再驱动执行（drive），支持 `waitForRetry`、`pollDeferred`。
+ **watch 快照**：`lane.watch(ctx)` 返回 `WatchHandle<LaneSnapshot>`（transcript + operation + queues 的严格 JSON 快照），支持 `resnapshot()`。

### 8.2 HarnessEvent（28 种 payload）
> 定义：`packages/agent/src/harness/agent-harness.ts:255-373`。lane 事件携带 `lane` 字段。
>

| 分类 | 事件 |
| --- | --- |
| Run 生命周期 | `run_start`、`run_resume`、`run_suspend`（deferred）、`run_end`（completed/aborted/failed）、`operation_abort` |
| Turn/Message | `turn_start`、`turn_end`、`message_start`、`message_update`、`message_end` |
| Tool | `tool_start`、`tool_update`、`tool_end`（含 `terminate`） |
| 重试 | `retry_scheduled`、`retry_start`、`retry_end` |
| 压缩/导航 | `compaction_start/end`、`navigation_start/end` |
| 会话结构 | `entry_added`、`queue_update`、`lane_created`、`value_update`（session_name/entry_label） |
| 配置 | `config_update`（property: model/thinkingLevel/activeTools/tools/resources/streamOptions/retryPolicy/compactionSettings/steeringMode/followUpMode） |
| 统计/错误 | `usage`（lane + totals）、`fault`、`handler_error` |


订阅：`harness.events.on(type, listener)`；观察：`harness.watchSession(ctx)`。

### 8.3 Harness 钩子（HookMap，11 个）
> `harness.hooks.on(name, handler)`。区别于事件（观察），钩子直接参与执行语义。
>

| 钩子 | 时机 | 可改变什么 |
| --- | --- | --- |
| `before_run` | Run 开始前 | 替换 messages |
| `before_drive` | 每次驱动前 | — |
| `before_run_end` | Run 收尾 | `{ followUp }` 续命 |
| `transform_context` | LLM 调用前 | messages + systemPrompt |
| `before_request` | 模型请求前 | streamOptions |
| `before_payload` | 请求体发出前 | payload |
| `after_response` | 响应后 | 修正 SettledAssistantMessage |
| `before_tool` | 工具执行前 | args / block |
| `after_tool` | 工具执行后 | content/details/isError/usage/terminate |
| `before_compaction` | 压缩前 | decline / 自带 compaction |
| `before_navigation` | 树导航前 | decline / 自带 summary |


---

## 9. pi-ai 模型层速查
> 源码：`packages/ai/src/types.ts`。详细文档见本地 `packages/ai/README_CN.md`（已翻译）。
>

### 9.1 关键类型
```typescript
type KnownApi =
  | "openai-completions" | "mistral-conversations" | "openai-responses"
  | "azure-openai-responses" | "openai-codex-responses" | "anthropic-messages"
  | "bedrock-converse-stream" | "google-generative-ai" | "google-vertex" | "pi-messages";

type Message = UserMessage | AssistantMessage | ToolResultMessage;
type StopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
```

+ `AssistantMessage.content`：`(TextContent | ThinkingContent | ToolCall)[]`，带 `usage`、`stopReason`、`deferred?`、`diagnostics?`。
+ `DeferredHandle`：异步/延迟响应的轮询句柄（provider、id、expiresAt、pollAfterMs）。

### 9.2 Models API
```typescript
import { createModels, streamSimple } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", "claude-sonnet-4-6");
const stream = models.streamSimple(model, context, options); // AssistantMessageEventStream
```

+ Providers 目录约 **48 个文件 / 35+ 品牌**（anthropic、openai、google、deepseek、moonshotai、minimax、groq、mistral、xai、github-copilot、amazon-bedrock、nvidia、cerebras、fireworks、huggingface、baseten、cloudflare、azure、openrouter…含 -cn 变体）。
+ `OpenAICompletionsCompat`：30+ 兼容开关（thinkingFormat 含 "zai"/"qwen"/"deepseek" 等，maxTokensField、cacheControlFormat…）——接自建网关时用。

---

## 10. 配置与资源体系
| 路径 | 作用 |
| --- | --- |
| `~/.pi/agent/` | 全局：`settings.json`、`auth.json`（API key/OAuth）、`models.json`（自定义模型目录）、`extensions/`、`skills/`、`themes/`、`templates/` |
| 项目 `.pi/` | 项目级扩展/技能/主题 |
| `AGENTS.md` | 项目根系统提示词补充（透明注入，可用 `SYSTEM.md` 整体替换系统提示词） |
| `SKILL.md` | 技能定义（渐进式披露，正文按需读取） |
| 会话文件 | JSONL 树状结构（DAG），支持 fork/navigate；目录 `getDefaultSessionDir()` |


五种定制杠杆：**Extensions**（热重载，Agent 可改自己的能力）、**Skills**、**Prompt Templates**、**Themes**、**Pi Packages**（npm/git 分发）。

四种运行模式：`tui`（交互）/ `rpc` / `json` / `print`。

CLI 常用：`pi`（交互）、`pi -p "prompt"`（print）、`pi --model provider/id`、`pi resume`、`pi --mode rpc`。

---

## 11. 常见坑
1. `message_end`** 一轮触发多次** → 整轮收尾用 `agent_settled`（session 层）。
2. **管道 A 收不到 **`tool_call`**/**`context`** 等决策点事件** → 那些是 `pi.on`（管道 B）独占。
3. `session.subscribe`** 的 async listener 错误被吞** → 必须自己 try-catch。
4. `sessionManager`** 只读** → 写入走 `pi.sendMessage()` / `pi.appendEntry()`，或命令上下文。
5. **并行批次的 **`tool_execution_end`** 顺序 ≠ 消息顺序** → 结束事件按完成序，toolResult 消息按 assistant 源顺序。
6. **扩展在 **`tool_call`** 崩溃 = fail-closed** → 工具直接被拦（宁可拦错不可放过）。
7. **教程（v0.80.x）的 **`AgencyEvent`**、30 个 **`pi.on`** 重载、7 个工具** → 本地 0.85.1 对应 `AgentEvent`、36 个、8 个（+powershell）。

---

## 12. 源码文件索引
| 主题 | 文件（相对 `packages/`） |
| --- | --- |
| AgentEvent / AgentTool / AgentLoopConfig | `agent/src/types.ts` |
| Agent 类 | `agent/src/agent.ts` |
| Agent Loop 实现 | `agent/src/agent-loop.ts` |
| HarnessEvent / HookMap / AgentHarness | `agent/src/harness/agent-harness.ts` |
| Harness 事件总线 | `agent/src/harness/events.ts` |
| Harness 运行时（drive/lane/reducer） | `agent/src/harness/runtime/` |
| 内置工具（harness 版） | `agent/src/harness/tools/` |
| pi-ai 流协议事件 / Api / Message | `ai/src/types.ts` |
| Providers | `ai/src/providers/` |
| AgentSessionEvent / AgentSession 类 | `coding-agent/src/core/agent-session.ts` |
| SDK 入口 createAgentSession | `coding-agent/src/core/sdk.ts` |
| ExtensionAPI（pi.on 36 重载 / ctx） | `coding-agent/src/core/extensions/types.ts` |
| 扩展加载/运行 | `coding-agent/src/core/extensions/loader.ts`、`runner.ts` |
| 内置工具（8 个，产品版） | `coding-agent/src/core/tools/index.ts` |
| 会话管理（树/fork） | `coding-agent/src/core/session-manager.ts` |
| 设置 | `coding-agent/src/core/settings-manager.ts` |


