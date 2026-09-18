# PiBoat —— 协议层清单（protocol 包实施依据）

> 版本：v0.1 · 状态：待评审 · 依据：对标 `@agegr/pi-web@0.9.x` 全量 API 面（46 个 REST 路由 + 2 条 SSE 流 + 31 个 RPC 命令），结合概要设计 `docs/01-overview.md` §3.1/§5.4/§10 整理
> 用途：`packages/protocol` 的实施清单。每个条目标注 pi-web 源文件，形状以 pi-web 实战检验为准，命名与结构按 PiBoat 规范收敛

---

## 1. 定位与总原则

### 1.1 protocol-first，但按里程碑切片

- **protocol 优先是对的**：它是零依赖叶子包，core/server/client/ui 全部依赖它，先定它则各包可并行开工；且 pi-web 已有实战检验过的 API 形状，照抄形状比发明便宜
- **但"先定义" ≠ "先全量定义"**：一次定完全部协议会推迟首个可运行功能 1~2 周。每个里程碑开工的第一件事是定该里程碑的 schema（切片见 §11）
- 本文档是**全量清单**（对标 pi-web 功能全集），各里程碑从中取子集

### 1.2 量级总览

| 类别 | 数量 | pi-web 对应物 |
|---|---|---|
| REST 路由 | 46 | `app/api/**/route.ts` |
| SSE 事件流 | 2（agent 事件 + 终端输出） | `agent/[id]/events`、`terminal/[id]/events` |
| RPC 命令 | 31 | `lib/rpc-manager.ts` 的命令 switch |
| 领域类型 | ~40 个 | `lib/types.ts`、`lib/pi-types.ts`、`lib/git-types.ts`、`lib/api-types.ts` |
| 事件 wire 类型 | ~20 种 | `lib/agent-event-wire.ts` + SDK `JsonAgentSessionEvent` |

### 1.3 铁律（源自 AGENTS.md / 概要设计，本文档所有条目受其约束）

1. 纯类型 + Zod schema，**零业务逻辑、零运行时依赖**（zod 除外）
2. wire 类型（`ClientAgentEvent`）只在 protocol 定义；SDK 事件→wire 的投影函数 `toClientAgentEvent()` 在 **core**（SDK 字段变动不许泄漏出 core）
3. toolCall 双字段归一化 `normalizeToolCalls()` 收敛在 **protocol**（文件加载与流式两条路径共用）
4. 每个领域类型同时给 TS type 与 Zod schema（服务端入参校验 + 将来 zod-openapi 导出移动端客户端，见概要设计 §5.5）
5. REST 路由形状一旦定稿即是对前端的承诺，变更需 bump `PROTOCOL_VERSION`

---

## 2. ① 基础约定（constants / envelope / errors）

| 条目 | 内容 | pi-web 来源 | 备注 |
|---|---|---|---|
| `PROTOCOL_VERSION` | 协议版本号 | —（PiBoat 新增） | 已在 M0 骨架落地 |
| `PORTS` | `{ server: 9527, web: 9528 }` | —（PiBoat 新增） | 端口单一来源，已落地 |
| 命令响应信封 | `{ success: true, data: T } \| { error: string, code?, accepted? }` | `lib/agent-client.ts` | agent 命令类路由统一信封 |
| 错误码枚举 | `prompt_rejected`（+ `accepted: false`）等 | `agent/new`、`agent/[id]` 路由 | 区分"输入被拒"与"运行失败"；集中定义避免字符串散落 |
| SSE 元约定 | 心跳 30s（注释帧 `:\n\n`）；断线重连 `Last-Event-ID` | `lib/agent-event-stream.ts` | pi-web 终端流已有 offset 游标重放；**agent 事件流 pi-web 无 seq 重放**（断线只能整体刷新），PiBoat 新增每会话单调递增 `seq`（去重 + 差量重放，概要设计 §5.4）——必须定义进 wire 类型 |
| SSE 票据 | 一次性 query 票据（EventSource 无法带 header） | —（PiBoat 新增，概要设计 §5.6） | 与 token 鉴权配套 |

---

## 3. ② 领域类型（domain）—— protocol 最大的一块资产

对应 pi-web `lib/types.ts` + `lib/pi-types.ts`，近乎整包移植。**惰性资产，建议 M1 一次定完**（后续里程碑直接复用）。

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

- `AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | CustomMessage | BashExecutionMessage`（后者含 `command/output/exitCode/cancelled/truncated/fullOutputPath`）
- 内容块：`TextContent | ImageContent | ThinkingContent | ToolCallContent`
  - `ThinkingContent.deferred`：历史 thinking 只存短预览，全文按需加载（配套 §6.3 惰性端点）
  - `ToolCallContent.rawInput`：流式工具入参的客户端缓冲，**永不落盘**
- `AgentUsage`：input/output/cacheRead/cacheWrite token 数 + cost 四项分解 + total
- `ContextUsage`：`percent | null`、`contextWindow`、`tokens | null`

### 3.3 会话列表项与树

| 类型 | 要点 |
|---|---|
| `SessionInfo` | `path/id/cwd/name/created/modified/messageCount/firstMessage/parentSessionId`；`relation: {kind:"fork", originSessionId?} \| {kind:"subagent", parentSessionId, profile, description, status}`（fork 仍为顶层，仅 subagent 形成父子树）；`projectRoot/projectKey`（项目分组键，Windows 大小写/分隔符不敏感）；`branch/isWorktree`；`transient`（内存会话未落盘） |
| `SubagentSessionStatus` | `starting/queued/running/completed/failed/aborted/interrupted` |
| `SessionTreeNode` | `entry/children/label?/compressedEntryIds?/branchPreview?` |
| `SessionContext` | `messages[] + entryIds[]`（平行数组）、`oldestEntryId/hasMore`（向上分页）、`thinkingLevel`、`model` |

### 3.4 状态与统计

| 类型 | 要点 |
|---|---|
| `AgentState`（`get_state` 返回） | `sessionId/sessionFile/isStreaming/isPromptRunning/isBashRunning/isCompacting/autoCompactionEnabled/autoRetryEnabled/model/messageCount/pendingMessageCount/queuedMessages{steering,followUp}/contextUsage/systemPrompt/thinkingLevel/extensionStatuses/extensionWidgets` |
| `SessionStatsInfo` | userMessages/assistantMessages/toolCalls/toolResults/tokens/cost/contextUsage/totalActiveMs |
| `ToolInfo` | `name/description/parameters/promptGuidelines/sourceInfo` + `active`（get_tools 时叠加） |
| `SlashCommandInfo` | `name/description/source("prompt"|"skill"|"extension")/sourceInfo`（斜杠命令面板） |

### 3.5 扩展 UI 协议

- `ExtensionUiRequest`（9 种 method）：`select / confirm / input / editor / notify / setStatus / setWidget / setTitle / custom`，阻塞型（select/confirm/input/editor/custom）带 `id/timeout/expiresAt`
- `ExtensionUiResponse`：`{id, value} | {id, confirmed} | {id, cancelled:true}`
- `ExtensionStatusItem / ExtensionWidgetItem`
- ⚠️ 最容易被漏掉的协议成员；扩展交互经命令通道（`extension_ui_response/input`）与事件通道（`extension_ui_request`）双向完成

### 3.6 归一化函数（protocol 内唯一允许的"逻辑"）

- `normalizeToolCalls()`：文件存储 `{id, name, arguments}` vs SDK `{toolCallId, toolName, input}` 双字段体系收敛（概要设计 §8-3；文件加载与流式两条路径共用）

---

## 4. ③ Agent 命令通道（commands）

`POST /api/agent/:id` 请求体判别联合（31 命令，pi-web `lib/rpc-manager.ts` switch 完整提取）：

| 分组 | 命令（参数 → 返回） |
|---|---|
| 对话 | `prompt {message, images?, streamingBehavior?}` → null；`steer / follow_up {message, images?}`；`abort`；`clear_queue` → `{steering[], followUp[]}` |
| 状态 | `get_state` → AgentState；`get_session_stats` → SessionStatsInfo；`get_last_assistant_text` → `{text}` |
| 模型/思考 | `set_model {provider, modelId}` → `{id, provider}`；`set_thinking_level {level}` |
| 压缩 | `compact {customInstructions?}`；`abort_compaction`；`set_auto_compaction {enabled}`；`set_auto_retry {enabled}` |
| 分支 | `fork {entryId}` → `{cancelled, newSessionId}`（**破坏性原地替换**，见概要设计 §8-1）；`fork_branch {entryId}` → 新会话不改当前；`clone {leafId?}`；`navigate_tree {targetId}` → `{cancelled, editorText?}` |
| 工具 | `get_tools` → ToolInfo[]（含 active）；`set_tools {toolNames}` |
| 命令面板 | `get_commands` → `{commands: SlashCommandInfo[]}` |
| 会话管理 | `set_session_name {name}`；`reload`；`custom_message {customType, content, display, details?, triggerTurn?, deliverAs?}`；`ensure_session` |
| Shell | `bash {command, excludeFromContext?}` → `{output, exitCode?, cancelled?, truncated?, fullOutputPath?}`；`abort_bash` |
| 扩展 UI | `extension_ui_response`；`extension_ui_input {id, data}` |

### 4.1 新建会话

`POST /api/agent/new`，body：`{ cwd, type?, message?, images?, provider?, modelId?, toolNames?, thinkingLevel? }`
→ `{ success, sessionId, data, model: {provider, modelId} | null, thinkingLevel }`
（provider 与 modelId 必须成对；thinkingLevel 枚举 `off/minimal/low/medium/high/xhigh/max`）

---

## 5. ④ Agent 事件通道（events，SSE wire）

### 5.1 wire 类型 `ClientAgentEvent`

**投影规则**（pi-web `lib/agent-event-wire.ts`，固化进 schema 文档）：

- 剔除 `turn_start / turn_end`
- `toolcall_start / toolcall_delta` 补齐 `id / toolName`（从 `partial.content[contentIndex]` 提取，双字段容错）
- 剥离 `partial`（完整消息只经快照/历史下发）

**事件清单**：

| 来源 | 事件 |
|---|---|
| SDK 透传（投影后） | `message_start`、`message_update`（assistantMessageEvent: `text_delta / thinking_delta / toolcall_start / toolcall_delta / …`）、`message_end`、`tool_execution_start / update / end`、`agent_end`、`notice`、`error` |
| **PiBoat 服务层自加**（pi-web 已实践，SDK 没有，必须定义） | `connected {sessionId, isStreaming}`、`startup_error {errorMessage}`、`prompt_done`、`prompt_error {errorMessage}`、`session_shutdown {reason}`、`extension_ui_request`、`extension_error` |
| PiBoat 新增 | 每事件附 `seq`（会话级单调递增；快照携带 `lastSeq`，客户端丢弃 `seq ≤ lastSeq`） |

### 5.2 接入时序（late join）

`connected` → 快照 `message_start`（进行中的半截消息）→ 增量续播。快照与订阅间隙的少量事件靠 `seq` 去重（概要设计 §5.4 时序 ①②③④）。

### 5.3 终端事件流 `TerminalEvent`

- `output {data, offset}`（offset 做 `Last-Event-ID`/`?after=` 游标重放）、`exit {exitCode}`、`closed`
- 心跳 30s；exit/closed 后关流

---

## 6. ⑤ REST 资源类型（rest，按功能域 9 组）

### 6.1 会话列表

| 端点 | 形状 |
|---|---|
| `GET /api/sessions?force=1` | → `{ sessions: SessionInfo[], sessionListVersion, runningSessionIds[], completionNotificationSuppressedSessionIds[] }`（磁盘扫描与运行时注册表合并） |
| `GET /api/agent/running` | 轻量轮询（可见 Tab 池）：`{ sessionListVersion, runningSessionIds, 通知抑制ids }` |
| `GET /api/sessions/search?q` | → 搜索结果（q ≤ 200 字符） |

### 6.2 会话详情与生命周期

| 端点 | 形状 |
|---|---|
| `GET /api/sessions/:id` | → `{ sessionId, filePath, info, leafId, tree, context, stats, totalActiveMs, toolNames? }`（tail 默认 50，上限 1000） |
| `PATCH /api/sessions/:id` | `{name}` 改名（历史未运行会话直接追加 session_info 行） |
| `DELETE /api/sessions/:id` | 删除（**级联删除全部 subagent 子会话**，返回受影响 id） |
| `GET /api/sessions/:id/export` | → HTML 导出（attachment/inline） |
| `POST /api/sessions/:id/auto-name` | → `{title, usage}`（LLM 生成会话名） |

### 6.3 历史分页与惰性加载

| 端点 | 形状 |
|---|---|
| `GET /api/sessions/:id/context?leafId&before&tail≤1000&deferThinking&deferMedia` | → `SessionContext`；`before` = 客户端已有最老条目（excludeLeaf 向上翻页）；`defer*` = thinking/工具结果图片以占位符下发 |
| `GET /api/sessions/:id/entries/:entryId/thinking?blockIndex` | → `{thinking}`（全量推理文本） |
| `GET /api/sessions/:id/entries/:entryId/tool-result-image?blockIndex` | → 二进制图片 |
| `GET /api/agent/:id/bash-output?path&download=1` | → bash 超长输出临时文件（内联有大小上限；download 流式） |

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
| `GET /api/auth/login/:provider` | **SSE**：OAuth 流（`url` 事件给跳转地址 + 等待码回填） |
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
| `GET /api/files/*?type=` | `list / read / download / meta / preview / watch` 五种请求类型（见 pi-web `files/[...path]/route.ts`；忽略 node_modules/.git 等目录） |
| `POST /api/files/*` | multipart 上传：单文件 ≤ 25MB、总量 ≤ 100MB、文件名校验、冲突策略参数 |
| `GET /api/file-index?cwd&q` | → 模糊搜索索引（无 q 时全量索引 ≤ 5000 条；git 仓库走 tracked 文件，硬上限 20 万） |

### 6.7 Git

| 端点 | 形状 |
|---|---|
| `GET /api/git/status?cwd` | → `{isGitRepository, repositoryRoot, files: GitFileStatus[], additions, deletions}`；`GitFileStatusKind: modified/added/deleted/renamed/untracked/conflict` |
| `GET /api/git/diff?cwd&path` | → `{supported, status?, patch?}`（单文件 unified diff） |
| `GET /api/worktrees?cwd` | → `{projectRoot, projectKey, isGit, isTopLevel, currentWorktreePath, worktrees[]}` |
| `POST /api/worktrees` | `{cwd, branch}` → `{path, branch}` |
| `DELETE /api/worktrees` | `{cwd, path, force?}` |

### 6.8 终端（PTY）

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
| `GET/POST /api/subagents/:id` | 子代理运行详情 / abort |

---

## 7. ⑥ 辅助通道

| 端点 | 形状 | 备注 |
|---|---|---|
| `POST /api/agent/:id/lease` | → `{success, renewed}` | SSE 观看期间续 liveness lease，推迟 idle 回收（概要设计 §5.4 已纳入设计） |
| `GET /api/push/config` | → `{publicKey}` | VAPID 公钥（私钥不出服务端） |
| `POST /api/push/subscribe` | `{subscription{endpoint,keys{p256dh,auth}}, locale}` | 按 endpoint upsert |
| `GET /api/health` | → `{ok, name}` | M0 已落地 |
| 鉴权 bootstrap | token 经同源接口下发（跨源页面不可读） | **PiBoat 重新定义**：随机 token + Origin/Host 校验 + SSE 一次性票据（概要设计 §5.6）；不照抄 pi-web 的密码 + cookie 模型（`web-auth` 路由 + 限流）。若将来开 LAN 再评估密码模型 |
| 应用更新检查 | —（裁剪） | pi-web 查 npm registry（`GET /api/app-update`）；PiBoat 发布通道未定，暂不纳入协议 |

---

## 8. 不进 protocol 的内容（明确划出）

以下为实现细节，归各包自行消化，**禁止**泄漏进 protocol：

- ANSI 清洗/渲染、MIME 与文件类型判断、预览字节数上限（`lib/ansi.ts`、`file-types.ts`、`text-preview.ts`）
- markdown/mermaid/katex 渲染配置（前端 ui 层）
- 各类缓存策略（models-cache、session-list 缓存、catalog 缓存）
- allowed-roots 判定逻辑本身（protocol 只定义"403 Access denied"错误形状；判定归 server/core）
- 前端布局/草稿/主题/i18n 状态（`panel-layout`、`draft-store`、theme）
- idle 回收计时、启动去重锁（core 内部机制，对协议只体现为会话存在性）

---

## 9. 与 pi-web 的差异决策点（已定）

| # | 差异 | 决策 |
|---|---|---|
| 1 | agent 事件流无 seq 重放（pi-web 断线靠整体刷新） | PiBoat wire 事件附 `seq` + `Last-Event-ID` 差量重放（概要设计 §5.4） |
| 2 | 命令信封 `{success, data}` 内联在 route | 收敛为 protocol 的泛型信封类型 + 每命令返回类型 |
| 3 | pi-web 无独立协议包，形状散在 46 个 route + lib | PiBoat 全量收敛进 `@ice-ai/protocol`，server 路由即协议实现层 |
| 4 | 密码登录（web-auth + cookie + 限流） | 纯本地定位改为随机 token + 同源 bootstrap + SSE 票据（§5.6）；LAN 场景另议 |
| 5 | `app-update` 查 npm | 裁剪（PiBoat 发布通道未定） |
| 6 | 路径风格 `/api/agent/new`、`/api/sessions/:id/...` | 沿用 pi-web 路径（降低迁移与对照成本）；仅鉴权相关端点不同 |

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
│   ├── extension-ui.ts     # ExtensionUiRequest / Response / Status / Widget
│   └── normalize.ts        # normalizeToolCalls()
├── commands/           # ③命令通道
│   └── agent-command.ts    # AgentCommand 联合 + NewSessionRequest/Response + 各命令返回类型
├── events/             # ④事件通道
│   ├── client-agent-event.ts  # ClientAgentEvent + seq 语义
│   └── terminal-event.ts      # TerminalEvent
└── rest/               # ⑤⑥REST 资源（按域一文件：类型 + 路径常量 + Zod）
    ├── sessions.ts         # 列表/详情/分页/惰性加载/搜索/导出/auto-name
    ├── models.ts           # models / models-config / discover / test / catalog
    ├── auth.ts             # providers / login(SSE) / api-key / logout / provider-usage
    ├── files.ts            # home / default-cwd / cwd browse+validate / files / file-index
    ├── git.ts              # status / diff / worktrees
    ├── terminal.ts         # PTY CRUD
    ├── resources.ts        # skills / plugins / subagents / tools-settings / project-trust
    └── misc.ts             # health / lease / push
```

## 11. 里程碑切片（从本清单取子集）

| 里程碑 | 取自本清单 | 验收对应 |
|---|---|---|
| **M1 对话 MVP** | §2 全部 + §3 领域类型全量 + §4 命令子集（prompt/steer/followUp/abort/get_state/get_commands/get_tools/set_tools/get_last_assistant_text）+ 新建会话 + §5 事件全量 + §6.1/6.2/6.3（列表/详情/分页）+ health | 浏览器完成一轮带工具调用的编程任务 |
| **M2 会话与模型** | §4 剩余命令（分支组/压缩组/set_model/set_thinking_level/set_session_name/reload/custom_message）+ §6.4 模型 + §6.5 认证 | 日常可替代 TUI |
| **M3 完整体验** | §6.6 文件 + §6.7 git + §6.8 终端 + §6.9 资源 + §7 辅助（lease/push） | 功能对齐 pi-web |
| **M4 桌面端** | 无新增（Electron 复用同一协议） | — |

## 12. pi-web 源文件映射（形状挖掘索引）

| PiBoat 域 | pi-web 源（相对 `pi-web/`） |
|---|---|
| 领域类型 | `lib/types.ts`、`lib/pi-types.ts` |
| 命令分发（31 命令权威来源） | `lib/rpc-manager.ts`（`send()` 的 switch） |
| 事件投影规则 | `lib/agent-event-wire.ts`（`toClientAgentEvent`） |
| SSE 流时序（connected/快照/心跳） | `lib/agent-event-stream.ts` |
| 新建会话 / 命令路由 | `app/api/agent/new/route.ts`、`app/api/agent/[id]/route.ts` |
| 会话列表/详情/分页 | `app/api/sessions/**`、`lib/session-reader.ts`、`lib/chat-lazy-load.ts` |
| 模型 | `app/api/models*/**`、`lib/models-cache.ts`、`lib/model-catalog.ts` |
| 认证 | `app/api/auth/**`、`lib/provider-listing.ts`、`lib/provider-credential-store.ts` |
| 文件 | `app/api/files/[...path]/route.ts`、`app/api/file-index/route.ts`、`lib/file-*.ts` |
| Git/worktree | `lib/git-types.ts`、`lib/git-changes.ts`、`lib/worktree.ts` |
| 终端 | `app/api/terminal/**`、`lib/terminal-manager.ts` |
| skills/plugins/subagents | `lib/skills-service.ts`、`lib/skill-*.ts`、`app/api/plugins/**`、`lib/subagents.ts` |
| 客户端命令封装（信封语义） | `lib/agent-client.ts` |

---

*本文档随协议定稿演进：形状定稿一项勾一项；与代码不一致时以代码为准并当天更新本文档（AGENTS.md）。*
