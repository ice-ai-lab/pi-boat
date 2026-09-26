# ADR-0017：SDK 类型即协议——protocol 复用 pi-ai / pi-coding-agent 类型，不重复定义

- 日期：2026-01
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §3.1 / §5.4 / §5.5；`docs/02-protocol-inventory.md` §1.3（铁律 1）；`docs/03-core-design.md` §10.1；AGENTS.md「Monorepo 结构与依赖铁律」「代码规范」
- 关联决策：**部分取代 ADR-0006**（契约层仍是独立包，但类型真相源从"手写 schema"改为"SDK 导出"）；**修订 ADR-0005**（zod 的边界从"全部 wire 类型"收缩到"HTTP 入参"）；沿用 ADR-0010（SDK 锁 0.87.x）

## 背景

本仓的定位是**给 pi 装多端外壳**（web / desktop / 未来的其他端），不是另造一个 agent。但 protocol 层的做法与这个定位相反：把 pi 已有的类型又手写了一遍。核对 0.87.1 的实际导出面后，重复清单是可量化的：

| protocol 里的手写定义 | 行数 | SDK 里已有的等价物 | SDK 是否导出 |
|---|---|---|---|
| `domain/message.ts`（内容块 / Usage / StopReason / 八角色消息 / 12 种子事件） | 210 | pi-ai `TextContent`/`ThinkingContent`/`ImageContent`/`ToolCall`/`Usage`/`StopReason`/`UserMessage`/`AssistantMessage`/`ToolResultMessage`/`SystemMessage`/`Message`/`AssistantMessageEvent`；四自定义角色在 `SessionEntry` 联合里 | ✅（`AgentMessage` 需从 `SessionMessageEntry` 提取，见下） |
| `domain/session-entry.ts`（11 个条目的 zod） | 172 | pi-coding-agent `SessionEntry` 联合——成员与本仓**完全相同**（含 `context_edit`/`label`/`usage`） | ✅ |
| `domain/tool.ts`（ToolInfo / SourceInfo / SlashCommandInfo） | 106 | pi-coding-agent 同名类型 | ✅ |
| `events/wire-agent-event.ts`（27 事件 + 12 子事件的 zod，317 行） | 317 | pi-coding-agent `JsonAgentSessionEvent`（**SDK 自家 JSON/RPC 协议的同一套投影**：剥 partial、toolcall 增量补 id/toolName） | ✅（类型导出；`toJsonEvent()` 函数未导出） |
| `domain/state.ts` / `session-info.ts` / `extension-ui.ts` | 363 | pi-coding-agent `SessionStats` / `ContextUsage` / `RpcSessionState` / `SessionInfo` / `SessionContext` / `SessionTreeNode` / `RpcExtensionUIRequest` / `RpcExtensionUIResponse` | ✅ |
| core `config-service.ts` 的 `supportedThinkingLevels()` | 14 | pi-ai `getSupportedThinkingLevels()`（本仓那份是逐行重写） | ✅ |

即 protocol 2653 行里有约 1/3 是对 SDK 的**抄写**，而抄写的代价已经真实发生：

- **已经漂移**：`session-read-service.computeStats()` 声称"对齐 SDK `getSessionStats` 口径"，但漏了 `toolResult` 的 usage、`branch_summary`/`compaction` 的 usage，`totalMessages` 也少算了 system 消息。同一会话在冷读（`GET /api/sessions/:id`）与热读（`get_session_stats` 命令）上给出不同 tokens/cost。
- **已经过时**：protocol 注释里的"对齐 SDK 0.85.1"在 SDK 升到 0.87.1 后没跟（ADR-0010 之后残留两处）。
- **上游做法相反**：参考实现设计规范直接声明 `@earendil-works/pi-ai` 依赖并调用 `getSupportedThinkingLevels()`，不重写。

同时，此前多处 `*Options` 是"以后可能需要"的期权，实际零调用方（如 `ConfigServiceOptions.agentDir`/`projectConfigDirName`、`AgentSessionServiceOptions.agentDir`/`uiTimeoutMs`、`ResourceServiceOptions.agentDir`）。

## 决策

**SDK 的公开导出就是协议的类型真相源。凡是 pi-ai / pi-coding-agent 已导出的类型与方法，protocol 与 core 一律复用（re-export / 派生 / 直接调用），不再手写第二份。**

三条配套规则：

1. **protocol 只写三类东西**
   - **HTTP 入参**：`z.object` 校验（query / body）——这是本仓自己的边界，SDK 管不到，zod 在此处**保留**（ADR-0005 的"校验只落边界"不变）
   - **PiBoat 自有概念**：资源域/文件/git/模型面板的 REST 形状、工具预设、`relation`/`projectRoot`/`revision` 等扩展字段
   - **SDK 未导出的形状**：用 SDK 已导出类型**派生**（`Extract`/`Omit`/分配律 Omit），不抄字段。目前只有四处：
     `AgentMessage`（`SessionMessageEntry['message']`）、`UsageEntry`/`LabelEntry`（按 `type` 从 `SessionEntry` 提取）、`SourceScope`/`SourceOrigin`（`SourceInfo` 的字段）、`ExtensionUiRequest`/`Response`（去掉 RPC 顶层判别字段的派生）

2. **出参不再有 zod**：响应/事件/命令结果的形状是**类型**（由 SDK 类型派生），不再维护运行时 schema。
   - 代价（明示）：SSE 逐帧与响应体的运行时校验能力随之取消。ADR-0005 计划的三条校验边界里，"REST 入参"已接线并保留；"会话文件解析""SSE 逐帧"从未接线，本次正式撤回（需要时可再从类型生成校验器，而不是手写第二份）。
   - 收益：契约与 SDK 同源，SDK 改字段是**编译错误**而不是"测试里少了一条断言"。

3. **core 能调 SDK 就调 SDK**：`supportedThinkingLevels()` 删除，改用 pi-ai 的 `getSupportedThinkingLevels()`。SDK 未导出聚合函数的少数场景（`computeStats` 对齐 `getSessionStats`、事件投影对齐未导出的 `toJsonEvent()`）继续自持，但必须在实现处写清"对照 SDK 的哪几行"，并用测试锁住口径。

依赖与打包约束（本次实测）：

- protocol 依赖 `@earendil-works/pi-ai` / `@earendil-works/pi-coding-agent`，**只用 `import type` / `export type`**：构建产物 `packages/protocol/dist/*/*.js` 里对 SDK 的引用为 0，web/desktop 的 bundle 不会被拖入 pi（保住 ADR-0006 立此包的首要动机）
- 版本锁步：三者都写 `~0.87.1`，与 pi-coding-agent 自身对 pi-ai 的 `^0.87.1` 解析到同一实例；SDK 升级须整体 bump（ADR-0010 的纪律延伸到 pi-ai）
- AGENTS.md 的依赖铁律修订为：**只有 core 与 protocol 可以依赖 pi SDK；protocol 仅限类型（`import type`/`export type`），core 才可以调用其运行时**

**零调用方的 `*Options` 一并删除**（`ConfigServiceOptions` 整个接口、`AgentSessionServiceOptions.agentDir`/`uiTimeoutMs`、`ResourceServiceOptions.agentDir`、`SessionRegistryEntryOptions.uiTimeoutMs`）：目录一律走 SDK 的 `getAgentDir()` / `CONFIG_DIR_NAME` 解析，需要时再加回。

## 理由

- **本仓是外层，不是内核**：产品目标是"把 pi 装进 web/desktop 外壳"，SDK 的形状就是产品要透出的形状；抄一遍只会制造两份可能不一致的真相
- **抄写的成本已经兑现**（见背景的三条实证）：漂移静默、注释过时、上游反向而行
- **编译错误 > 运行时断言**：类型复用后，SDK 升级带来的形状变化在 `tsc` 阶段暴露到所有消费方，比"schema 少一个字段"的静默不一致强得多
- **少即是快**：protocol 从 2653 行降到 1916 行（其中导出接口面本身在扩大：新增 getAgentDir 派生、入参校验保留），域类型 851 → 386，事件联合 317 → 112；新增 SDK 字段（如 0.86 的 `usage`/`context_edit`、0.87 的 `system`）自动跟进，不再需要"升级时核对清单"式人工同步
- **契约仍然独立**：包边界、`export *` 面、HTTP 入参校验、信封与 seq 语义都是本仓的，SDK 换不掉这些——ADR-0006 的"独立契约包"结论不变，变的是**类型真相源**

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 维持手写 schema（现状延长） | ❌ 放弃 | 已有三处实证漂移；每加一个 SDK 字段都要人工抄一遍 |
| 引入 pi-ai 但只用于 pi-ai 的类型（不动 coding-agent 部分） | ❌ 放弃 | 半途：`SessionEntry`/`ToolInfo`/`RpcCommand` 等仍要手抄，漂移面照旧 |
| 干脆让 web 端直接 import SDK 类型，废掉 protocol 包 | ❌ 放弃 | 走回 ADR-0006 已否决的路：SDK 类型会随值导入进浏览器 bundle；且 Electron/非 TS 端失去共用词汇表。protocol 作为"只出类型、不出运行时"的再导出层是更好的折中 |
| 用 zod 包一层 SDK 类型（`z.custom<T>` 全面铺开） | ⚠️ 局部使用 | 出参不做运行时校验（本次决策）；只有 REST 入参里嵌 SDK 载荷（如 `images: ImageContent[]`）时用 `z.custom<T>()` 占位 |
| 把 `computeStats` 也换成 SDK 调用 | ❌ 做不到 | SDK 未导出 `usage-totals.js`，且 `getSessionStats()` 是实例方法（冷会话没有实例）。改为"对齐 + 测试锁口径" |
| 顺手删掉 `*Options` 里的测试注入点 | ❌ 放弃 | `findSessionFile`/`openSessionManager`/`guard`/`resolver`/`sessionDir` 都有真实调用方（避开真实文件系统与 git 子进程）；只删零调用方的那些 |

## 后果

**正面**

- 协议与 SDK 同源：SDK 升级的形状变化变成编译错误，覆盖 core/server/client/ui 全部消费方
- protocol 少约 850 行手写定义与 107 个 schema 中的出参部分；core 少一处算法重写
- 修掉一处真实口径漂移（`computeStats` 与 `getSessionStats` 现在一致，并有测试锁定）
- web/desktop bundle 仍不含 pi：protocol dist 的运行时产物对 SDK 零引用（已实测）

**负面 / 已知风险**

- **失去 SSE 逐帧与响应体的运行时校验**（ADR-0005 计划中的两条边界撤回）：客户端拿到形状不对的帧不会当场发现，只会在渲染时表现为怪现象。缓解：入参校验仍在；事件形状由类型 + 投影测试锁定
- **wire 契约与 SDK 耦合**：SDK 破坏性改名会波及所有端（含未来非 TS 端）。缓解：单一仓库、版本锁步、升级走 ADR-0010 的单独 PR + 全量回归；`PROTOCOL_VERSION` 的审计作用不变
- 少量类型需要"派生技巧"（`Extract`/分配律 `Omit`）才能表达 SDK 未单独导出的成员，注释必须写清来由，否则读代码的人会以为可以手写一份
- **OpenAPI / 移动端代码生成路线（ADR-0005 的理由之一）受影响**：那条路原本以"schema 覆盖全部 wire 类型"为前提，出参 schema 取消后需改从类型生成（`docs/01 §5.5` 已同步注明）。一期无消费方，不影响当前里程碑，但它是一项真实的技术债
- 多两个直接依赖（pi-ai、pi-coding-agent 进 protocol）：pnpm 下与 core 共享同一实例，但升级时须三者同步，`.pnpm` 里若出现两份 pi-ai 实例即视为 bug

## 重审触发条件

这份决策把"防腐层"换成了"直连 SDK"，代价集中在**对外契约的稳定性**上。出现下列任一情况必须重审（不是"可以重审"）：

| 触发条件 | 为什么它推翻了前提 | 届时该做什么 |
|---|---|---|
| `.pnpm` 里出现**两份** pi-ai / pi-ai 版本实例 | 类型与运行时可能来自不同副本，"编译期一致"这个唯一保障失效（Electron 打包场景最先中招） | 立刻用 `pnpm.overrides` 钉成一份，并把 SDK 升级纪律写进门禁（CI 断言单实例） |
| 出现**第一个非 TS 客户端**，或任何**独立于本仓发布**的端（移动 / 插件 / 第三方） | 出参没有运行时 schema ⇒ 无法为外部面提供可校验的冻结契约；`zod-openapi` 路线已失效 | 给**外部面**重新引入可校验的契约（从类型生成 JSON Schema/zod），protocol 拆成"内用类型"与"对外契约"两层 |
| SDK **破坏性升级**，且此时存在**存量桌面产物**（旧 protocol/旧 SDK 与新版 server 通话） | 逐帧 parse 的运行时校验已取消，版本错位不再当场暴露，只表现为渲染异常 | 先补 `PROTOCOL_VERSION` 的**真实握手**（建流/启动时校验并明确报错），再升 SDK |
| 我们需要 wire 形状与 SDK 形状**系统性**分叉（为体积或兼容裁剪字段、改名，而不是偶尔一处 `Omit`） | 派生层会累积成第三份真相，"不手写第二份"的收益反转为成本 | 在 protocol 里显式引入"契约层"（冻结的手写/schema 定义）+ 转换函数，并把分歧登记在此 ADR 的后续条目里 |

反过来说，只要这三条前提持续成立——**端都在本仓、SDK 升级不攒版本、我们坚持薄外壳**——本决策就是便宜的：SDK 变动是编译错误而不是静默漂移。

## 验证记录

```bash
# 2026-01 · 落地后核查
pnpm turbo run build test lint → 全绿（protocol 31 / core 183 / server 64；15 tasks）
git diff --stat → 35 files, +703 / -1403（净减 700 行）

# 2026-01 · 收尾（同一条决策的第二阶段：把出参 zod 清完 + 清死码）
protocol 1916 → 1625 行、导出名 331 → 195；剩下的 44 个 schema 常量全部是**入参**
（server 的 safeParse，或作为入参 schema 的构建块被内部引用）——出参 zod 归零
删除清单（全部零消费方，含协议内/协议测试）：
  · 出参 schema → 纯类型：rest/{files,git,models,sessions,projects,resources,agent,misc} 共 40 个
  · 连同成为孤儿的嵌套 schema 与枚举常量（FILE_REQUEST_TYPES / GIT_FILE_STATUS_KINDS /
    MODELS_ENABLED_SCOPES 等 12 个）
  · 死码：commandOkSchema / CommandErrorSchema / ErrorCodeSchema / toolPresetFromToolNames
    / CONCRETE_TOOL_PRESETS / BUILTIN_TOOL_NAMES（预设反推无任何实现与文档要求）
  · 纯冗余别名：ResumeSessionOk / ContextMessage / TokenSummary
  · SessionStateResponseSchema（AgentRunningStateSchema 的第二处同名定义）
  · 第三阶段（review 后）：零消费者的「我们的」声明 53 个（导出名 248 → 195）——
    响应类型 19、入参与查询类型别名 30、词汇表别名 4（NotifyType / MessageContent /
    ExtensionUiBlockingMethod / EXTENSION_UI_BLOCKING_METHODS）
    ⚠️ 入参 schema 全部保留（server 仍用 safeParse），删的只是与它们配对的类型别名
    ⚠️ 两类**有意保留**的零引用导出（判据：成本 0 且消费者已确定）
      ① 同名常量被同一行的 schema 引用（THINKING_LEVELS、TOOL_PRESETS、WIRE_AGENT_EVENT_TYPES 等 12 个）
      ② SDK 实体名（消息角色 / 会话条目类型，含 SDK 未导出的 4 个自定义消息与 LabelEntry/UsageEntry）——
         它们是客户端渲染转录时按 role/type 收窄的唯一命名入口，SDK 改字段时它们自动跟随

# 1) 浏览器安全：protocol 运行时产物不得引用 SDK（只有 .d.ts 引用）
grep -rn "@earendil-works" packages/protocol/dist --include=*.js   → 0 处
grep -rl  "@earendil-works" packages/protocol/dist                 → 仅 *.d.ts

# 2) 依赖解析：pi-ai 单实例
ls packages/protocol/node_modules/@earendil-works packages/core/node_modules/@earendil-works
  → protocol: pi-ai 0.87.1 + pi-coding-agent 0.87.1；core: 同两个

# 3) 派生的等价性（此前手写 → 现在 SDK）
node /tmp/sdk-export-scan.mjs TextContent Usage Message ToolInfo SessionEntry SessionStats \
  RpcCommand RpcSessionState RpcExtensionUIRequest JsonAgentSessionEvent → 全部 ✅

# 4) 口径对齐：computeStats vs SDK getSessionStats
core/test/session-read-service.test.ts「与 SDK 口径一致」用例
  → 摘要 usage + toolResult usage + totalMessages（含 system）三项锁定

# 5) 模型面板主路径（本轮新增首个 ConfigService 测试）
core/test/config-service.test.ts（PI_CODING_AGENT_DIR 指向临时目录，离线）
  → models() 的 thinkingLevels 词汇表 = protocol THINKING_LEVELS；models.json 路径来自 getAgentDir()
```
