# ADR-0016：删除 Web Push 完成通知（撤销 G2-13）

- 日期：2026-09-25
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §3.1 / §6 / §7.1 / §9-4a；`docs/02-protocol-inventory.md` §1.2 / §7；`docs/03-core-design.md` §2.1 / §9 / §10.1；`docs/04-server-design.md` §2 / §3.6 / §8；`docs/07-backend-capability-gap.md` §2 G2-13 / §3.1 / §6 B7 / §8
- 关联决策：**撤销 G2-13**（推送投递侧）；与 ADR-0014（一期范围排除）同类，属"有意不做"；沿用 ADR-0007（绑定 `127.0.0.1`、无凭据）与 ADR-0002（纯本地 SPA）

## 背景

B7 从上游实现（设计规范）落地了 Web Push 的**投递侧**：`core/src/agent/push-service.ts`（266 行，VAPID 密钥
生成与持久化、订阅表落盘、`deliver()` 投递、`web-push` 可选依赖降级）、`server/src/routes/push.ts`
（两个端点）、protocol 的三个 schema，以及 core 的 `AgentSessionService.onSettled` 钩子。当时登记为
G2-13「✅ 已落地」。

2026-09-25 复核后实测三件事，结论从「已落地」变为「死码 + 窄价值」。

**1. 整条链路四步里缺三步，代码一行都执行不到。**

| 步骤 | 现状 |
|---|---|
| ① 服务端有能力发 | ❌ `web-push` **不在任何 `package.json`**（连 `optionalDependencies` 都没有）⇒ `config()` 恒返回 `web-push-not-installed` |
| ② 浏览器订阅 | ❌ `apps/web/src` 不存在、无 service worker ⇒ 无人订阅 |
| ③ 系统弹出 + 点击跳转 | ❌ 无 service worker 代码 |
| ④ 服务端投递 | ✅ 代码在，但 `deliver()` 第一步即 `return { reason: 'no-subscribers' }` |

唯一的实地读者是 4 条降级路径单测；`server.test.ts` 里的两条用例注入的还是 fake（`publicKey: 'BAbc'`）。

**2. 即使接通，通知内容也是空的。** `main.ts` 装配时传 `sessionName: undefined` / `firstMessage: undefined`，
于是通知恒为「`pi-boat` / 会话 3f8a2b1c 已完成」（8 位 id 片段）——`buildCompletionNotification` 里
两条友好分支（会话名当标题、首条消息当正文）**永不可达**；payload 也不含 `url`，点击无处可去。

**3. 价值窗口被本地部署这一前提压得很窄。** 服务端绑 `127.0.0.1`（ADR-0007），通知只可能出现在
跑 server 的那台机器上；而**桌面端浏览器进程完全退出后收不到推送**（推送服务要等浏览器下次启动才补发，
只有 Android 由系统唤醒浏览器，见 [web.dev Push FAQ](https://web.dev/articles/push-notifications-faq)）。
于是 Web Push 相对页面内 `Notification` 的增量场景只剩：**浏览器在后台运行 + 本应用标签页全关 + 人还在这台机器前**。
标签页只要还开着（哪怕在后台），前端 `new Notification()` 就能覆盖，服务端零代码。

另外两点与定位冲突：Web Push 要求 **server 主动出网** POST 到 Google / Mozilla / Apple 的推送服务，
而本仓的定位是纯本地、无凭据、不出网；且现状代码若被直接接线会踩上游已踩过的坑——
默认 VAPID subject `mailto:piboat@localhost` 被 Apple 以 `403 BadJwtToken` 拒绝（设计规范的注释记录了该故障，
故其默认值改为项目主页 URL）。

## 决策

**删除整个 Web Push 能力（订阅侧 + 投递侧），不做替代实现。**

1. 删除 `core/src/agent/push-service.ts`、`core/test/push-service.test.ts`、`server/src/routes/push.ts`
2. 删除 protocol `rest/misc.ts` 的三个 schema（`PushConfigResponse` / `PushSubscribeRequest` / `PushSubscribeResponse`）
3. 删除随之失去唯一消费者的钩子：`AgentSessionService.onSettled` / `emitSettled` / `settledListeners`
   （`docs/07` G2-13 原文：「推送投递侧挂在这里」）、`SessionRegistryEntryOptions.onSettled`、
   `makeEntry` 的第三个参数。`agent_settled` 的**事件**照旧经 SSE 下发给客户端，不受影响
4. `main.ts` 去掉 `PushService` 实例与 `onSettled` 监听块；`server.ts` 去掉 `pushService` 依赖项
5. 计数同步：端点 57 → **55**（`routes/` 54 + `server.ts` 的 `/api/health`；`get('*')` 的 SPA fallback 不计）、
   core 服务 9 → 8、server 用例 66 → 64、core 用例 184 → 180
6. **保留**：`docs/01` §6 功能清单里的「浏览器通知」（指前端页内 `Notification`，仍可选做）；
   `GET /api/agent/running` 的 `completionNotificationSuppressedSessionIds`（客户端多 Tab 去重语义，
   与推送无关）

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 保留代码，等前端接线 | ❌ 放弃 | 现状是**死码**：对外零效果，对内让人以为功能存在（比没有更糟）。接线前还得先修 VAPID subject 与 payload |
| 保留并补齐（`web-push` 依赖 + SW + `url`/会话名） | ❌ 放弃 | 前提是「这个功能重要」；实际收益场景窄（见背景 3），代价是重新引入出网依赖与 service worker 生命周期 |
| 只删投递侧、保留两个订阅端点 | ❌ 放弃 | 订阅收得下、发不出去 = 留一个陷阱端点，且仍要维护订阅表落盘 |
| 用设计规范的实现重写（200 行 + 18 条测试，质量更高） | ❌ 放弃 | 问题不在实现质量而在价值判断，重写不改变结论 |
| 用前端页内通知 + 提示音替代（不做后台投递） | ⚠️ 部分采纳 | 这是**前端**体验项（`docs/01` §6 保留「浏览器通知」与「完成提示音」），不需要服务端参与；仅覆盖页面存在时 |

## 后果

**正面**

- 少 266 + 73 行与两族端点、3 个 schema、1 个 core 钩子；不再有死码
- **网络边界更干净**：本地产品不再保留一个「必须出网到第三方推送服务」的能力，与 ADR-0007 / ADR-0014 的定位一致
- 删掉了一份会踩 Apple `403 BadJwtToken` 的实现（若将来重做，从上游收录比从这份改更省事）

**负面 / 已知风险**

- 用户离开屏幕时不会被告知任务完成，唯一替代是**页面存在时的**页内通知 + 提示音
- 「浏览器在后台运行但标签页全关」这一场景**明确放弃**（若不接受这一点，就不该采纳本决策）
- 将来重做的成本不是零：VAPID 私钥必须持久化（换了私钥旧订阅全部失效）、订阅表 `0600`、410 清理、
  可选依赖降级——这些是 Web Push 的固有成本，与实现无关。**重做时从上位实现收录**
  （设计规范：、、、、
  及各自测试），不要从零设计
- 若将来的真实需求是「**浏览器完全退出**也要通知」，注意 Web Push 在桌面端到不了——那是 Electron / 原生
  通知（`apps/desktop`，M4）的职责，不要用 Web Push 去凑

## 验证记录

```bash
# 删除后全绿（2026-09-25）
pnpm turbo run build          → 5/5 tasks
pnpm turbo run test lint      → 10/10 tasks（protocol 33 / core 180 / server 64）
```

端点计数核对（`get('*')` 的 SPA fallback 不计入 API 端点）：

```bash
grep -rhoE "app\.(get|post|put|patch|delete)\('[^']*'" packages/server/src/routes/*.ts packages/server/src/server.ts \
  | grep -v "'\*'" | wc -l   # → 55
```
