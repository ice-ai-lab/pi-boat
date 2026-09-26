# ADR-0024：图片惰性化（`deferMedia`）——空 data 占位 + 按坐标取字节

- 日期：2026-09-26
- 状态：已接受（Accepted）
- 关联文档：`docs/02-protocol-inventory.md` §6.2 / §6.3、`docs/03-core-design.md` §7.2、`docs/04-server-design.md` §8-3、`docs/05-client-design.md` §6
- 关联决策：ADR-0017（SDK 类型即协议——本 ADR 不新增内容块类型，正是为了不打破它）、ADR-0009（前端经 `/api` 同源；图片 URL 必须带前缀）

## 背景

`SessionContextQuerySchema.deferMedia` 自 M1 起就声明了，但 core 一直没实现（`docs/03` §7.2 原文：
「`deferMedia` 占位符形状待后续定（历史图片全文直发）」）。后果是**历史页里所有图片都以
base64 全文直发**：

| 实测（2026-09-26，本机 2.2 MB 会话的一次「加载更早」） | 体积 |
|---|---|
| 整页响应 | 1 321 679 B |
| 其中一条 user 消息（两张 3698×1852 截图，附件） | **1 132 402 B（86 %）** |
| 其余 95 条消息合计 | 189 KB |

而前端当时**根本不渲染历史图片**（`docs/10` C12/C15 记为 P1 缺口），也就是说这 1.13 MB 是
纯粹的白传。另一个入口是详情里的 `context`（第一页），图片同样全文直发。

## 决策

**1. 占位形状：图片块留在原位、把 `data` 擦成空串，不引入新的内容块类型。**

```jsonc
// deferMedia=1 时
{ "type": "image", "data": "", "mimeType": "image/png" }
```

- **块与块下标不变** ⇒ 取数坐标可推：`context.entryIds[i]`（消息与条目是平行数组）+ 消息内
  块下标。`sessionEntryToContextMessages()` 对 message 条目是**原样透传**，所以这个下标与文件里
  `entry.message.content` 的下标一致，正是服务端取图要的下标（否则会取错块）。
- **不新增 `DeferredImage` 块类型**：那要给 `AgentMessage` 的八角色联合做条件类型改造
  （`content` 数组里塞进非 pi-ai 的块），代价与风险都远大于收益；空 `data` 在 base64 里不是
  合法图片，与「有字节」不会混淆（AGENTS.md 简单优先）。
- 实时路径（流式 wire 事件）**不擦**：那份数据当场就要渲染。

**2. 生效方式：`?deferMedia=1`（详情与分页各自可选）。**

- `GET /api/sessions/:id?deferMedia=1`（新增参数；详情里的 `context` 往往就是图片最大的那一页）
- `GET /api/sessions/:id/context?...&deferMedia=1`（既有参数，语义与上一致）
- 缺省仍是全文直发：老客户端/老行为不变，本仓前端一律带 `1`

**3. 取数端点收拢为「任意角色的图片」：`GET /api/sessions/:id/entries/:entryId/image?blockIndex=N`。**

原路径 `.../tool-result-image` 只服务 `role === "toolResult"`，而实测最大的那块是**用户附件**。
core 的 `toolResultImage()` 随之改名 `entryImage()`（放宽角色判定），路由同步改名——该端点当时
**没有任何客户端调用方**（grep 全仓为空），改名不欠兼容债。

**4. 前端把图片变成「可渲染 src」，而不是把 base64 一路带到组件。**

`packages/client/src/stream/image-src.ts` 的 `messageImageSrcs()` 是唯一判别处：

| 输入 | 输出 |
|---|---|
| `data` 非空 | `data:<mime>;base64,…` |
| `data` 为空 + 拿到坐标 | `/api/sessions/:id/entries/:entryId/image?blockIndex=N` |
| `data` 为空 + 没坐标 | 跳过该项（宁可不显示，也不发坏 URL） |

视图模型的 `Turn.user.images` 与 `ToolRow.images` 因此**从 base64 改为 src**（历史重建时带
会话 id，实时折叠时不需要）。`ui` 侧新增 `ChatImageList`（240×240 + 新标签打开原图）挂到用户
气泡与工具行展开体——顺手把 `docs/10` C12/C15 的「历史图片不渲染」补了一半（灯箱仍是 T3-9）。

⚠️ 该 URL 会直接进 `<img src>`，**必须自带 `/api` 前缀**（不经过 axios 的 baseURL）。少前缀时
dev 下会被 vite 的 SPA fallback 吃掉：回 200、内容是 index.html、图片静默不显示（2026-09-26 实测踩到）。

## 备选方案与被否理由

| 候选 | 结论 | 理由 |
|---|---|---|
| 维持全文直发 | ❌ 放弃 | 一页 1.13 MB 的白传（前端当时还不渲染） |
| 新增 `DeferredImage` 块类型（自描述坐标） | ❌ 放弃 | 要为八角色联合做条件类型改造；坐标可由平行数组推出，不值得 |
| 直接把图片块**丢掉**，不提供取数 | ❌ 放弃 | 信息不可恢复（导出/将来的灯箱都要它）；也让 `deferMedia=false` 这条退路失去意义 |
| 只按 参考实现 的做法服务 `toolResult` | ❌ 放弃 | 实测最大的一块是用户附件，只做工具结果等于没解决 |
| 前端 `deferMedia=0` + 自己按需请求整页 | ❌ 放弃 | 想要一张图得重下整页（图片正是页面的大头） |
| 顺手把灯箱（T3-9）一起做 | ⏸ 延后 | 视觉规范件是独立任务（`image-preview-dialog`），本次只保证「能看见、能打开原图」 |

## 后果

**正面**

- 实测同一页 1 321 679 B → **189 375 B**（7×），且 payload 里不再出现 base64
- 图片渲染能力从「有字节但不渲染」变成「按需取字节并渲染」：用户附件与工具结果图都能看见
- 端点收拢成一个，语义比 `tool-result-image` 准确（任意角色）

**负面 / 已知风险**

- 空 `data` 是**约定**而非类型：将来若有人新建一个消费 `context.messages` 的渲染器，必须知道
  「`data === ''` 表示按坐标取数」（已写进 protocol schema 注释、docs/02 §6.3、本文）
- 图片变成按张的额外请求：一页 N 张图 = N 个请求（浏览器并发 + 缓存；图未被渲染就不请求）
- 「一条消息内块下标」这条不变量依赖 SDK 的 `sessionEntryToContextMessages()` 对 message 条目
  原样透传——SDK 升级时若改变该行为，取图会错块（core 单测锁定「擦除后块位置与下标不变」；
  SDK 升级回归里应重跑）
- 破坏性路由改名（`/tool-result-image` → `/image`）：M1 未对外发布，`PROTOCOL_VERSION` 沿用先例不 bump

## 验证记录

```bash
# 2026-09-26 · 本机（会话 01a0d984-…，一页含两张用户附件截图）
GET /api/sessions/:id/context?before=…&tail=50                → 1 321 679 B
GET /api/sessions/:id/context?before=…&tail=50&deferMedia=1     →   189 375 B（图片块 data:""，下标 1/2 不变）
GET /api/sessions/:id/entries/9cf622a2/image?blockIndex=1       →   200 image/png 418 644 B（3698×1852）
GET …/entries/3dda1e6a/image?blockIndex=1（工具结果图）          →   200 image/png  73 677 B
真浏览器（Playwright，dev 9528）：
  用户气泡两张附件 → <img> naturalWidth 3698 / 3682（走 /api/… 惰性端点）
  工具行展开 → <img> naturalWidth 1440（同上）
core 单测 3 条（默认内联不变 / 擦除且下标不变 / entryImage 不限角色）
client 单测 6 条（内联→data URL、占位→端点 URL、无坐标跳过、rebuild 带会话坐标）
server 单测 3 条（详情 deferMedia 透传 / 新路由 200-400-404 / 压缩不误伤 SSE）
pnpm turbo run build test lint typecheck + web e2e → 全绿
```
