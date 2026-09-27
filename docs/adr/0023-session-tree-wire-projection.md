# ADR-0023：会话树改为 wire 投影——分支导航只要 id/角色/预览，不要整条 entry

- 日期：2026-09-26
- 状态：已接受（Accepted）
- 关联文档：`docs/02-protocol-inventory.md` §3.3 / §6.2、`docs/03-core-design.md` §7、`docs/05-client-design.md` §7、`docs/06-ui-design.md`（BranchNavigator）
- 关联决策：ADR-0017（SDK 类型即协议——本 ADR 是它的**一处显式例外**并说明理由）、ADR-0020（视觉基准设计规范）

## 背景

`GET /api/sessions/:id` 的 `tree` 字段此前是 `SessionTreeNode = SdkSessionTreeNode`（ADR-0017
直接转出 SDK 类型），而 SDK 的树节点带**整条 entry 原文**：assistant 消息的 thinking、toolCall
的完整 arguments、toolResult 的全文与内联图片 base64 全在里面。

本机实测（2026-09-26，2.2 MB 的会话文件 / 457 个树节点）：

| 字段 | 体积 | 占响应 |
|---|---|---|
| `tree` | **2.20 MB** | **90 %** |
| `context` | 0.22 MB | 9 % |
| 其余（info/stats/leafId） | < 1 KB | — |

平均 **4.8 KB/节点**，而客户端从树里实际只读三样东西：

- `entry.id` —— 点选分支要切换到的叶节点（`onLeafChange` → `navigate_tree`）
- `children` —— 分支数与层级
- message 条目的 `role` + 前 40 字文本 —— 分支标签与 `U`/`A` 徽章

同一份数据在 `context` 里**已经发过一次**（历史消息，带 `tail` 分页），树的副本纯属冗余。
对照：上游参考实现 的同字段投影后只有 8.5 KB。

## 决策

**`tree` 改为协议自持的投影类型，不再直接复用 SDK 的树节点。**

```ts
// protocol/src/domain/session-info.ts
export type SessionTreeEntry = {
  id: string;
  /** SDK 条目判别字段（message / compaction / model_change / custom / …） */
  type: SdkSessionEntry['type'];
  /** 仅 message 条目：角色 + 标签文本（≤40 字预览；空文本按角色回退为 `[assistant]`） */
  message?: { role: AgentMessage['role']; text: string };
};
export type SessionTreeNode = { entry: SessionTreeEntry; children: SessionTreeNode[] };
```

- **core 拥有投影**：`toWireSessionTree()`（`read/session-read-service.ts`，与 `computeStats`
  同款「导出纯函数 + 测试锁口径」），`detail()` 用它替换 `manager.getTree() as SessionTreeNode[]`。
  与事件流同一条原则：SDK 形状不许直接出门（`toWireAgentEvent` 的先例）。
- **UI 相应简化**：`branch-navigator.tsx` 的本地 `BranchTreeNode`（曾为「设计规范的
  `branchPreview` / `compressedEntryIds`」预留两个**从未有人发送**的可选字段）删除，
  直接用协议类型；链压缩（`+N`）与标签仍由客户端 `compressChain()` 算——协议不重复做。
- **放弃 SDK 的 `label` / `labelTimestamp`**：客户端从来没有读过（分支标签是前端算的）。

## 备选方案与被否理由

| 候选 | 结论 | 理由 |
|---|---|---|
| 保持 SDK 原文树（现状） | ❌ 放弃 | 2.2 MB/次、每次切换都传一份 context 的副本 |
| 只发 `hasBranches: boolean`，树按需另拉 | ❌ 放弃 | 多一个端点的游标/缓存语义；投影后整棵树才 ~70 KB，不值 |
| 学 参考实现 连**链压缩**一起做在服务端（`compressedEntryIds` + `branchPreview`） | ❌ 放弃 | 本仓客户端已有 `compressChain()` 现成实现（`+N` 计数与标签都在那），服务端再压一次就是第二份实现；压链只省几十 KB |
| 树里保留 `parentId` / `timestamp` | ❌ 放弃 | 父子关系由 `children` 嵌套表达、时间戳无人消费——零调用方的字段不加 |
| 继续用 `SdkSessionTreeNode` 但 `Omit` 掉重字段 | ❌ 放弃 | `Omit` 只改类型不改运行时（entry 仍带着全文），且投影逻辑无处安放 |

## 后果

**正面**

- `GET /api/sessions/:id`：2.4 MB → **~0.3 MB**（tree 2.20 MB → ~70 KB），服务端
  `JSON.stringify` 与浏览器 `JSON.parse` 的 CPU 同步下降
- 协议不再泄漏 SDK 条目形状：SDK 加字段（如新增 entry kind）不会自动放大我们的 payload
- 客户端少一层「设计规范预留字段」的容错分支（协议即形状）

**负面 / 已知风险**

- **破坏性协议变更**：`SessionTreeNode.entry` 从 SDK 条目变成投影条目 → commit 用 `!` 标注；
  `PROTOCOL_VERSION` 沿用 M1 未对外发布的先例暂不 bump（同 ADR-0008/0022 的说明）
- 这是 ADR-0017「SDK 类型即协议」的**显式例外**：判据是「SDK 形状里带着我们不要的 MB 级数据」。
  将来再遇到同类只能靠投影解决的分歧，按本 ADR 的先例逐条记录，不批量推翻 0017
- 树上的分支标签是**服务端算的 40 字预览**：改口径要动 core（已由单测锁定）
- `context` 仍是当前页面的最大块（本机实测某页 1.32 MB，其中一张内联图片 1.13 MB）——
  那属于 `deferMedia` 的缺口，另案处理

## 验证记录

```bash
# 2026-09-26 · 本机真实会话（2.2 MB / 457 个树节点）
GET /api/sessions/01a0d984-…（2.2 MB 会话 / 457 个树节点）
  修复前：2 487 KB（tree 2 202 KB = 90%）
  修复后：  289 KB（tree    58 KB，127 B/节点）—— 树缩小 38×，整个响应缩小 8.6×
  延迟（本机 median of 7）：110–145 ms → 15.7 ms（其中明细投影本身 ~1 ms）
GET /api/sessions/01a0b932-…（2.8 KB 会话）：2.3 ms（树本来就小）
core 单测：投影只留 id/type/message、thinking 与工具参数不进树、40 字截断 + 空文本回退
          （`session-read-service.test.ts`）；协议形状由 domain/rest 快照用例锁定
真浏览器：有分支的会话（01a0dde0-…，树里有一处 2 分支）打开分支面板，标签/`U` 徽章/`+N` 链压缩
          渲染与投影前一致
pnpm turbo run build test lint + web e2e → 全绿
```
