# ADR-0033：pi SDK 从 0.87.x 对齐到 1.0.2

- 日期：2026-10-05
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §4（Agent 底层）、§8-7（SDK 快速演进风险）；`docs/02-protocol-increment.md` 协议增量；`docs/03-core-design.md`
- 关联决策：ADR-0010（上一轮 SDK 对齐的方法论与基线）、ADR-0017（SDK 类型即协议）、ADR-0030（npm 分发打包）、ADR-0032（默认模型/推理级别设置）
- 取代：AGENTS.md 的「SDK 版本锁 `0.87.x`」

## 背景

本仓自 ADR-0010 起锁 `~0.87.1`。上游 pi 于 2026-09-29 → 2026-10-04 连发
`0.99.0 → 0.99.1 → 0.99.2 → 1.0.0 → 1.0.1 → 1.0.2`（无 0.88–0.98），进入 1.0 稳定线。
本期决定跟进到 `~1.0.2`：模型目录（GPT-6.1 Sol、Claude Opus 5.5 等）与大量 provider 修复
只进新线，且 1.0 的 MCP / codemode 内置扩展是后续能力规划（见 §决策 3-B）的地基。

升级前逐符号核对了 `0.87.1` 与 `1.0.2` 的 `.d.ts`（临时安装两版 diff 得出，非道听途说）。

**不变的部分**（wire 契约零漂移，事件快照回归仍是有效护栏）：

| 类型面 | 结论 |
|---|---|
| `AgentEvent` 联合（pi-agent-core） | 10 个成员不变 |
| `AgentSessionEvent` 联合 | 16 个成员不变；`modes/json-event.d.ts`（`JsonAgentSessionEvent`，wire 透传段类型来源）**零 diff** |
| `SessionEntry` 联合 | 11 个成员不变 → protocol 的 zod schema 无需改动 |
| `SessionStats` / `ContextUsage` / `RpcSessionState` / `AgentSessionRuntime` | 一致 |
| `ExtensionUIContext` / `RpcExtensionUIRequest/Response`（ADR-0012） | 一致 |
| pi-ai 消息面 | `Usage` / `ToolCall` / `ToolResultMessage` / `AssistantMessageEvent` / `ThinkingLevel`（六值）/ `ModelCostRates` / `ThinkingLevelMap` 一致 |
| 根导出 | `VERSION` / `getAgentDir` / `resolveModelScopeWithDiagnostics` / `clampThinkingLevel` / `getSupportedThinkingLevels` / `createAgentSessionServices` / `ProjectTrustStore` 等全部仍在 |
| engines / peers | engines 仍 `node >= 22.19`；peer 依赖清空（0.87 时代 zod/ws/supports-color 的 peer 解析负担消失） |

**变化的部分**：

| 类别 | 变化 | 对本仓的影响 |
|---|---|---|
| 破坏 | `PromptOptions.preflightResult` 由 `(success: boolean) => void` 改为 `(disposition: "handled" \| "queued" \| "started") => void`，且**只在接受时回调**；拒绝 = 回调不触发（原 `false` 分支随 throw 移除） | `core/agent/agent-session-service.ts` 的 `let accepted = true; preflightResult: (ok) => { accepted = ok }` 编译不过，必须改判据（决策 2） |
| 破坏 | pi-agent-core 1.0.0 移除实验性 harness 导出（`AgentHarness` / telemetry / uuidv7 等） | 本仓未直接依赖 pi-agent-core（依赖铁律），无影响 |
| 加法 | `ToolInfo` 增必填 `exposure`（`ToolExposure`）与可选 `namespace` / `annotations` | protocol 的 `SdkToolInfo & { active }` 派生自动继承；只出现在出参，无 zod 风险 |
| 加法 | `AssistantMessage` 增可选 `thinkingLevel` | 经 `toWireAgentMessage` spread 自动流到前端，server 零改动 |
| 加法 | `tool_execution_*` 事件增可选 `parentToolCallId`（嵌套工具调用，1.0.0） | 仅加在进程内 `AgentSessionEvent` 上；`JsonAgentSessionEvent` 未收口 → wire 类型不变，运行时 `{...event}` 透传多一个前端不认识的字段，无害 |
| 加法 | `ModelRuntime` 扩容（image / classifier / virtual model、`getAuth` 参数放宽为 `AnyModel`） | 本仓只把 `ModelRuntime` 当类型用（model-scope / provider-usage / config-service），签名全是加法，无感 |
| 加法 | `SessionProjection` 形状变化（`thinkingLevel` / `model` 字段） | 本仓未采用该 API（ADR-0010 延后决策，本期维持），无感 |
| 行为 | 会话文件延迟落盘（#10000）：出现第一条 user/assistant 消息才写 `.jsonl`；纯 setup 条目（模型/思考级/system prompt）留内存 | 会话列表少幽灵文件，是改善；需真机确认 core 无「创建后立即读盘」假设（§验收 2） |
| 行为 | 内置扩展命名统一 `builtin:<name>`（mcp / codemode / tool-search / llama.cpp 成为内置扩展），取代 `<inline:name>` / `<builtin:name>` | resources 面板的 source 会出现新前缀，展示需核对（SDK 新增 `isSyntheticPath` / `getSyntheticPathSource`） |
| 行为 | bash / powershell 结构化结果上限 1 MiB，新增 `truncated` / `full_output_path` | 工具结果 details 变大，前端渲染留意 |
| 行为 | `defaultTools` 支持 `+name` / `-name` 增量语法；MCP / codemode 默认不阻塞首条 prompt | 本仓工具预设是自有概念（显式名单 + `setActiveToolsByName`），未启用 codemode 则无感 |
| 分发 | 发布包移除 `npm-shrinkwrap.json`（1.0.2）：pi 的传递依赖不再被上游锁定 | pi-coding-agent 是 pi-boat 的 runtime dependency，终端用户 `npm i -g` 时供应链浮动（见后果与对策） |
| 依赖 | 新增运行时依赖 `pi-codemode` / `pi-mcp` / `quickjs-wasi`（WASM QuickJS） | 安装体积增大；pi-boat 的 esbuild bundle 不受影响（SDK 为外部依赖） |

## 决策

**1. 升级到 `~1.0.2`**：`packages/core`、`packages/protocol`、`packages/pi-boat` 三处
`~0.87.1` → `~1.0.2`，`pnpm install` 刷 lockfile。继续用 `~`（锁 patch）而非上游的 `^`，
与全仓版本锁策略一致（AGENTS.md：升级必须单独 PR + 新 ADR + 全量回归，即本 ADR）。

**2. `preflightResult` 判据反转**：改为「回调未触发即拒绝」——

```ts
let dispatched = false;
// ...
preflightResult: () => { dispatched = true; },
// ...
if (!dispatched) throw new PromptRejectedError();
```

与 0.87.1 语义等价（原实现里 `false` 路径必伴随 throw，`accepted === false` 时
`prompt()` 从未正常 resolve），防御分支保留。

**3. 上游新能力分级采纳**：

**A. 本期搭车采纳**（契约已兼容，成本极低）：

| 能力 | 落点 |
|---|---|
| prompt disposition（`started` / `queued` / `handled`） | core `dispatchCommand` 返回 disposition → protocol 信封带回 → 前端可区分「已开跑 / 已入队」 |
| 工具 `exposure` 标注 | get_tools 出参自动携带，前端工具列表标注「仅脚本可调 / 延迟加载」等 |
| 消息级 `thinkingLevel` | wire 自动携带，前端消息徽标直接取用，server 零改动 |

**B. 延后，各自立项**（走独立 ADR / 设计，不搭本升级的车）：

- **MCP 支持**（1.0 的内置 `mcp` 扩展：`mcp.json` 全局/项目级 + OAuth + 管理面）——用户最能感知，对应 pi-boat 的资源/设置层 + 会话工具刷新
- **Codemode**（QuickJS 沙箱并行调工具）——与工具预设语义有交叉，需先设计
- **exposure / loadout 模型**（`prepareLoadout` / `ctx.executeTool`）——与工具预设互补，大 preset 可拆 exposure 而非全量声明
- **图像模型**（`ModelRuntime.generateImages()`）——models 面板展示 + 聊天内生成入口

**C. 不做**（有明确理由）：

- **Virtual models**：experimental，API 面还在动；ADR-0032 的默认模型设定无此需求
- **TUI 全屏 / 主题 / system 主题**：web 前端不涉及
- **`buildSessionProjection()`**：维持 ADR-0010 的延后决策不变（语义是「模型看到什么」，本仓历史浏览要「发生过什么」）
- **`provider_stream_event`**：调试用扩展事件，暂无对应通道；将来做 debug 面板再议

**4. wire 契约不收口 `parentToolCallId`**：`JsonAgentSessionEvent` 没有 it，protocol 按
ADR-0017 不自行发明字段；嵌套调用的可视化随 B 类（loadout 模型）再议。

**5. 分发对策（随升级落地，细则落 ADR-0030 修订）**：shrinkwrap 移除后，发布前 CI 校验
安装树（`npm ls @earendil-works/pi-coding-agent` 版本断言），必要时评估
`bundledDependencies`；不为「可能需要」预加锁定机制。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 留在 0.87.x | ❌ 放弃 | 上游修复与新模型目录只进 1.0 线；0.99 起的 MCP/codemode 地基不升级拿不到 |
| 升 `^1.0.2`（跟随 minor） | ❌ 放弃 | 与全仓「~ 锁 patch」策略冲突；1.x 的 minor 仍可能有行为变化，升级节奏应自己掌握 |
| 顺带把 MCP / codemode 一起接了 | ❌ 放弃 | 各自需要设计（管理面、预设语义交叉），混进升级 PR 会稀释回归信噪比；违背「升级必须单独 PR」 |
| wire 收口 `parentToolCallId` 并做嵌套调用 UI | ❌ 放弃 | SDK JSON 协议未收口，自行发明字段违背 ADR-0017；UI 无当下需求 |

## 后果

**正面**

- 与上游 1.0 稳定线对齐：新模型目录、provider 修复、OAuth/codemode 修正随升级带入
- wire 契约零漂移（`JsonAgentSessionEvent` 零 diff），事件快照回归基线延续，本轮升级的回归成本低
- 三个 A 类能力以近零成本提升前端信息量（运行状态、工具可见性、消息级思考级）
- peer 依赖清空，安装解析更简单

**负面 / 已知风险**

- **prompt 判据靠回调缺失表达**：「未触发 = 拒绝」依赖 SDK 行为约定而非类型约束，upgrade 时需重读该处注释
- **会话文件延迟落盘**：`new` 后未发消息即重启 → 会话消失。这是上游语义，接受；core 若存在「创建后立即读盘」假设将在验收中暴露（§验收 2）
- **shrinkwrap 移除**：终端用户安装时 pi 的传递依赖浮动，供应链面扩大（对策见决策 5）
- **安装体积**：`quickjs-wasi` 等新依赖显著增大 node_modules；pi-boat bundle 不受影响
- 真机验收项（单测盲区，列入验收尾巴）：
  1. 完整会话轮（prompt → tool call → steer → compact）SSE 事件序列与 0.87 基线对账
  2. 延迟落盘：`new` → 不发消息 → 磁盘无文件、刷新后列表无幽灵
  3. `builtin:` 前缀在资源面板的显示
