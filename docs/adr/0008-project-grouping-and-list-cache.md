# ADR-0008：项目分组（projectKey 归一）与会话列表缓存——列表性能分层

- 日期：2026-09-22
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §5.6；`docs/02-protocol-inventory.md` §6.1 / §9；`docs/04-server-design.md` §3 / §9
- 关联决策：ADR-0007（本机鉴权无凭据，GET 不得有副作用）

## 背景

会话在磁盘上按 cwd 分目录存放：`~/.pi/agent/sessions/<encoded-cwd>/<ISO 时间戳>_<id>.jsonl`。由此产生两个问题：

**1. 前端没有可靠的分组依据。** `SessionInfo` 里已有 `projectRoot` / `projectKey` / `branch` / `isWorktree` 字段，注释写着「服务端计算」，但 M1 的 `toWireInfo()` 从未填过——M1 只做磁盘只读，没接 git。前端只能按 `cwd` 字符串分组，于是同一个 git 仓库会被拆成多个"项目"。本机实测：7 个会话目录里 `pi-boat` 与 `pi-boat/packages/core` 就是同一个项目的两个目录。

**2. 全量列表的成本无上界。** 本机实测（32 会话 / 7 目录 / 15.7 MB）：

| 操作 | 成本 |
|---|---|
| 读 `SessionManager.listAll()`（SDK 解析每个 .jsonl 头尾） | **57–110 ms**（≈2.5 ms/会话，随会话数与文件体量线性增长） |
| 目录元数据扫描（readdir + 每文件 stat） | **0.15 ms** |
| 每目录读一次首行头取 cwd | < 1 ms |

同时 `docs/02` §6.1 自陈：`registryVersion` 只反映运行时注册表，磁盘侧变化（其他进程写入、改名、首条消息落盘）**在协议里没有表达**，客户端只能靠全量重刷——既贵又可能看到陈旧内容。

### 命名考古（避免重踩）

这个坑已经出现过一次：2026-09-21 的 `36720e9` 把 `sessionListVersion` 改名为 `registryVersion`，理由原文是「**旧名字暗示它能代表“列表内容变了吗”**」，而它只是个 `create`/`dispose` 计数器；该提交把「跨进程/磁盘侧的变更通知机制」明确**推迟到 M2**，并在 protocol schema 与 `docs/02` §6.1 写下三类漏检场景。

本 ADR 实现的正是那件被推迟的事。**字段名刻意不叫 `listVersion`（更不叫 `sessionListVersion`）**：

1. 那个名字已被以“名字不诚实”为由否决，不应复活；
2. 目录指纹**没有单调性**（文件回退会变回旧值），不是版本号，只能比较相等——叫 `version` 是同一类“名字暗示了它做不到的事”的错误。

因此定为 `listFingerprint`，并在 schema 注释里写明“不透明、无单调性、只比较相等”。

另有一个被否决的选项值得记录：「全量会话列表 + 客户端推导项目清单」。推导要求列表**全量且不分页**，因此**分页与客户端推导互斥**——一旦分页，项目清单就残缺且随活跃会话漂移。

## 决策

**项目成为服务端计算的一等分组键，列表按"目录指纹"缓存，三层成本解耦。**

### 1. `GET /api/projects`：项目清单（新端点，不分页）

- 数据源是**目录元数据**：`readdir` 会话根目录 + 每目录 `readdir` + 每文件 `stat` + **每目录读一次最新会话文件的首行头**取 cwd。不解析会话正文。
- 按 `projectKey` **合并**多个会话目录：同一仓库的子目录与 worktree 属于同一项目，`cwds` 列出全部目录，`cwd` 取最近有活动者，`sessionCount` 求和。
- 顺序按 `lastModified`（文件 mtime，无需解析）降序。
- **不分页**：量级 10¹，全量约 1.8 KB / 3–7 ms（实测）。分页在这里是负收益。
- **空会话目录不出现**（目录名编码有损：`pi-boat/packages` 与 `pi-boat-packages` 同码，无法可靠反解 cwd）。

### 2. `projectKey` 归一（core `ProjectResolver`）

`git -C <cwd> rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir --abbrev-ref HEAD`：

- `projectRoot` = realpath(show-toplevel)；`git-dir ≠ git-common-dir` ⇒ worktree，`projectRoot` = dirname(common-dir)
- `projectKey` = `projectRoot` 的跨平台归一（Windows 大小写/分隔符不敏感）
- 非 git 目录 / cwd 已删除 / 无 git：回落 `cwd`，`isGit: false`——不报错，列表仍可用
- 按 cwd 缓存 **60s**；`force=1` 时清空

同一解析器同时用于会话列表与会话清单 ⇒ 两处 `projectKey` **按构造一致**（前端分组与 projectKey 过滤不会错位）。

### 3. 列表缓存：目录指纹（而非 TTL）

`SessionReadService` 用**目录指纹**（所有项目目录名 + 每个 .jsonl 的 `size` + `mtime`，成本 0.15 ms）作缓存键：

- 命中 → 直接返回缓存（实测 75 ms → 3 ms）
- 未命中 → 跑 `listAll` 重新解析
- 因为键就是"内容指纹"，磁盘侧任何增删改（含**其他进程**写入、追加写入、改名）都自动失效，**不需要 TTL 也能保证不返回陈旧结果**
- 指纹同时作为响应字段 `listFingerprint` 下发：客户端据此判断"列表内容变了吗"（与只反映注册表的 `registryVersion` 互补）
### 4. `GET /api/sessions` 新增查询参数（非破坏）

- `?projectKey=<key>`：只返回该项目的会话（选中项目后 payload 从全量降到单项目）
- `?force=1`：跳过缓存并清空项目解析缓存（此前该参数收了但被忽略）

### 5. 不分页（明确推迟）

会话列表仍是全量。理由：

- 列表缓存已把稳态成本降到 3 ms；`?projectKey=` 又把单次 payload 收敛到一个项目
- 分页的正确轴是**项目内**（跨项目按 modified 全量分页会随活跃会话漂移，导致重复/漏项），而这需要先有稳定的游标语义
- 触发条件（写进 `docs/02` §9 决策表）：会话量到 10³–10⁴ 且实测单请求 > 100 ms，或单次 payload > 1 MB。届时按 `?projectKey&cursor&limit` 切，游标取目录内文件名时间戳（单调，天然稳定）

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 维持 M1（前端按 cwd 分组） | ❌ 放弃 | 子目录/worktree 会被拆成多个项目；且客户端无从获得 git 分支等元数据 |
| 纯客户端推导项目清单 | ❌ 放弃 | 与分页互斥；且推导要在客户端重写归一逻辑（含 git），两面重复 |
| 项目清单分页 | ❌ 放弃 | 量级 10¹，全量 1.8 KB；分页只增加游标语义 |
| 空目录也进项目清单 | ❌ 放弃 | cwd 只能靠有损目录名反解，宁可漏报不可错报；将来若要在 UI 显示"空项目"，需要独立存储或按名字反解并显式标注为不可信 |
| 项目做成独立实体资源（可改名/归档/删除） | ⏸ 延后 | 一旦要用户操作就必须引入存储（`docs/01` §9-6 SQLite 待定项的真实触发条件）；当前项目是会话目录的派生视图，派生是廉价且无边界语义的 |
| 缓存用 TTL（列表 30s + git 60s） | ❌ 放弃 | TTL 到期必须全量重扫（10³ 会话时每次卡 ~2.5 s），且窗口内会返回陈旧结果；指纹键两者都避免。补充：本仓 `registryVersion` 是**注册表结构性变动计数器**（仅 create/dispose 时 +1），同样不反映跨进程写入——`listFingerprint` 正是为补齐该语义而存在（`docs/02` §6.1「两个版本号分工」） |
| 沿用 `listVersion` / `sessionListVersion` 命名 | ❌ 放弃 | 见上面「命名考古」：该名字于 `36720e9` 因“名字暗示了它做不到的事”被否决；且指纹无单调性，叫 version 是重蹈覆辙（AGENTS.md 代码规范“命名不得暗示做不到的事”，本次为第二例） |
| 给列表加 `listFingerprint` 之外的失效推送（SSE/fs.watch） | ⏸ 延后 | 客户端已有轮询与指纹比对，够用；引入 watch 需要处理跨平台与 watcher 泄漏 |
| 引入 SQLite 索引 | ⏸ 延后 | 指纹缓存已把稳态成本压到 3 ms；索引的价值要到 10⁴ 会话 + 全文搜索（M3）才显现 |

## 后果

**正面**

- 同一仓库的 worktree/子目录正确归组：本机 7 个会话目录 → 5 个项目（`pi-boat` 与其 `packages/core` 合并为 `cwds: 2 / sessionCount: 14`）
- 列表稳态成本 75 ms → **3 ms**（24×），且对磁盘侧变更的失效是**自动**的（无需客户端配合、无 TTL 窗口）
- `listFingerprint` 补上了 `registryVersion` 缺的那一半语义（"列表内容变了吗"）
- 前端不需要任何归一逻辑，只需按 `projectKey` 分组 + `?projectKey=` 拉取
- 分页得以推迟（有明确触发条件，非遗忘）

**负面 / 已知风险**

- 列表项变大：每条会话多 4 个字段（`projectRoot`/`projectKey`/`branch`/`isWorktree`），32 会话实测 16 KB → 21 KB（+30%）。规模上去后靠 `?projectKey=` 与将来的分页收敛
- 每个 distinct cwd 一次 git 子进程（60s 缓存）；cwd 很多时首次请求会有几百毫秒尖刺。当前实测 5 个项目首次 ~7 ms（多为并行）
- 目录名编码有损，因此 `ProjectDirScan.dirName` 只用于诊断与指纹，**不得**作为 cwd 来源
- 布局假设：SDK 默认布局下"一个目录 = 一个 cwd"。若某目录混入多个 cwd，项目清单只报最新那个（权威判定仍在会话列表的 `projectKey` 过滤）
- `published 契约`：`SessionListResponse.listFingerprint` 为必填字段、`/api/projects` 为新端点 → 破坏性协议变更，commit 用 `!` 标注；`PROTOCOL_VERSION` 沿用 shell 直连移除（`28b50dd`）的先例暂不 bump（M1 未对外发布，见 ADR-0007 同款说明）

## 验证记录

```bash
# 2026-09-22 · PORT=9603 node --import tsx src/main.ts（真实 ~/.pi 会话目录）
GET /api/projects                     → 5 个项目 / 1797 B / 3–7 ms
  pi-boat 与 pi-boat/packages/core 合并：cwds=2, sessionCount=14, branch=main
  --tmp--（空目录）被跳过；PI-TMP（非 git）：isGit=false
GET /api/sessions                     → 冷 75 ms（21372 B）→ 热 3.0/2.8 ms（指纹命中）
  另起进程写入新会话文件 → listFingerprint 改变、33 条；删除 → 再次改变、32 条（自动失效）
GET /api/sessions?projectKey=<pi-boat> → 14 条，projectKey 全部一致
GET /api/sessions?force=true          → 400 `force: Invalid input: expected "1"`

pnpm turbo run build test lint → 全绿（protocol 30 / core 67 / server 30 用例）
新增测试：core/test/project-resolver.test.ts（真实 git：仓库根收敛、worktree 归属、
分支、非 git 回落、已删除目录、60s 缓存与 clear）；session-read-service.test.ts
（项目合并/空目录跳过/排序、指纹失效、projectKey 过滤、缓存复用与 force 重建）；
server 路由用例（/api/projects、?projectKey、?force 透传与 400）
```
