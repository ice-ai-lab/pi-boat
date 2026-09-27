# ADR-0026：会话列表按项目取数——projectKey 下推、按范围缓存、运行态随会话带回 cwd

- 日期：2026-09-27
- 状态：已接受（Accepted）
- 关联文档：`docs/02` §6.1 / §9；`docs/04` §3；`docs/05` §7
- 关联决策：ADR-0008（项目分组与列表缓存）、ADR-0009（REST 查询层）、ADR-0017（SDK 类型即协议）

## 背景

ADR-0008 已经定下三层成本解耦：`/api/projects` 给项目清单、`projectKey` 归一在服务端、
列表缓存用目录指纹。但它留了两处**只落地了一半**：

1. **`?projectKey=` 只收敛 payload，不收敛 CPU。** `SessionReadService.list()` 的实现是
   「先 `listAllSessions(scan)` 解析**所有**目录，再 `filter(projectKey)`」。而
   `SessionManager.listAll()` 要解析每个 `.jsonl` 的头尾（本机实测 ~2.5 ms/会话）——
   只取一个项目却把所有项目都读一遍。实测（52 会话 / 6 项目）：
   `?summary=1` 全量 115 ms，而只取 1 个会话的项目本可以 2 ms。
2. **前端没有用它。** 侧栏仍是 `useSessionsQuery()`（全量）+ `getRecentProjects(全量会话)`
   在客户端推导项目清单；`?projectKey=` 与 `/api/projects`（含 `useProjectsQuery`）都是
   零消费方。等于 ADR-0008 建的三层只用了第一层。

用户在明确「大量会话时减少接口耗时」的目标后要求按此推进，实施中发现两个必须一起解决的耦合：

- **跨项目的运行/未读徽标**：侧栏项目行的 running/unread 计数与「其他项目有新活动」圆点，
  原先都从**全量会话列表**算出来。改成按项目取数后，客户端手里没有别的项目的会话，
  归位信息就断了。
- **活动会话 → 项目**：`?s=` 深链进来时，侧栏原先靠全量列表反查「这个会话属于哪个项目」。
  按项目取数后同样断掉。

## 决策

### 1. `projectKey` 下推到扫描层（而不是解析后过滤）

`list({ projectKey })` 先按项目收窄 `SessionsDirScan.projects`，再调 `SessionManager.listAll()`：
逐目录读一次首行头拿 cwd（~0.5 ms/目录，不解析正文）+ 共用 resolver 归一成 projectKey 比对。
目录名（encoded-cwd）有损，不能反解，这一步是唯一可行的归属判定。

`?projectKey=` 因此从「payload 收敛」升级为「payload + CPU 双收敛」，与 ADR-0008 §4 的
「payload 从全量降到单项目」同向、且更彻底。

### 2. 缓存按「指纹 + 范围」失效

原先 `listCache = { fingerprint, sessions }` 只装一份结果。若把它改成「按项目的结果」
就会污染全量读（反之亦然）。改为 `{ fingerprint, byScope: Map<scope, SessionInfo[]> }`：
指纹变化整批作废（磁盘侧任何增删改），同一指纹下各范围各自复用（切项目不重解析）。

### 3. 运行态会话随列表带回 cwd（协议字段替换）

`SessionListResponse.runningSessionIds: string[]` → `runningSessions: { id, cwd }[]`
（id 可派生，属破坏性协议变更，commit 用 `!`）。cwd 是 server 内存里现成的
（`sessionManager.getCwd()`），不查磁盘、不解析正文。这样客户端能：

- 把 running 归到项目（按 `/api/projects` 的 `cwds` 索引）→ 项目行徽标与「其他项目有新活动」
  圆点不再依赖全量列表；
- 在会话**结束的那一刻**（它还在 `runningSessions` 里）记下 id → projectKey，
  之后 unread 徽标始终查得到——包括从未加载过的项目。

`/api/agent/running` 保持 `runningSessionIds`（通知池只需要 id，不需要 cwd）。

### 4. 前端：项目身份不再由会话列表反推

- 项目清单 ← `GET /api/projects`（新增 `transient` 入参：内存会话的 cwd 也要成为项目条目，
  否则「在全新目录里新建会话」时侧栏没有该项目可选、`?projectKey=` 也拿不到那个新会话）。
- `selectedProject` 决议顺序：worktree 状态 → `POST /api/cwd/validate`（`projectKey` 的权威来源，
  与 `?projectKey=` 过滤按构造同源）→ `/api/projects` 的 `cwds` 索引 → cwd 兜底。
- 会话列表 ← `useSessionsQuery(selectedProject.key)`；项目未定时**不取数**（不发全量）。
- 活动会话的 cwd 由中栏（真正打开会话的地方）上抬给侧栏，用于 `?s=` 深链时定位项目。
- 客户端那套「从全量列表推导项目清单」的函数（`getRecentProjects` / `sessionsForProject` /
  `groupSessionsByProject` / `filterSessions`）与 `RecentProject` 类型全部删除（零调用方）。

### 5. 顺手修掉的两个潜在缺陷

- `?projectKey=` 会**静默丢掉 transient（未落盘）会话**：`transientInfos()` 没有 `projectKey`
  字段，而过滤是在合并之后按字段做的 ⇒ 刚 `ensure_session` 的新会话在按项目取数时消失。
  现在 transient 也按 cwd 归一后参与过滤。
- `?summary=1&projectKey=` **恒返回空**：`summary` 跳过 enrich ⇒ 结果里没有 `projectKey` 字段
  ⇒ 同一个过滤把它们全丢掉。该组合已随 `?summary=1` 一起删除（见下），无需再修。

### 6. 删除 `?summary=1` 快路径

`summary`（跳过 `enrich()`，每 cwd 一次 git 解析）是 ADR-0008 性能分层的第二级，用途是
「侧栏首次挂载先画壳，再拉全量补分组」。ADR-0026 决策 4 之后侧栏不再需要它：

- 项目身份与分组不再从会话列表推导，也就没有「先无分组、后补分组」的两段式；
- 它**不写列表缓存**（缓存存的是带分组的样子）⇒ 每次调用都重解析全部会话文件：
  实测全量 `summary=1` **115 ms**，而带缓存的等价请求 2 ms。轮询里它是纯亏损；
- 它不回 `projectKey` 字段，对按项目取数是陷阱（决策 5 的第二条就是这个组合的后果）。

因此从 `SessionListQuerySchema`、`SessionListOptions`、路由、client 端点一并删除
（协议查询参数减少，属破坏性变更但无线上消费方：web 侧零调用、唯一使用者是 e2e 脚本）。

### 7. 删除 `ProjectInfo.sessionCount`

它是**文件数**而不是会话数（名字暗示了它做不到的事，AGENTS.md 命名规则第三例）：
本机实测 `pi-boat` 项目 40 个文件 vs 39 条会话——差 1 是因为该目录里有一个
**没有 session 头**（首行是 `message`）的旧文件，目录扫描计入文件数，会话解析则会跳过它。

同时它在整个仓里**零消费方**（侧栏不渲染它，参考实现的项目行也只有 running/unread 徽标；
`getRecentProjects` 那套客户端推导已在决策 4 里删除）。因此从 `ProjectInfo` 与
`ProjectReadService` 里删除；需要「项目规模」时再单独设计一个诚实的字段名（如 `fileCount`）。

### 8. `resources.ts` 的信任前置判断不再拉列表

`hasSessionForCwd`（「该项目有会话在跑就不许改信任」）原来是
`runningSessionIds ∩ readService.list({summary:true})`——为了一次 cwd 比较拉全量列表解析。
决策 3 让 `runningSessions()` 自带 cwd，这里直接比对即可：断言从「在磁盘列表里且在跑」
收紧为「在跑且 cwd 相同」（未落盘的内存会话也算，语义更正），且路由不再依赖 `readService`。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 保持全量列表（现状），只靠缓存吃成本 | ❌ 放弃 | 指纹缓存只覆盖「磁盘没变」的窗口；agent 每次写会话文件都会失效，稳态下每 5s 轮询都要重解析全部会话（实测 115 ms） |
| 先做分页（`?cursor&limit`） | ⏸ 延后（维持 ADR-0008 §5 的触发线） | 分页不解决「全量解析」，且游标/指纹粒度（现在是全局指纹）/transient 归属/跨项目徽标四个语义都要重做。项目内收敛已经拿到绝大部分收益；到 10³–10⁴ 且实测过线再按 ADR-0008 §5 做 |
| `?projectKey=` 保持「解析后过滤」 | ❌ 放弃 | CPU 白花；实测 115 ms → 2 ms 的差距就在这里 |
| 项目清单仍在客户端从会话列表推导 | ❌ 放弃 | 与 ADR-0008 同款理由（分页互斥 + 客户端重写归一逻辑）；且全量列表正是要避免的那份 payload |
| 给 `SessionInfo` 补 `running` 字段（运行态随会话下发） | ❌ 放弃 | 运行态是**跨项目**信息，只加载一个项目时拿不到别的项目的会话，字段无处可挂 |
| 在 `/api/projects` 上加 `runningCount` | ❌ 放弃 | 只能表达 running；unread 是客户端概念（「跑完了你没看」），归位仍需要 id → cwd/projectKey 的映射。给 `runningSessions` 带 cwd 一次解决两者 |
| 保留 `runningSessionIds` 并另加 cwd 映射字段 | ❌ 放弃 | 同一事实两份表达，且 id 完全可派生 |
| unread 只对「已加载过的项目」显示 | ❌ 放弃 | 会静默丢功能（别的项目里后台跑完的会话不再点亮项目行），而修复成本只是一个 cwd 字段 |

## 后果

**正面**

- 单项目请求的解析成本只与该项目的会话数相关：实测（52 会话 / 6 项目）
  `?summary=1` 全量 **115 ms → 2.1 ms**（只取 1 个会话的项目）；侧栏稳态 payload
  33.0 KB → 25.8 KB（该安装里 39/52 会话同属一个项目，项目占比越分散收益越大）
- 侧栏不再需要全量列表：项目清单、项目身份、运行/未读徽标各有独立且更权威的来源
- 修掉两个按项目取数的既有缺陷（transient 被丢、`summary+projectKey` 恒空），
  它们此前不可见只是因为前端从没用过 `?projectKey=`

**负面 / 已知风险**

- 协议破坏性变更：`runningSessionIds` → `runningSessions`（M1 未对外发布，沿用
  ADR-0008「PROTOCOL_VERSION 暂不 bump」的先例；commit 以 `!` 标注）
- 侧栏多了一次 `POST /api/cwd/validate`（按 cwd 缓存、`staleTime: Infinity`）用于项目身份；
  它同时承担 allowed-roots 授权，本来就要调
- 删掉 `?summary=1` 与 `ProjectInfo.sessionCount` 都是协议收缩（前者是查询参数、后者是响应字段）；
  两者在仓内零消费方，但若将来有别的客户端在用，需要在同一 PR 里同步（M1 未对外发布）

## 验证记录

```bash
# 2026-09-27 · 真实 ~/.pi（52 会话 / 6 项目）+ 真浏览器（apps/web dev + server dev）
# CPU：summary=1 永不走缓存 ⇒ 每次都是真解析，用它量「扫描 + 解析」成本
# 注：summary=1 已于本 ADR 决策 6 删除；它当时不进缓存，正好用来量「扫描 + 解析」成本
GET /api/sessions?summary=1                              → 115.2 ms / 52 条
GET /api/sessions?summary=1&projectKey=/tmp/f1probe      →   2.1 ms /  1 条
GET /api/sessions?summary=1&projectKey=/private/tmp      →   1.9 ms /  3 条
# 稳态（指纹缓存命中）
GET /api/sessions                                        → 1.8 ms / 33.0 KB / 52 条
GET /api/sessions?projectKey=<pi-boat>                   → 2.1 ms / 25.8 KB / 39 条
# 前端：只有 scoped 请求，深链定位正确
? s=01a0e1a4-… 打开 → 请求序列仅含 /api/projects 与 /api/sessions?projectKey=…（无全量）
                       侧栏选中 ~/project/WebstormProjects/pi-boat main，并列出该会话

pnpm turbo run build test lint → 全绿（protocol 31 / core 213 / server 73 / client 104 / ui 19 / web 10）
pnpm --filter @ice-ai/web run test:e2e → 3/3
新增/更新测试：
  core  session-read-service.test.ts：projectKey 下推到扫描层（spy SessionManager.listAll 只碰该项目目录）、
        多范围缓存不串味、transient 参与项目过滤
  core  project-read-service.test.ts / protocol / server：summary 与 sessionCount 删除后各自断言更新
  core  project-read-service.test.ts：内存会话的 cwd 成为项目条目
  client  workspace.test.ts：projectKeyForCwd / getProjectActivity（running 按 cwd、unread 靠归属索引）
  protocol/server：runningSessions 字段与 /api/projects 的 transient 透传
```
