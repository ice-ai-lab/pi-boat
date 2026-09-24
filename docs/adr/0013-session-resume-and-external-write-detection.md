# ADR-0013：冷会话恢复语义与外部写入检测

- 日期：2026-01
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §5.3（会话生命周期）；`docs/02-protocol-inventory.md` §6.1 / §6.2；`docs/04-server-design.md` §5.3（第 3 条关流路径）、§8-8；`docs/07-backend-capability-gap.md` §2 G2-5、§3.1、§3.3、§6 B4
- 关联决策：**ADR-0007（GET 不得有副作用）——13a 的决定完全由它推出**；ADR-0008（列表指纹缓存，外部写入检测与它互补）

## 背景

两个问题在 M1 是**有意搁置**的，一期必须收口（`docs/07` G2-5 与 §3.1 的语义缺口）：

1. **冷会话不恢复**：`GET /api/agent/:id/events` 对不在注册表的会话直接 404（`docs/04` §5.3 关闭条件 3）。
   后果是「历史会话只能看，不能续聊」——而续聊是一期核心能力。
2. **外部写入不可见**：终端 `pi` CLI 与 server 可能读写同一个 `.jsonl`（`docs/01` §8-10 用 proper-lockfile
   协调了**写**，但没有处理「磁盘已变、内存 runtime 还是旧的」）。用户会看到「终端里改过的会话，Web 上是旧内容」。

核对了 0.87.1 的恢复原语：`AgentSessionRuntime.switchSession(sessionPath, options?)` 与
`CreateAgentSessionOptions.sessionManager?` 都在，两条路都能从既有文件重建 runtime。

## 决策

### 13a 恢复走**显式端点**，不在建流时隐式创建

- 新增 `POST /api/agent/:id/resume`：从 `.jsonl` 重建 runtime 并登记进注册表，返回 `{ok, sessionId}`
- `GET /api/agent/:id/events` 保持现状（不在注册表 → 404），**不**改成「连接即隐式创建」
- 前端流程：打开历史会话 → 先 `POST …/resume` → 再连 SSE（`EventSource` 不能带 body，所以必然两步）

### 13b 外部写入检测只在**全量读**路径做

- 触发点：会话挂载 / `?force=1` 的全量读（`GET /api/sessions/:id`）
- 判定：比较 session 文件的 `size + mtime`（必要时加 `ctime`）与 runtime 建立时的记录
- 落后 → **丢弃并重建 runtime**（从磁盘重新打开），响应带 `wrapperRebuilt: true` 供前端重新拉历史
- **run 期间不检测**：`isStreaming || isPromptRunning` 为真时跳过检测

## 理由

**为什么恢复是显式 POST 而不是隐式建流**：隐式创建会让 `GET /api/agent/:id/events` 变成**有副作用的 GET**
（建 runtime、写注册表、可能落盘），直接违反 ADR-0007 的硬约束。那条约束不是洁癖——它是删掉 token 之后
**唯一**的安全兜底：无 Origin 的跨站 GET 不再有凭据拦截，一个有副作用的 GET 可以被任意网页直接利用
（`docs/04` §6 检查清单第 ④ 条）。代价只是前端多一次显式调用，换取后续每个 GET 都不必再论证无副作用。

**为什么外部写入只在全量读检测**：每轮都检测的成本可以忽略（一次 `stat`），但危险在于
**run 期间换掉正在跑的 runtime 会丢流**（事件订阅指向死对象、半截消息丢失）。用「读数可能短暂陈旧」
换「正在跑的任务不被换掉」，这个取舍方向是明确的；「两个进程同时写同一 JSONL」本身也不受支持。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| **隐式恢复**（建 SSE 流时自动重建 runtime） | ❌ 放弃 | 让 GET 产生副作用，推翻 ADR-0007 的硬约束；一旦破了，后续所有 GET 都要重新论证，设计自由度被吃掉（参见：既有实现用 token/cookie 鉴权，所以才敢这么做） |
| 保持 404，不做恢复 | ❌ 放弃 | 「续聊」是一期核心能力，缺了就只是历史浏览器 |
| 恢复放进 `POST /api/agent/new` 的 `type` 变体 | ❌ 放弃 | 语义是「新建」与「接续既有会话」两件事（前者要 cwd/模型，后者要 sessionId）；混在一个端点会让信封与错误码都变糊 |
| 每轮读都检测外部写入 | ❌ 放弃 | 会在 run 期间换掉正在跑的 runtime ⇒ 丢流，比读到陈旧内容严重得多 |
| 不检测，只靠 proper-lockfile 写锁 | ❌ 放弃 | 锁只解决并发**写**的互斥，解决不了「内存索引 vs 磁盘内容」的一致性 |
| `fs.watch` 常驻监听 | ⏸ 延后 | 最准，但要处理跨平台差异、watcher 泄漏、以及「刚重建又被下一次事件触发」的抖动。触发条件：实测到用户频繁遇到陈旧视图 |
| 检测到外部写入时**只重读磁盘、保留 runtime** | ❌ 放弃 | 会把内存与磁盘撕成两个真相；要么整体重建，要么完全不管 |

## 后果

**正面**

- 「点开历史会话接着聊」成立，且没有破坏 GET 无副作用这条安全约束
- 终端 pi 改过的会话在 Web 端刷新后能看到最新内容，不会长期显示陈旧版本
- 两条能力都不需要新依赖

**负面 / 已知风险**

- 前端多一次调用（`resume` → `events`），且**必须先 resume 再建流**；顺序错了会拿到 404（要在 client 封装里固化这个顺序）
- run 期间的外部写入不会被察觉（有意为之）：终端与 Web 同时改一个会话时，Web 侧要到下一次挂载/强制刷新才对齐
- 重建 runtime 会丢弃内存态（进行中的半截消息、队列、扩展状态）；因此**只在明确不在 run 中时重建**，`wrapperRebuilt` 必须回传，前端据此重拉历史
- `resume` 与 `POST /api/agent/:id` 命令通道共用注册表，要注意「resume 与 prompt 并发」时的 FIFO 语义（同一会话命令串行，resume 也是命令）

## 验证记录

待 B4 落地时补：冷会话 `resume` 后可续聊（建流成功且历史完整）、未 resume 直接建流仍 404、
并发 resume 去重（复用既有启动锁）、`force=1` 触发外部写入检测并带 `wrapperRebuilt`、
run 期间检测被跳过（`isStreaming` 时不重建）。
