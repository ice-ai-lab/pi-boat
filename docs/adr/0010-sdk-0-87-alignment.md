# ADR-0010：pi SDK 从 0.85.x 对齐到 0.87.x

- 日期：2026-01
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §4（技术选型「Agent 底层」）、§8-7（SDK 快速演进风险）；`docs/02-protocol-inventory.md` §3.1 / §3.2 / §5.1；`docs/03-core-design.md` §4 / §7 / §10；`docs/06-ui-design.md` §11.2；`docs/07-backend-capability-gap.md` §2 G1、§6 B1
- 关联决策：ADR-0006（protocol 独立契约包——SDK 类型面变动不得外泄）
- 取代：AGENTS.md 原先的「SDK 版本锁 `0.85.x`」

## 背景

本仓自 M0 起锁 `~0.85.1`。一期要求后端能力面对齐到既有 Web 实现的水平，而该基线跑在
`0.87.1` 上：**0.86 起的若干语义改变了会话文件格式与 core 的投影、统计、状态读取方式**，
不升级就无法真正对齐（`docs/07` G1）。

升级前核对到的差异（逐文件 diff `0.85.1` / `0.87.1` 的 `.d.ts` 得出，非道听途说）：

| 类别 | 0.86 起的变化 | 对 core 的影响 |
|---|---|---|
| 消息联合 | 新增 `SystemMessage`（`role: "system"`） | prompt 段落 + 工具声明以 `message_start` / `message_end` 广播；每条携带完整 prompt 与全部工具 schema |
| 会话条目 | 新增 `UsageEntry`（`type: "usage"`，如 `kind: "cache_warm"`） | 不进模型上下文但计费；统计漏计会让 token / cost 与 SDK `/session` 不一致 |
| 会话条目 | 新增 `ContextEditEntry`（`type: "context_edit"`） | 省略/替换某条目的模型上下文，不改原始历史 |
| 会话条目 | `CompactionEntry.systemMessage?` | 压缩边界处附完整 prompt/工具状态 |
| 状态读取 | `agent.state.systemPrompt` 改为**转录回放**（从落盘 system 消息重建），且不可赋值 | 面板若需展示「实际下发的 prompt」，只能走 `before_agent_start` 覆写。**本仓已决定不做**（ADR-0015，2026-09-24 删除该覆写）：面板展示的就是 pi 的结构化渲染结果 |
| 新增 API | `buildSessionProjection()` / `ProjectedSessionEntry` / `SessionProjection`；cache warmer；boundary hooks | 可选能力，本 ADR 不采用（见「备选方案」） |

**不变的部分**（已核对，降低了升级风险）：
- `AgentEvent` / `AgentSessionEvent` 的**事件类型名与载荷形状无差异**——wire 投影的
  `switch` 分支不需要增删，事件快照回归因此能作为真正的护栏
- `AgentSession.getSessionStats()`、`getContextUsage()`、`SessionManager` 读原语、
  RPC 命令面均无破坏性变更

## 决策

**升级到 `~0.87.1`，并同步补齐三处语义缺口**（不补齐就是「编译通过但线上丢帧」）：

1. **protocol 补类型**（`domain/`）
   - `AgentMessage` 增 `SystemMessage`（八角色）
   - `SessionEntry` 增 `UsageEntry`、`ContextEditEntry`；`CompactionEntry` 增可选 `systemMessage`
   - 三者都必须进 schema：`GET /api/sessions/:id` 的 `tree` 会下发原始条目，
     schema 不认识它们会让整个响应校验失败
2. **wire 投影丢弃转录 system 消息**（`core/events/wire-event.ts`）
   - `message_start` / `message_end` 里整条丢（返回 null，不消耗 seq）
   - `agent_end.messages` 里过滤
   - 理由：尺寸随扩展/技能数量增长，且它不是对话内容；防御性丢弃与其他 null 分支同构
3. **历史路径同口径**（`core/read/session-read-service.ts`）
   - `context.messages` 投影跳过 system 消息（**平行数组 `entryIds` 同步跳过**，
     否则前端按索引匹配 toolResult 会错位）；原始条目仍留在 `tree` 里
   - `computeStats` 计入 `usage` 条目
   - 两个路径必须一致：只丢一侧会出现「实时看不到、刷新后冒出来」

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 留在 0.85.x | ❌ 放弃 | 会话文件格式已是 0.87 的（pi CLI 与既有 Web 实现都在写）；留着就读不懂 `usage` / `context_edit` 条目，也无法对齐一期能力面 |
| 升到最新（越过 0.87） | ❌ 放弃 | 0.87.1 是当前稳定面；越过它等于把「对齐基线」换成「追最新」，与一期目标不符 |
| 采用 `buildSessionProjection()` 重写历史装配 | ⏸ 延后 | 它把「模型看到什么」的投影做成了一等 API，但本仓历史浏览刻意要「发生过什么」（`docs/03` §7.1 的分页不做压缩过滤），两者语义不同。等上下文编辑真要在 UI 上呈现时再评估 |
| 把 system 消息进 wire、由前端过滤 | ❌ 放弃 | 每条携带完整 prompt 与全部工具 schema，等于把最大的那块载荷推给浏览器（`docs/07` G1 的原始理由） |
| 给 `SystemMessage` 做完整 schema（含 `toolsAdded.tools[]` 全量建模） | ❌ 放弃 | 工具定义形状由扩展约定且不进 UI；建模等于自愿跟一份会变的扩展类型面耦合。按 `z.array(z.unknown())` 收口，只保证可解析 |

## 后果

**正面**

- 能读懂并正确处理 0.86 起的会话文件（`usage` / `context_edit` / `systemMessage`），
  与 pi CLI 及既有会话继续互见
- wire 上不再出现携带全部工具 schema 的 system 消息；实时与历史两条路径形状一致
- token / cost 统计与 SDK `/session` 对齐（缓存预热不再漏计）
- 事件类型面无差异 ⇒ 事件快照回归测试仍是有效护栏，后续升级有可比的基线

**负面 / 已知风险**

- **`systemPrompt` 语义变了**：`agent.state.systemPrompt` 现在是转录回放，不等于
  某次请求实际下发的 prompt。系统提示词面板要显示「实际下发的」，需走
  `before_agent_start` 覆写（`docs/06` §11.2）——**本仓已决定不做，该覆写已于 2026-09-24 删除（ADR-0015）**
- `messageCount` 口径变化：转录 system 消息计入 `messageCount`（与 SDK 一致），
  但它是消息条目而非可见消息——前端不得用 `messageCount` 当「对话轮数」
- **两处只靠真机验证的遗留项**（单测覆盖不到，列入 B1 验收尾巴）：
  1. ~~系统提示词面板显示的仍是实际下发的 prompt 吗（需跑一轮会话比对）~~ —— **已作废**：
     本仓不做精确覆写，面板展示的就是 pi 的结构化渲染结果，不再存在「两者是否一致」的问题（ADR-0015，2026-09-24）
  2. 真实会话流里 system 消息确实被丢弃且历史/实时形状一致（需开一次带扩展的会话观感核对）
- 0.87 的 `agent-session` 引入了一批新扩展事件（`AgentBeforeSettleEvent`、
  `CacheWarmingDecisionEvent`、`MessageEndEventResult` 等）。本仓不订阅这些扩展面，
  但**将来接扩展 UI 通道时必须重新核对**（ADR-0012 范围）
- 版本锁随之改为 `0.87.x`（AGENTS.md），下次升级仍走「单独 PR + 新 ADR + 全量回归」

## 验证记录

```bash
# 升级前性质核对（逐 .d.ts diff，确认事件面稳定、条目面变化）
diff <(0.85.1 dist/**) <(0.87.1 dist/**)
  → AgentEvent / AgentSessionEvent 事件名与载荷无差异
  → session-manager.d.ts：+UsageEntry +ContextEditEntry +CompactionEntry.systemMessage
  → pi-ai types.d.ts：+SystemMessage

# 落地后门槛（全绿）
pnpm turbo run build test lint typecheck
  → 20/20 tasks；core 73 用例 / server 30 / protocol 30

# 新增回归覆盖
packages/protocol/test/domain.test.ts        → 八角色消息 + 十一类条目（含 usage/context_edit/systemMessage）
packages/core/test/wire-event.test.ts        → system 消息丢弃（message_start/end 返回 null；agent_end 过滤）
packages/core/test/session-read-service.test.ts → context 跳过 system（entryIds 不错位）；usage 计入 token/cost
```

**待补的真机验证**（见「后果」第二条）——不阻塞本次提交，但必须在 B1 收尾前完成。
