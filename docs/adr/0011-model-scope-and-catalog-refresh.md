# ADR-0011：模型可见范围（enabledModels）与目录刷新

- 日期：2026-01
- 状态：已接受（Accepted）
- 关联文档：`docs/02-protocol-inventory.md` §6.4；`docs/07-backend-capability-gap.md` §2 G2-2 / G2-3、§3.4、§6 B3
- 关联决策：ADR-0005 / ADR-0006（protocol 是唯一契约，形状进 protocol）；ADR-0007（**GET 不得有副作用**——本能力写设置，只能 PUT/POST）

## 背景

一期要给出「模型面板」：看得到模型、能开关可见范围、能测连通、能编辑 `models.json`、能拉取远端目录。
其中**可见范围（`enabledModels`）与目录刷新**是本仓文档完全没有登记的能力（`docs/07` G2-2 / G2-3），
但它是面板能否成立的前提：没有它，用户无法在 Web 上决定「哪些模型出现在选择器里」。

开工前核对了 0.87.1 的实际能力面（避免按想象写协议）：

| 事实 | 出处 | 含义 |
|---|---|---|
| `resolveModelScopeWithDiagnostics(patterns, modelRuntime, opts)` **存在** | `core/model-resolver.d.ts` | 作用域解析（glob / fuzzy / `:thinkingLevel` 后缀 / 诊断）**可直接委托 SDK**，不要自己实现匹配 |
| `getEnabledModels() / setEnabledModels(patterns)` **都在** | `core/settings-manager.d.ts` | 写入可直接走 setter（不必自己拼 settings.json）；但 **setter 只接受整份数组**，"最小编辑"仍须在本仓算好再交给它 |
| `withLock(scope, fn)` 在 **`SettingsStorage`** 上，**不在** `SettingsManager` 上 | 同上（`FileSettingsStorage` 实现它） | 没有 setter 的自由字段（如 `defaultTools`）要自己带锁改文件；锁约定是 `<file>.lock` **目录**（与 proper-lockfile 一致） |
| `getGlobalSettings()` / `getProjectSettings()` / `isProjectTrusted()` | 同上 | 项目级是否 shadow 了全局值可判定 |

## 决策

### ① 完整引擎（不做「整表重写」的简化版）

- **解析一律委托** `resolveModelScopeWithDiagnostics()`；本仓不写匹配逻辑
- **写入一律最小编辑**：只动用户真正切换的那一项覆盖到的 pattern，其余原样保留（包括**匹配不到任何模型的 pattern**、`:level` 后缀、用户手写的具名列表）；算好的数组经 `setEnabledModels()` + `flush()` 落盘
- **不得用 `getAvailable()` 枚举 provider 的模型**（不能只算"当前鉴权通过的"）：判断"是否全覆盖该 provider"要用 `getModels()` 的完整目录，否则缺凭据的模型会被误判为"不需要"而静默丢条目
- 一个 provider 被完全启用且条目 ≥ 2 时**收敛回一个 glob**（枚举列表会随模型改名腐烂，glob 会自愈）
- 禁用到最后一个模型 → `409 { reason: "last-model" }`（空列表在 pi 里等于「全开」，语义相反）
- 提供 `op: "prune"`（丢弃匹配不到的条目）与 `op: "resync"`（按新目录修复改名残留）两类**显式**修复操作；普通开关永不隐式重写未触碰的条目

### ② 写入位置：全局可写，项目级只读

- 默认写 `~/.pi/agent/settings.json`（经 `withLock('global', …)`）
- 项目 `.pi/settings.json` **存在 `enabledModels` 时整体替换而非合并**该字段 ⇒ 该场景下：
  - 响应带 `scope: "project"` + `settingsPath`，面板**只读渲染**并把实际生效的文件路径显示出来
  - 不写项目文件（写它会与 CLI 的语义打架，且需要信任前置）

### ③ 目录刷新：仅用户显式触发

- `POST /api/models/refresh`，body `{ provider?: string }`
- 只有**用户点按钮**才联网：该路径才允许网络；常规读取一律离线态（恢复已落盘的 overlay，不联网）
- `force: true`（跳过 SDK 的 4 小时新鲜度窗口），但**不覆盖** SDK 自身的离线规则——离线时返回 `reason: "offline"` 而不是假装刷过
- 按 provider **合并并发**刷新（两个标签页同按不可竞争同一个 store 文件）
- **变更检测比模型 id / name，不比存储字节**（每次 revalidate 都会重写 `checkedAt` / `etag`）
- 响应只说「跑没跑、变了没」，**不返回模型列表**——列表照常由 `/api/models` 与 `/api/models/enabled` 重新读取，避免第二份形状

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 委托解析 + **整表重写**写入 | ❌ 放弃 | 会踩两个实证坑（见下「已知陷阱」）：`getAvailable()` 只看**当前鉴权通过**的 provider ⇒ 静默删掉缺凭据 provider 的条目；glob 与 thinking pin 被拍平 |
| 只读展示 + 诊断，改由用户编辑 JSON | ❌ 放弃 | 用户必须自己懂 `provider/*` 与 `provider/**` 的差别；面板等于没做 |
| 不做可见范围，模型列表取全量 | ❌ 放弃 | 一期「模型面板」名不副实 |
| 启动时 / 定时刷新目录 | ❌ 放弃 | 启动变慢；定时会与 SDK 的 4 小时窗口和 `PI_OFFLINE` 打架，且引入并发写 store |
| 不刷新目录（只用 SDK 内置列表） | ❌ 放弃 | provider 新发布的模型永远看不见，要先去跑一次 CLI |

## 已知陷阱（实现时必须逐条对照）

1. **不要假设 `provider/*` 覆盖该 provider**：minimatch 的 `*` 遇 `/` 即停，嵌套模型 id（`commandcode/sakana/fugu-ultra`、多数 OpenRouter id）会漏。写 glob 前先用 `provider/*` 然后 `provider/**` 解析，**只有匹配集恰好等于该 provider 全部模型时**才写 glob；否则逐模型写
2. **不要整表重写**（同「备选方案」第一条）
3. **模式匹配连裸 modelId 一起匹配**：provider 改名会让某个 pattern 静默扩到别家模型；`resync` 必须先改 model 引用再改 provider 前缀，并**把前缀已不再覆盖它的条目砍回去**
4. **一个 provider 被整体启用时**，重命名单个模型可能让它掉出 `provider/*`（同样因为 `*` 遇 `/` 停），`resync` 要能检测并补回
5. 匹配不到的 pattern **默认保留**（用户可能是为将来准备的）；只有 `prune` 才丢

## 后果

**正面**

- 模型面板可落地；解析与 TUI 完全同源（都走 SDK 委托），不会出现「Web 与 TUI 看到的模型不一样」
- 不踩三个实证坑，不会静默删掉用户的选择

**负面 / 已知风险**

- 最小编辑逻辑必须自己维护并单测（展开 / 收敛 / 保留未匹配项 / `:level` 后缀保持）
- 写入是**有副作用**的 ⇒ 端点必须是 `PUT` / `POST`，不得设计成 `GET`（ADR-0007 硬约束）
- 面板必须区分三种「看不到」：**未启用**（pattern 没覆盖）、**缺凭据**（provider 未登录/无 key）、**目录里没有**（模型不存在）。混成一句「不可用」会让用户无从下手
- 离线环境下 `/api/models/refresh` 返回 `reason: "offline"`，前端要把它显示成提示而不是错误

## 验证记录

B3 已落地（2026-02），验证记录：
- 最小编辑单测：嵌套 id（全开收敛 `provider/**`、部分选中逐条写）、provider 改名 resync、`:level` 后缀保留、
  未匹配项默认保留（`prune` 才丢）、幂等（已在期望状态时原样返回）、新片段插在原 provider 片段处
- `models.json` 读写：BOM/注释/尾逗号宽容解析、坏文件**拒写**（`ModelsConfigReadError`）、cost 组补零、0600 原子写
- 路由层：`last-model` → 409 + `reason`、`project-shadow` → 409、离线 `reason:'offline'`、`force` 不覆盖 `PI_OFFLINE`
- 并发刷新合并（`refreshInFlight`）、变更检测比 id/name 不比存储字节

⚠️ 实现期修正（2026-02）：本文原写"`SettingsManager` 没有 `setEnabledModels()`"——**是错的**，
该方法存在（见上表）。`withLock` 也确实存在，但在 `SettingsStorage` 上而不是 `SettingsManager` 上。
