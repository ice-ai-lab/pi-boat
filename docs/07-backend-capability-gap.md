# PiBoat —— 一期后端能力全集与缺口清单

> **本文档的三重身份**（读前先分清，否则会把历史记录当成待办）：
> 1. **能力面基线**（§3）：一期要对齐的端点/命令/事件全集，仍是新工作时的对照表
> 2. **历史审查记录**（§1/§2/§6）：2026-01 的审查结论与 2026-02 的分批补齐过程（G2 表 13 项中 11 项已落地、1 项已撤销〔G2-10，ADR-0015〕，余 G2-11 启动偏好落盘）
> 3. **现役边界清单**（§7/§8/§9）：已知坑、**有意不做/延后**的项、实现期有意留下的边界
>
> 状态：**一期后端已全部交付**（B0–B7，2026-02）· 审查日期：2026-01
> 审查基线：一期要求后端能力面覆盖既有 Web 实现的全部后端能力（基线快照：55 个路由文件 / 78 个 handler / 27 条 RPC 命令 / SDK `0.87.1`），**扣除 §8 的排除项**
> 本仓现状（2026-02，端点/服务数按 2026-09-25 ADR-0016 删除推送后刷新）：**55 个端点 / 24 条命令 / 27 类 wire 事件 / 8 个 core 服务**；前端（client / ui / web）未开工
> 用途：① 历史：记录“为何要补、补了什么”；② 现役：§7/§8/§9 是后续开工前的对照与防反复重建。
> **🔴 未定案条目不得开工**（§2/§3 中残留的 🔴 已在本轮全部转化为 ✅ 或移入 §8/§9）。

---

## 1. 结论摘要（审查时 / 现况）

| 维度 | 一期目标 | 审查时（2026-01） | 现况（2026-02） |
|---|---|---|---|
| 路由/handler | ≈55 个（78 − §8 排除/延后的 23） | 15 个端点 | ✅ **55 个端点**（§6 批次 B3–B7 完成后于 2026-09-25 删除 `/api/push/*`） |
| Agent 命令 | 25 条（27 − Shell 直连组 2） | 11 条（M1 子集） | ✅ **24 条**（Shell 直连组按 §8-3 排除；`extension_ui_input` 不存在，见 §3.1） |
| SSE 事件 | 24 种 + 3 条投影过滤 | 24 种 + 3 条投影过滤 | ✅ **27 种顶层类型**（含 ADR-0012 的扩展 UI 两事件 + `session_replaced`） |
| SDK | `0.87.1` | `~0.87.1` | ✅ 已对齐（ADR-0010，B1 已完成） |
| 核心服务 | 一组专用服务 + 领域模块 | 3 个服务（agent / read / project） | ✅ **8 个服务**（+ Config / System / Resource / Liveness / ExtensionUiBridge） |

**一期排除 / 延后**（用户 2026-01 / 2026-09 定案，详见 §8）：**鉴权（本机访问控制 / LAN）**、**登录（provider OAuth/API Key 入口）**、**终端（PTY，含 Shell 直连与 `bash-output`）**、**后台推送（Web Push，含订阅与投递侧）**、**内建子代理运行时（延后，可由 pi 扩展提供）**。
五者均**不在一期实现**，且在 `docs/01` 里的残留描述已同步清除（延后项见 §8-4）。

**五类标记**（全文统一；§2/§3 的旧标记已按现况刷新，历史结论见每行括注）：

- ✅ **已实现**：已落地并有测试覆盖，前端可直接消费
- 🟡 **已登记待开工**：`docs/02` 已有形状，但本期**有意未做**（如列表分页等触发条件驱动的项）
- ⏸ **延后**：能力面需要但本期不做（§8-4 子代理等），将来以增量方式引入
- ⛔ **排除/不做**：一期不做或已有决策，见 §8
- ⛔ **有意留下的边界**：实现期发现、明确不做的细节，见 §9

> ⚠️ `docs/02 §1.2` 的“49 路由 / 52 端点”已过期，已在本轮刷新为 55 个端点（同步完成，重基线完毕）。

---

## 2. 全局性议题（G1 已完成 / G2 已落地，仅 G2-11 仍为缺口）

### G1. SDK 版本对齐 `0.87.x` ✅ 已完成（ADR-0010）

**已完成（2026-01，ADR-0010）**。落地的三处语义缺口：wire 投影丢弃转录 system 消息（含 `agent_end.messages`）；历史 `context.messages` 同口径跳过（`entryIds` 同步）；`computeStats` 计入 `usage` 条目。protocol 补 `SystemMessage` + `UsageEntry` + `ContextEditEntry`（tree 会下发原始条目，schema 不认识就会整响应校验失败）。
**遗留真机验证项**（单测覆盖不到，见 ADR-0010「后果」）：真实会话流里 system 过滤与历史/实时形状一致。（原「系统提示词面板显示的仍是实际下发的 prompt 吗」**已作废**——本仓不做精确覆写，ADR-0015）

### G2. 审查时“文档未登记”的核心运行时能力 ✅ 除 G2-11 外全部落地

以下不是端点，但都是后端主体；审查时 `docs/02`/`docs/03` 完全没写，现已实现且有测试（唯一例外是 G2-11）：

| # | 能力 | 落地时的关键细节（防重复踩坑） | 落点 |
|---|---|---|---|
| G2-2 | **模型可见范围（enabledModels）** | glob/fuzzy/`:thinkingLevel` 后缀语法、最小编辑（不整表重写）、`provider/*` vs `provider/**` 的 minimatch 陷阱、项目 `.pi/settings.json` shadow 只读、`prune` / `resync` 两种修复操作、禁用最后一个模型返回 409 | `core/src/config/model-scope.ts` + `config-service.ts`（ADR-0011） |
| G2-3 | **模型目录刷新** | 远端 catalog overlay 落 `~/.pi/agent/models-store.json`、常规读取走离线态（不联网）、只有用户显式点按钮才联网、按 provider 合并并发刷新、变更检测比 id/name 不比字节 | `core/src/config/config-service.ts` + `models-config-store.ts` |
| G2-4 | **扩展 UI 通道本体** | 按 SDK RPC 面实现 **9 个 method**（无 `custom`）；硬件级细节：**阻塞型请求的默认超时**（SDK 不兜）、会话终止时未决请求结清、widgets/status 按 key 的**代际管理与 reload 清理** | `core/src/agent/extension-ui-bridge.ts`（ADR-0012） |
| G2-5 | **会话文件外部写入检测** | 终端 pi CLI 与 server 同时写同一 `.jsonl` 时，内存 runtime 会读到旧索引；**仅在全量读（挂载 / `force=1`）时**探测磁盘并重建 runtime（回 `wrapperRebuilt`），run 期间不检测；不用文件锁（锁解决不了内存索引与磁盘内容的一致性） | `agent-session-service` + `server/src/routes/sessions.ts`（ADR-0013b） |
| G2-6 | **会话视图缓存 + revision** | 客户端靠不透明 `revision`（size+mtime，**无单调性**）决定历史窗口能否复用 | `GET /api/sessions/:id/revision` + `readService.revision()` |
| G2-7 | **会话内容搜索** | 先轻量字段（名字/首条消息）筛，再对**有界候选**扫正文（候选数与单文件字节数均封顶），否则几万会话全读 | `SessionReadService.search()` + `fileContains()` |
| G2-8 | **列表 `summary=1` 快路径** | 侧栏先画壳不等全量解析 | `SessionListQuerySchema.summary` + `list({summary:true})` |
| G2-9 | **工具预设持久化 + 纯聊天边界** | 预设归 core 解析（`default` 集只有 core 知道）；选择**持久化到会话内 custom 条目**；纯聊天（chat-only）不加载扩展/技能/prompt，跨越该边界**重建 runtime** | `core/src/agent/session-tool-selection.ts` + `set_tools {preset}` |
| G2-10 | **精确系统提示词覆写**（已撤销） | 原为内联 extension 的 `before_agent_start` 返回 `{systemPrompt}`。**2026-09-24 撤销：删除该扩展**——pi 默认就会把上下文文件放进 `<project_context>`（与工具集无关），扩展只买到「剥掉包装」；且上游方案的另两个部件（占位符 override、状态读取优先 exact）未移植，留着只会造成面板内容随时机变化（ADR-0015） | 已删除（原 `core/src/agent/exact-system-prompt.ts`） |
| G2-11 | **启动偏好持久化** | ⚠️ 缺口仍实存（与 §9 旧结论相反，本轮审查发现）：新建会话/`set_model` 的显式选择只作用于会话（链内 `model_change` 条目），**不落 settings.json 的 `defaultModel`**（SDK 的 `setModel` 只在 `persist:true` 时写，本仓未传）。要落盘需 core 显式调 `settingsManager.setDefaultModelAndProvider()` 或在命令里加 `persist` 选项。**2026-09-27 定案（ADR-0019）：一期以前端 localStorage（startup-preferences）绕过，core 落盘不做** | 不做（非阻塞） |
| G2-12 | **liveness lease + idle 回收** | 形状已落地：lease TTL **180s**（审查时猜的 90s 作废）、扫描周期 60s、判据 =「无观看者（lease 过期且无 SSE 订阅）且不在跑」；不需要 provider 注册表/`globalThis` 键（单进程 + server 侧 SSE 注册表就够） | `core/src/agent/liveness.ts` + `server/src/main.ts` |
| G2-13 | **推送投递侧**（已撤销） | 原为 VAPID 密钥生成/持久化 + 订阅存储 + 完成时投递（只在无观看者时发），依赖可选包 `web-push`。**2026-09-25 撤销：整体删除订阅与投递侧**——`web-push` 从未进依赖、前端无 SW ⇒ 全链路是死码；且服务端绑 `127.0.0.1` + 桌面端浏览器退出后收不到推送，增量场景只剩「浏览器在后台运行但标签页全关」。通知只留前端页内（ADR-0016） | 已删除（原 `core/src/agent/push-service.ts` + `server/src/routes/push.ts`） |
| G2-15 | **磁盘格式常量归属** | 会话文件里的 `customType` 已从字面量改为 core 具名常量：`TOOL_SELECTION_CUSTOM_TYPE`（`piboat:tool-selection`）与 `SUBAGENT_CUSTOM_TYPE`（`pi-web:subagent`） | `core/src/agent/session-tool-selection.ts` / `read/session-read-service.ts` |

---

## 3. 分域状态矩阵（能力面 ↔ 本仓实现）

> 状态列已按 2026-02 现况刷新：✅ = 已实现；🟡 = 已登记但有意未做（触发条件驱动）；
> ⏸ = 延后；⛔ = 排除。**标 ⚠️ 的两处是本轮审查发现的真缺口**（G2-11 启动偏好落盘、UNC 路径往返）。

### 3.1 Agent 运行时域

| 端点 | 状态 | 说明 |
|---|---|---|
| `POST /api/agent/new` | ✅ | core 已实现（含 `ensure_session`）；**`cwd` 前置校验已补**（不存在/非目录 → 400） |
| `GET /api/agent/:id` | ✅ | 走**轻查不进 FIFO**，比命令通道的 `get_state` 更正确，作为本仓约定保留 |
| `POST /api/agent/:id` | ✅ | **24/24 命令**全量（Shell 直连组按 §8-3 排除） |
| `GET /api/agent/:id/events` | ✅ | 冷会话直接 404（`docs/04 §5.3` 有意）；「点开历史会话即恢复」由显式 `POST /:id/resume` 解决（ADR-0013，已落地） |
| `POST /api/agent/:id/resume` | ✅ | 审查时未登记（ADR-0013a 后补）：从 `.jsonl` 重建 runtime 并登记 |
| `GET /api/agent/running` | ✅ | — |
| `POST /api/agent/:id/lease` | ✅ | 已实现（G2-12）：续 lease 推迟 idle 回收；`renewed:false` = 会话已不在注册表 |
| `GET /api/agent/:id/bash-output` | ⛔ | **不做**（2026-01 定案：所有终端类能力一律不要）。超长 bash 输出临时文件的读取端点与 Shell 直连命令组（`bash` / `abort_bash`）一并不做；`BashExecutionMessage` 的历史渲染不受影响 |

空缺命令：**已归零**。审查时列出的 13 条（`set_model`、`set_thinking_level`、`compact`、`abort_compaction`、`set_auto_compaction`、`set_auto_retry`、`fork`、`fork_branch`、`clone`、`navigate_tree`、`set_session_name`、`reload`、`extension_ui_response`）均已实现。
（⚠️ 原列的 `extension_ui_input` **不存在**——0.87.1 `RpcCommand` 里没有这个命令，属误记；扩展 UI 只需 `extension_ui_response` 一个回填命令，见 ADR-0012）
（`bash` / `abort_bash` 属 Shell 直连组，本仓已决策不做。）

**命令域实现硬约束**（已按此实现，后续改动不得回退）：
- `fork` 是**破坏性原地替换**：捕获新 sessionId 后**立即销毁旧注册表条目**，否则旧 id 下挂着已 fork 的状态、后续 fork 产生损坏的 `parentSession` 链（`docs/01 §8-1`）
- `set_tools` **双路径**：运行中走 switch 返回 `null`；冷会话**重建 runtime** 并返回 `{sessionId, recreated}`
- `navigate_tree` / `clone` 涉及 runtime 替换：替换期间拒绝并发 prompt，替换后**重绑 extensions 并重挂订阅**（旧流上下发 `session_replaced`）
- 扩展 UI 需要 `pendingUiResponses` / `pendingUiRequests` / `activeCustomUis` 三张表 + abort 信号用于外部终止

### 3.2 事件通道（SSE wire）

| 项 | 状态 | 说明 |
|---|---|---|
| `seq` + late-join 快照 + 去重 | ✅ | 本仓约定，保留 |
| `connected` / `session_shutdown` | ✅ | 本仓自加；另有 `session_replaced`、`extension_ui_request` / `extension_ui_closed`（ADR-0012） |
| `Last-Event-ID` 差量重放 | 🟡 | **仍未实现**（B8 可选）：core 无事件缓冲，重连 = `connected` + 快照 + 增量整体重建（`docs/04 §5.5`）；要对标承诺需补环形缓冲 |
| transcript system 消息过滤 | ✅ | 随 G1 已落地（含 `agent_end.messages` 与历史 `context.messages` 同口径） |
| `turn_start` / `turn_end` | ✅ | **已定案：有意透传**（2026-09-20，`docs/02 §5.1`）；client 的 fold 依赖它兜底 |
| `agent_end` 载荷 | ✅ | **已定案：发 `messages + willRetry`**（丢帧自愈，`docs/03 §4`）——长会话下要接受这份体积 |
| `bash_execution_update` | ⛔ | 本仓丢弃（随 §3.1 的 `bash-output` 一并排除） |
| 事件快照回归 | ✅ | `wire-event.test.ts` 已就位，SDK 升级必跑 |

### 3.3 会话域

| 端点 | 状态 | 说明 |
|---|---|---|
| `GET /api/sessions` | ✅ | 含 `summary=1` 快路径（G2-8）与 transient 合并（`mergeTransient()`） |
| `GET /api/sessions/search?q` | ✅ | 轻量字段过滤 + **有界正文扫描**（G2-7 已落地） |
| `GET /api/sessions/:id` | ✅ | 含 `wrapperRebuilt`（`force=1` 时触发外部写入检测，G2-5）；`deferMedia` 已实现；未做：`tree=summary` / `treeFormat`（无消费方，按「不养期货」不加） |
| `GET /api/sessions/:id/revision` | ✅ | 审查后补（G2-6）：单会话文件指纹 |
| `PATCH /api/sessions/:id` | ✅ | 运行中 409（server 提示改走 `set_session_name` 命令——有意保留 409，避免与 SDK 写盘竞争） |
| `DELETE /api/sessions/:id` | ✅ | 一致（级联子代理，fork 不级联） |
| `GET /api/sessions/:id/state` | ✅ | 一致（文件不存在 404） |
| `GET /api/sessions/:id/context` | ✅ | `deferThinking` 已按 2026-09-20 决策**不做**（历史 thinking 全文直发），「缺 deferThinking」不再是缺口 |
| `GET .../entries/:entryId/thinking` | ✅ | 已落地（全量推理文本，按 `blockIndex`） |
| `GET .../entries/:entryId/tool-result-image` | ✅ | core + route 已就位 |
| `GET /api/sessions/:id/export` | ✅ | 已落地（复用 SDK `exportFromFile`）；⚠️ 审查时担心的「递归树改迭代」属 SDK 内部实现，本仓**未实测**长会话（5000+ 条目）是否爆栈（见 §7 导出条目） |
| `POST /api/sessions/:id/auto-name` | ✅ | 已落地（LLM 生成标题 + usage） |
| 外部写入检测 / runtime 重建 | ✅ | G2-5（ADR-0013b） |
| 会话列表 transient 合并 | ✅ | `mergeTransient()`：内存会话排在最前，同 id 以内存态为准 |
| 列表分页 | ⏸ | 触发条件与游标轴见 `docs/02` §9-7（仍不做） |

### 3.4 模型与配置域

| 端点 | 状态 | 说明 |
|---|---|---|
| `GET /api/models?cwd` | ✅ | 已含 `thinkingLevelPins` / `modelScopeWarnings` / `defaultModel` / `defaultThinkingLevel` |
| `GET/PUT /api/models-config` | ✅ | models.json 原文读写 + 校验落盘。**一期唯一的模型凭据入口**（见 §8） |
| `GET /api/models-config/catalog?q` | ✅ | 远端目录（1h 缓存，服务端代理） |
| `POST /api/models-config/discover` | ✅ | 按 provider `/models` 端点发现（20s 超时） |
| `POST /api/models-config/test` | ✅ | 真实补全测连通（临时 models.json，20s 超时） |
| `GET/PUT /api/models/enabled` | ✅ | G2-2 已落地（ADR-0011）：最小编辑引擎 + 项目 shadow 只读 + `prune`/`resync` + 最后一个模型 409 |
| `POST /api/models/refresh` | ✅ | G2-3 已落地（ADR-0011③） |
| catalog overlay / models-store | ✅ | `config/models-config-store.ts`（`~/.pi/agent/models-store.json`） |
| 启动偏好落盘（G2-11） | ⏸ | **仍缺口（非阻塞）**：显式模型/思考档只作用于会话，不写 settings.json `defaultModel`；一期由前端 localStorage 绕过（ADR-0019） |

### 3.5 文件系统域

| 端点 | 状态 | 说明 |
|---|---|---|
| `GET /api/home` | ✅ | `{home}` |
| `POST /api/default-cwd` | ✅ | 创建 `~/pi-cwd-YYYYMMDD` 并加入 allowed-roots |
| `GET /api/cwd/browse?path` | ✅ | 目录选择器（Windows 盘符） |
| `POST /api/cwd/validate` | ✅ | `~` 展开 + 项目归一 + 选定即入 allowed-roots |
| `GET /api/files/*?type=…` | ✅ | `list / read / download / meta / preview` 五种（`watch` → **400**，见 §9）+ `sessionId` 引用放行（`list` 不适用）。**未做**：Range 流式返回、DOCX 转 HTML、文本分块（`offset`）——整文件字节返回（见 §9） |
| `POST /api/files/*?type=upload\|upload-check` | ✅ | 单文件 ≤25MB / 总量 ≤100MB、文件名校验、冲突策略、上传前 JSON 预检（Range / DOCX / 分块**未做**，见 §9） |
| `GET /api/file-index?cwd&q` | ✅ | git 仓库走 tracked 文件、无 q 上限 5000、内存全量硬上限 20 万、per-cwd 缓存；⚠️ UNC cwd 的路径往返未处理（见 §7） |
| allowed-roots 单一实现 | ✅ | `PathGuard`：**唯一**安全边界实现（两侧都 resolve + 大小写折叠）；来源：会话 cwd、项目根、`~/pi-cwd-*`、显式授权 |

> allowed-roots 与访问控制是**文件系统的安全边界**，与 §8 排除的「鉴权」是两回事：前者决定「哪些目录可被读写」，后者决定「谁可以访问服务」。前者一期必做，后者不做。

### 3.6 Git 与 Worktree 域

| 端点 | 状态 | 说明 |
|---|---|---|
| `GET /api/git/status?cwd` | ✅ | 含 `additions/deletions` |
| `GET /api/git/diff?cwd&path` | ✅ | 单文件 unified diff |
| `GET/POST/DELETE /api/worktrees` | ✅ | 新 worktree 建在 `<repoRoot>-worktrees/<sanitized-branch>`、已存在分支复用、脏 worktree 删除返回 `409 {dirty:true}`、被删 worktree 的会话归回主项目、git 输出的 POSIX 路径转原生、路径比较一律 `samePath()` |
| 项目分组 | ✅ | 本仓 `GET /api/projects` + `projectKey` + `listFingerprint` 为既定设计（ADR-0008），保留 |

### 3.7 资源域（skills / plugins / subagents / 信任 / 工具设置）

| 端点 | 状态 | 说明 |
|---|---|---|
| `GET/PATCH /api/skills` | ✅ | 用 `DefaultResourceLoader`（与运行时同源）；PATCH **只手术 `disable-model-invocation` frontmatter** |
| `POST /api/skills/search` | ✅ | 技能市场搜索 |
| `POST /api/skills/install` | ✅ | 经 `npx skills add … --agent pi`（项目安装用选中 cwd） |
| `POST /api/skills/check` / `update` | ✅ | 版本对比 |
| `GET/POST /api/plugins` | ✅ | 经 `SettingsManager` + `DefaultPackageManager`；disable 写空数组 |
| `POST /api/plugins/check` | ✅ | 更新检查 |
| `GET/PUT /api/tools/settings` | ✅ | `{isWindows, powerShellEnabled}` |
| `GET/PUT /api/project-trust` | ✅ | 两种拒绝 → **409 + `reason`**：`no-trusted-resources`（无需要信任的资源）、`session-active`（该 cwd 有活跃会话时不许改信任——已加载的项目资源不能中途撤下） |
| `GET/PUT /api/subagents/settings` | ⏸ | 延后（§8-4）：内建开关默认 **fail-closed**，原子写保留未知字段 |
| `GET/PUT/PATCH/DELETE /api/subagents/profiles` | ⏸ | 延后（§8-4）：内置 profile 只允许 `PATCH` 开关、不许 PUT/DELETE 拷贝；profile 文件与其他运行时共享，保存须回环外部 frontmatter 键 |
| `GET/POST /api/subagents/:id` | ⏸ | 延后（§8-4）：运行信息 / steer / abort |
| **子代理运行时本体** | ⏸ | 延后（§8-4）：内联 extension、三保留工具、后台运行、通知去重、worktree 隔离；将来以 pi 扩展形式引入 |

### 3.8 辅助通道

| 端点 | 状态 | 说明 |
|---|---|---|
| `GET /api/health` | ✅ | 一致 |
| ~~`GET /api/push/config`~~ / ~~`POST /api/push/subscribe`~~ | ⛔ | **已删除**（ADR-0016，2026-09-25）：后台推送整体不做，§8-6 |
| `POST /api/agent/:id/lease` | ✅ | 见 G2-12 / §3.1 |
| 服务端耗时埋点（env 开关） | ⏸ | B8 可选：`Server-Timing` + 结构化日志，慢路径诊断用（未做） |
| 响应 gzip（≥1KB 才压） | ⏸ | B8 可选（未做） |

### 3.9 排除域（一期不做）

| 域 | 端点 | 处置 |
|---|---|---|
| 鉴权 | `GET/POST/DELETE /api/web-auth` | ⛔ §8-1 |
| 登录 | `GET /api/auth/providers`、`GET/POST /api/auth/login/:provider`、`POST /api/auth/logout/:provider` | ⛔ §8-2 |
| 凭据写入 | `POST/DELETE /api/auth/api-key/:provider` | ⛔ §8-2（边界见该节） |
| 用量查询 | `POST /api/provider-usage/query` | ⏸ 待定（见 §8-2 边界说明） |
| 终端 | `POST /api/terminal`、`GET/POST/DELETE /api/terminal/:id`、`GET /api/terminal/:id/events` | ⛔ §8-3 |
| Shell 直连 / bash 输出 | `bash` / `abort_bash`（命令）与 `GET /api/agent/:id/bash-output` | ⛔ §8-3 |
| 子代理 | `/api/subagents/settings`、`/api/subagents/profiles`、`/api/subagents/:id` | ⏸ 延后 §8-4 |
| 应用更新 | `GET /api/app-update` | ⛔ 发布通道未定 |

---

## 4. 本仓既定设计约定（不得因补齐而回退）

| 约定 | 内容 | 处置 |
|---|---|---|
| 项目清单端点 | `GET /api/projects`（`projectKey` 归一 + `listFingerprint`，ADR-0008） | **保留** |
| 注册表版本 vs 列表指纹 | `registryVersion`（注册表结构性变动）+ `listFingerprint`（磁盘指纹）分离 | **保留**（语义更清晰） |
| 轻查不进 FIFO | `GET /api/agent/:id` 直读注册表 | **保留** |
| wire `seq` | 会话级单调 seq + 快照去重 | **保留** |
| protocol 独立包 | 契约包（包边界与"唯一契约"不变）；类型真相源改为 SDK 公开导出、Zod 只留入参（ADR-0017 部分取代 0006、修订 0005） | **保留（形态修订）** |
| 本机访问三闸 | Host / Origin / Sec-Fetch-Site 常开；**GET 不得有副作用**（ADR-0007） | **保留**（§8-1 排除的是凭据与 LAN，不是这三闸） |
| 冷会话不自动拉起 | SSE 连接对冷会话 404；恢复走显式 `POST /api/agent/:id/resume` | ✅ **已定案并落地**（ADR-0013a）；`docs/04 §5.3` 关闭条件 3 保留 |
| 扩展 UI 状态字段 | `AgentState.extensionStatuses/Widgets` 由 `ExtensionUiBridge` 按 key 代际维护 | ✅ 已补齐（G2-4 / ADR-0012） |
| 启动偏好落盘 | 显式选的 model / thinking 是否写 settings.json `defaultModel` | ⏸ **仍缺口**（G2-11）：当前只作用于会话，不落盘；前端绕过已定（ADR-0019），core 侧不做 |
| Shell 直连 | 不做 | 见 §3.1（⛔） |

---

## 5. 定案与待定案（ADR 清单）

| 编号 | 议题 | 状态 | 影响面 |
|---|---|---|---|
| ADR-0010 | SDK 对齐 `0.87.x` | ✅ 已落地（B1 完成，含 2 项遗留真机验证） | 全仓（core 投影 / 状态读取 / 统计口径） |
| ADR-0011 | 模型可见范围（enabledModels）与目录刷新 | ✅ 已定：完整引擎 + 全局可写/项目只读 + 仅手动刷新 | protocol + core + server（B3） |
| ADR-0012 | 扩展 UI 双向通道 | ✅ 已定：按 SDK RPC 面实现 **9 个 method**，不引入 TUI 渲染（`custom` 明确不支持） | protocol + core + client + ui（B2） |
| ADR-0013 | 冷会话恢复 + 外部写入检测 | ✅ 已定：恢复走**显式 `POST /resume`**（保住「GET 无副作用」）；外部写入**仅全量读**时检测，run 期间不检测 | server + core（B4） |
| ADR-0014 | 一期范围：排除鉴权 / 登录 / 终端，延后内建子代理运行时 | ✅ 已落成 ADR 文件（并标注 **ADR-0007 的 LAN 段被取代**） | 全仓（防止反复重建） |

> ADR-0007 的「GET 不得有副作用」是硬约束：新增的 `GET /api/models/enabled`（只读）都没问题，但**不得**引入任何有副作用的 GET。
> ADR-0014 不是新决策，而是把已定的排除/延后项**落成可检索的决策记录**——这类「有意不做」若不记录，后续会话很容易重新加回来。

---

## 6. 实施批次（已全部完成）

> 「先把后端全部补齐」按依赖切批执行。**批次内可并行，批次间强依赖。** 本表保留为执行记录：
> 每批的“产出”就是该域现在的代码位置，后续改动可回查每批的范围。

| 批次 | 内容 | 依赖 | 产出 |
|---|---|---|---|
| **B0 定案** | §5 的 ADR + `docs/02` 路由基线刷新 | — | 定案文档 |
| **B1 SDK 升级** ✅ 已完成 | 升 `0.87.x`（ADR-0010）、wire 投影对齐（system 消息过滤 / `agent_end` / `turn_*` 取舍）、`computeStats` 口径、事件快照回归全绿 | — | core 地基（遗留 2 项真机验证，见 §2 G1） |
| **B2 命令通道补全** ✅ 已完成 | 13 条命令 + fork runtime 替换（`AgentSessionRuntime`）+ `set_tools` 双路径 + 扩展 UI 通道（G2-4，ADR-0012）+ 工具预设（G2-9）+ 性能统计累加 + 冷会话 `resume`（ADR-0013a）；~~精确系统提示词（G2-10）~~ **已于 2026-09-24 撤销**（ADR-0015） | B1 ✅ | agent 域完整 |
| **B3 模型域** ✅ 已完成 | `models` / `models-config`(+catalog/discover/test) / `models/enabled`(G2-2，ADR-0011) / `models/refresh`(G2-3) | B1 ✅ | ConfigService |
| **B4 会话域增强** ✅ 已完成 | export（SDK `exportFromFile`）/ auto-name / thinking / `revision`(G2-6) / `summary=1`(G2-8) / 正文搜索(G2-7) / 外部写入探测(G2-5，ADR-0013b) / transient 合并 | B1 ✅ | 会话域完整 |
| **B5 文件 / Git / Worktree** ✅ 已完成 | files list/read/download/meta/preview + upload/upload-check（引用放行、文件名清洗、冲突策略）/ file-index（git ls-files + 模糊打分）/ home / default-cwd / cwd browse+validate / git status+diff / worktrees 全组（路径归一 + 409 dirty） | B0 ✅ | SystemService + PathGuard |
| **B6 资源域** ✅ 已完成 | skills（list / PATCH frontmatter / search / install / check / update）/ plugins（list / 五种动作 / check）/ tools-settings / project-trust | B2 ✅ | ResourceService（子代理延后，见 §8-4） |
| **B7 会话生命周期** ✅ 已完成 | liveness lease / idle 回收（G2-12）；原「推送订阅与投递侧」（G2-13）已删（ADR-0016） | B1 ✅ | LivenessRegistry |
| **B8 可选** | 耗时埋点、gzip、SSE 环形缓冲差量重放 | — | 锦上添花 |

**每批验收线**：
- 新增路由必须过 `docs/04 §6` 四条检查清单（文件系统 → allowed-roots？错误响应泄漏路径/堆栈？新增 Origin/Sec-Fetch 例外？有副作用的 GET？）
- protocol 先定 schema，再写 core，再写 server 路由（`docs/01 §3.1`）
- 路由测试进 `packages/server/test/server.test.ts`；SDK 相关改动跑事件快照回归
- `pnpm turbo run build && pnpm turbo run test` 全绿

---

## 7. 已知实现风险与硬约束（逐条对照，不要重新踩）

标 ★ 的是审查时 `docs/01 §8` 未登记的项；其中若干已在实现中落地并写进设计文档
（外部写入检测 → ADR-0013b；`usage` / `context_edit` 条目 → `docs/02 §3.1` + `docs/03`；
`samePath()` / POSIX 路径转换 → `docs/04 §3.4`），**本节保留为改代码前的检查单**。

**会话 / 运行时**
- fork 后 runtime 内部 sessionId 已变 → 必须立即销毁旧注册表条目（本仓已记录）
- `parentSession` 只是展示元数据，整文件重写安全（级联改父时用）
- ★ 外部写入检测：只在全量读（挂载 / 刷新）时探测磁盘并重建 runtime；两个进程写同一 JSONL **不受支持**，所以轮次后的读**不能**扫盘
- ★ 列表缓存失效要**保留旧扫描**（generation 匹配才算新鲜）；给「只读元数据」的调用方（如搜索映射）提供 stale 读，避免每次重建（重建要重读所有 fork / 子代理会话）
- ★ `usage`（`cache_warm`）条目要像 compaction usage 一样计入统计，才与 SDK `/session` 一致
- ★ `context_edit` 条目省略/替换模型上下文但不改原始历史，UI 忽略

**事件 / 流**
- ★ 每次（重）连都受「组件已挂载」ref 约束（React Strict Mode 会先清理再重跑 effect，顺序会让「热会话」effect 早于挂载 effect → dev 下永远不开流）
- ★ 不要在第一个 `agent_end` 关流：重试、压缩、扩展排队消息都可能延续同一逻辑轮次
- ★ prompt 用单调 run id；迟到的旧 run 的 SSE 或轮询响应必须丢弃，否则复活陈旧流式气泡

**模型**
- ★ 不要假设 `provider/*` 覆盖该 provider：minimatch 的 `*` 遇 `/` 停止，嵌套模型 id 会漏
- ★ 不要整表重写可见模型列表：`getAvailable()` 只看当前鉴权通过的 provider，会删掉缺凭据 provider 的条目
- ★ 禁用最后一个模型要 409（空列表在 pi 里等于「全开」，语义相反）
- ★ 模式匹配连**裸 modelId** 一起匹配，provider 改名可能静默启用别家模型
- ★ **`patterns` 为空（= 隐含「全部可见」）下的 toggle 必须显式化所有 provider**：列表一旦非空，
  未列出的模型就不可见——只写被 toggle 的那家会让别家整体消失（2026-09-27 修复，
  `toggleModelInPatterns` 空列表分支 + 5 条测试；既有测试只覆盖了 patterns 非空的路径）
- ★ 「最后一个模型」的拒绝判据是**全局**只剩 0 个可见模型，不是「该 provider 空了」：
  别家还有模型时关闭本家最后一个模型是合法的
- ★ 只有用户点按钮才联网刷新目录；任何定时或旁路刷新都不行

**文件 / 路径**
- ★ 路径比较永远用 `samePath()`，不要 `===`（Windows 上会让「是否顶层」恒 false，整个 worktree 切换器消失）
- ★ git 在 Windows 也输出 POSIX 绝对路径 → 一律转原生路径
- ★ UNC cwd（`\\host\share`）的 API 往返：`//` 前缀会被 308 归一掉 → 把 `//` 折进首段（`%2F%2Fhost`），不得拆段重组

**子代理（若将来做内建运行时，见 §8-4）**
- ★ 后台完成通知与结果查询工具的**消费标记**去重（父仍在轮询取结果时，通知不能重复投递）
- ★ 通知文本要带专用前缀，否则压缩提示词会把子代理输出误当用户目标归档
- ★ 内置 profile 只允许按名开关，不许拷成 `.md`（会冻结版本且对其他运行时可见）；开关 **fail-closed**，读列表 fail-open
- ★ 保留工具名（`Agent` / `get_subagent_result` / `steer_subagent`）不得被加载的扩展暴露给子代理

**导出**
- ★ 导出 HTML 要把递归树辅助函数改为迭代版，否则 5000+ 条目的线性会话在浏览器里爆栈

---

## 8. 一期排除 / 延后项（须留记录防反复重建）

> 本节是**决策记录**，不是待办。若将来要做，须先写 ADR 推翻，并同步恢复 `docs/01` 中被清除的描述。

### 8-1 鉴权（本机访问凭据 / LAN）⛔

- **不做**：口令登录、session cookie、`Authorization: Basic`、失败节流、`/api/web-auth` 三端点、非回环绑定开关、反代外部主机名白名单。
- **保留**：ADR-0007 的三闸（Host / Origin / Sec-Fetch-Site）**不变** —— 它挡的是「用户浏览器里的恶意网页」，与「谁可以访问服务」是两件事；也保留了「GET 不得有副作用」这条硬约束。
- **连带结果**：`docs/01 §9-4` 的「局域网访问开关」随之排除（LAN 暴露必须凭据，无凭据即不可开）。§5.2.2 的 CORS 白名单保留（直连备选，不含凭据语义）。
- **出处**：用户 2026-01 定案。

### 8-2 登录（provider 身份认证入口）⛔

- **不做**：`GET /api/auth/providers`、`GET/POST /api/auth/login/:provider`（OAuth / device-code SSE）、`POST /api/auth/logout/:provider`。
- **边界说明**：本仓按「登录能力」理解为**整个 provider 身份认证入口**，因此把 `POST/DELETE /api/auth/api-key/:provider`（凭据写入）也一并排除；模型凭据一期**只经 `GET/PUT /api/models-config`**（models.json 原文，含 provider 级 `apiKey`），或由用户在本机的 `pi` CLI / TUI 里配置后由本服务读取。
  - 若日后希望保留「在 Web 里写 API Key」，只恢复 `api-key` 两个方法即可，其余不动。
- **连带结果**：`POST /api/provider-usage/query`（余额/用量查询）标 ⏸ —— 它不属登录流程，但依赖 provider 凭据来源；若要保留，需明确凭据由谁维护。默认**不做**。
- **出处**：用户 2026-01 定案。

### 8-3 终端（PTY）⛔

- **不做**：`POST /api/terminal`、`GET/POST/DELETE /api/terminal/:id`、`GET /api/terminal/:id/events`、`TerminalEvent` wire 类型、`node-pty` 依赖、xterm 前端。
- **同时不做**（同一决策，2026-01）：Shell 直连命令组（`bash` / `abort_bash`）与 `GET /api/agent/:id/bash-output` 端点——超长 bash 输出临时文件不提供读取端点。
- **保留**：`BashExecutionMessage` 的协议类型与历史渲染——它是 `.jsonl` 里的既有消息角色（CLI 里 `!` 执行的记录），与终端执行能力无关；丢掉它会让既有历史会话缺一段。
- **维持**：`docs/02 §5.3`/§6.8 的移除决策继续有效。
- **已同步清除的残留**（原先与 `docs/02` 矛盾）：`docs/01` §2 架构图、§3.1 SystemService、§3.1 server 段、§3.2 拆包策略、§4 技术选型「终端」行、§6 一期功能范围、§7 M3 里程碑、§8-6 node-pty 风险行、§10 协议骨架。
- **注**：`BashExecutionMessage` 的**历史渲染**保留（读 `.jsonl`，与终端能力无关）；git worktree 不是终端能力，照常做。
- **出处**：2026-01 决策（`docs/02`）+ 2026-01 复核确认维持。

### 8-4 内建子代理运行时（延后，非排除）⏸

**结论（2026-01）：一期不做内建子代理运行时**，改为「将来以 pi 扩展形式引入」。这是**延后**，不是像 §8-1/8-2/8-3 那样的永久排除。

- **一期不做的内容**：内联 extension 注册 `Agent` / `get_subagent_result` / `steer_subagent` 保留工具、profile 解析与 precedence、worktree 隔离、后台运行与通知去重、子代理标记 custom 条目的写入、`/api/subagents/*` 全部端点（settings / profiles / `:id`）、侧栏的家族聚簇。
- **为什么延后影响有限**：子代理**不是 SDK 内建能力**，而是由 extension 注册工具后才存在。pi-boat 用的是同一套 SDK 与同一份资源目录（`~/.pi/agent/` + 项目级配置），所以用户在本机自行安装一个提供同类工具的扩展包，子代理能力就能直接长在本产品里，无需后端改动。
- **一期不做带来的损失**（选型时的权衡）：
  - 模型默认无法委派子任务（除非用户装了相应扩展）
  - 没有 Web 侧管理面：profile 增删改 / 开关、运行信息 / steer / abort 都没有界面入口
  - 侧栏不把子代理会话聚簇到宿主会话下，也不显示 status / result；它们仍以普通会话（带 `parentSession`）出现，**可浏览、可续聊、可删除**
  - 删除级联的子代理标记判定**已在 core 实现**（`SessionReadService.delete()`），对既有会话文件仍然生效
- **将来引入路径**：以 pi 扩展形式提供（第三方包或自研），protocol 侧只加不改（新增端点非破坏性）。届时应重估是否升级为内建运行时以换取管理面与家族聚簇。
- **后果**：§2 G2 表中的「子代理运行时」与「家族聚簇」两项移出本次范围，见上方损失清单。

### 8-5 其他

| 项 | 处置 | 理由 |
|---|---|---|
| `GET /api/app-update` | ⛔ | 发布通道未定（`docs/02 §9-5`） |
| Next.js / SSR / RSC | ⛔ | ADR-0002 已定 Vite SPA |
| 非回环绑定的 TLS / 扫码配对 | ⛔ | §8-1 连带 |
| 会话列表分页 | ⏸ 触发条件驱动 | `docs/02 §9-7`（10³–10⁴ 会话且单请求 >100ms 或 payload >1MB） |
| SQLite / 自建存储 | ⛔ | `docs/01 §9-6`，全部复用 `.jsonl` |
| Electron / 桌面端 | 二期 | M4 |
| i18n / 主题 / PWA | 前端阶段 | 不进后端 |

### 8-6 后台推送（Web Push）⛔

**结论（2026-09-25）：一期不做后台推送**，订阅侧与投递侧一并删除（ADR-0016）。

- **删除的内容**：`core/src/agent/push-service.ts`（VAPID 密钥持久化、订阅表落盘、`deliver()`）、`server/src/routes/push.ts`、protocol 三个 schema、core 的 `AgentSessionService.onSettled` 钩子与 `SessionRegistryEntryOptions.onSettled`。
- **为什么删**：① `web-push` 从未进依赖、前端无 service worker ⇒ 整条链路四步缺三步，代码是**死码**（对外零效果，对内让人以为功能存在）；② 服务端绑 `127.0.0.1`，通知只会出现在本机，而桌面端浏览器进程退出后收不到推送——增量场景只剩「浏览器在后台运行 + 标签页全关 + 人还在这台机器前」；③ Web Push 要求 server 主动出网到 Google / Apple / Mozilla，与本地无凭据定位不符。
- **保留的替代**：前端**页内**通知（`Notification` API，页面存在时有效）+ 完成提示音，均属前端体验项（`docs/01` §6 清单保留）。
- **将来重做的路径**：上位实现 pi-web 已有完整且带测试的版本（`lib/web-push.ts` / `lib/push-client.ts` / `components/PwaRegistration.tsx` / `public/sw.js` / `lib/browser-notifications.ts`），从那卩搬运，**不要从零设计**；且必须同时补依赖 + SW，不能只恢复 core 侧（那就是本次删除的状态）。若需求是「浏览器完全退出也要通知」，属 Electron / 原生通知（§8-5 的 M4），不是 Web Push 的职责。

---

## 9. 下一步

1. ✅ **B0～B7 全部完成**（2026-02）：定案 → SDK 对齐 → 命令通道 → 模型域 → 会话域 → 文件/Git/Worktree → 资源域 → 会话生命周期（B7 的推送投递侧于 2026-09-25 删除，ADR-0016）
2. 门槛：`pnpm turbo run lint build test` 全绿（protocol 33 / core 180 / server 64 用例）
3. 遗留（**已知、非阻塞**，见下「实现期发现的边界」）
4. 下一步是前端三包：`packages/client` → `packages/ui` → `apps/web`（**目录尚未创建**，设计稿见 `docs/05` / `docs/06`）

### 实现期发现的边界（有意留下的，不是遗漏）

| 项 | 现状 | 理由 |
|---|---|---|
| **纯聊天的系统提示词精确覆写** | **已撤销**（ADR-0015，2026-09-24）：删除 `agent/exact-system-prompt.ts` 与 `systemPrompt: ' '` / `appendSystemPrompt: [' ']` 占位符，纯聊天按 pi 默认组装 | pi 默认即把上下文文件放进 `<project_context>`，扩展只买到「剥掉包装」；且它会靠 `_runSystemPromptOptions` 制造面板时序差异。需要「逐字」的真实用例（子代理 profile）见 §8-4，届时重新引入 |
| `GET /api/files/*?type=watch` | 返回 400（未实现） | 文件监听要常驻 watcher 与跨平台差异处理；一期用轮询足够 |
| 上传的 Range / DOCX / 分块 | 未实现（单请求多文件已实现，25MB/文件、100MB/请求）；`read` / `preview` 也是整文件字节 | 分块与 Range 只在超大文件场景需要 |
| 后台推送（Web Push） | **已删除**（ADR-0016，2026-09-25）：`push-service.ts`、`routes/push.ts`、两个端点、protocol 三个 schema、core 的 `onSettled` 钩子 | 未接线前是死码（`web-push` 不在依赖、无 SW）；本地绑定 + 桌面端浏览器退出后收不到推送，增量场景窄；重做时从上位实现搬运 |
| 子代理运行时 | 延后（见 §8-4） | 可由 pi 扩展提供，后端零改动 |
| `deferThinking` | 不做（历史 thinking 全文直发，按块惰性取原文另走 `/thinking`） | 2026-09-20 已定案 |
| **启动偏好落盘（G2-11）** | **未实现**：显式选择的 model / thinking 只作用于会话，不写 settings.json `defaultModel`（旧版本本文档曾误记为“已并入模型域实现”） | **已定案（ADR-0019，2026-09-27）：「下次新建继承上次选择」由前端 localStorage 承担（startup-preferences）；core 落盘不做，若将来要做须按本行方案 + 新 ADR |
| SSE 差量重放 / 埋点 / gzip | 未做（B8 可选） | 当前靠快照重建已够用；触发条件：实测到重连丢帧痛点或 payload 压力 |
| UNC cwd 路径往返 | 未处理（`//host/share` 会被 308 归一掉） | Windows 网络路径场景少；真要做需把 `//` 折进首段（见 §7 文件/路径条） |
| 导出 HTML 长会话爆栈 | 未实测（复用 SDK `exportFromFile`） | 如果 SDK 内部是递归遍历，5000+ 条目会话可能在客户端爆栈；真机碰到再补迭代版 |

> 本文与代码不一致时以代码为准并当天更新（AGENTS.md）。
> 本轮（2026-02）刷新范围：抬头与 §1 结论表、G2 全表、§3.1–§3.8 状态列、§4 约定、§9 下一步与边界表；
> 并纠正了一处旧结论错误（G2-11 启动偏好**并未**落盘）。
