# PiBoat —— server 详细设计（M1）

> `@ice-ai/server`：Hono HTTP/SSE 服务，组装 core。本文覆盖 **API 面之外**的传输层与
> 安全实现（API 面见 `docs/02-protocol-inventory.md`，core 语义见 `docs/03-core-design.md`）。
> 状态：设计稿（2026-09-22，开工前评审） · 现状：仅 health 路由骨架。

---

## 1. 定位

- 路由即协议实现层：每个端点 = protocol 路径常量 + core 方法调用 + 信封/错误映射，**不发明新形状**
- server 无业务状态：会话事实在 core 注册表与 `.jsonl`，无自建存储
- 原生模块（未来 node-pty 等）收敛于此；core 保持传输无关

## 2. 进程形态与启动序列

- bin `piboat-server`（`dist/main.js`）；dev `tsx watch`（turbo dev，9527）
- 端口单一来源 protocol `PORTS`，`PORT` 环境变量覆盖（main.ts 已落地）
- **仅绑定 127.0.0.1**（已落地）；stdout 就绪行供 Electron 健康检查（已落地）
- 启动序列：读配置 → 生成随机 token（§6）→ 实例化 core 服务 → 组装路由 → listen
- 组装方式：`createAgentServer({ agentService, readService })` 依赖注入——core 服务由
  main 构造传入，路由层不直接 new（测试可注入 fake）
- **优雅退出**：SIGINT/SIGTERM → `disposeAll('server_shutdown')`（core 广播
  `session_shutdown`，尽力冲刷）→ 硬断全部 SSE（§5.4 关停坑）→ 进程退出

## 3. M1 路由总表

| 端点 | core 方法 | 语义要点 |
|---|---|---|
| `GET /api/health` | — | ✅ 已落地 |
| `POST /api/agent/new` | `agentService.create()` | NewSessionOk 扩展信封；首条消息被拒时会话保留、错误上抛 |
| `POST /api/agent/:id` | `agentService.send()` | 命令信封（§4.1）；同会话 FIFO 串行 |
| `GET /api/agent/:id` | `agentService.getRunningState()` | 轻查直读注册表，**不进 FIFO**（docs/03 §6.4） |
| `GET /api/agent/running` | `registryVersion + runningSessionIds()` | 轮询端点；`completionNotificationSuppressedSessionIds` M1 恒 `[]` |
| `GET /api/agent/:id/events` | `agentService.subscribe()` | SSE（§5，本文重点） |
| `GET /api/sessions?force` | `readService.list()` + running 合并 | 磁盘扫描 ∪ 注册表；`force` M1 可忽略（无缓存） |
| `GET /api/sessions/search?q` | `readService.search()` | q ≤ 200 |
| `GET /api/sessions/:id` | `readService.detail()` | null → 404 |
| `GET /api/sessions/:id/state` | 存在性 + `getRunningState()` | **文件不存在 → 404**（区别于轻查的 `{running:false}`）；M1 存在性用 `detail() !== null`（贵但正确，优化见 §8-5） |
| `PATCH /api/sessions/:id` | `readService.rename()` | 运行中会话 → 409（M2 接 `set_session_name` 命令） |
| `DELETE /api/sessions/:id` | ⚠️ core 缺方法 | 级联删除（§8-2） |
| `GET /api/sessions/:id/context` | `readService.context()` | 分页语义见 docs/03 §7.1 |
| `GET .../entries/:entryId/tool-result-image` | ⚠️ core 缺方法 | `deferMedia=true` 时必需（§8-3） |
| `GET .../entries/:entryId/thinking` | 暂缓 | 历史 thinking 全文直发后用途待定（docs/02 §6.3） |

bash-output 端点已随 Shell 直连命令组移除（2026-09-22，docs/02 §4 决策注）。

## 4. REST 实现要点

### 4.1 命令信封映射

| core 结果 | HTTP | 响应体 |
|---|---|---|
| 正常返回 | 200 | `{success: true, data}`（CommandOk） |
| `SessionNotFoundError` | 404 | `{error}`（CommandError） |
| `PromptRejectedError` | 400 | `{error, code: 'prompt_rejected', accepted: false}` |
| `create` 模型不可用 / `rename` 空白名等 | 400 | `{error}` |
| 其余异常 | 500 | `{error}`（不泄漏堆栈） |

### 4.2 请求校验

body/query 一律过 protocol Zod schema（`safeParse` 失败 → 400 + `{error}`）；
命令 body 先判别 `type` 是否在 M1 子集内（未知命令 → 400，区别于 404）。

## 5. SSE 传输层（`GET /api/agent/:id/events`）

### 5.1 建立时序

```
①响应头立即下发（text/event-stream; no-cache; no-transform; X-Accel-Buffering:no）
  + 一个注释帧 ":\n\n"（强制冲刷，不等 core）
②agentService.subscribe(id, listener)——core 内部完成：
  注册 listener → connected{lastSeq} → 合成 message_start（若有半截消息）
③此后增量：listener(event) → 帧
```

### 5.2 帧格式

```
id: <seq>            ← SSE event id（EventSource 断线重连自动回传 Last-Event-ID）
data: <wire JSON>\n\n
```

心跳：30s 注释帧 `:\n\n`（防中间层掐空闲连接 + socket 探活）。

### 5.3 关闭条件（长连常开，六种关流路径）

| # | 条件 | 动作 |
|---|---|---|
| 1 | 客户端断开（`req.signal` abort / 流 cancel） | 退订 + 清理 |
| 2 | `session_shutdown` 事件（core dispose 广播） | graceful close |
| 3 | 连接时会话不在注册表 | 404（**冷会话不自动拉起**——恢复语义归 M2，不照抄 pi-web 的 startRpcSession） |
| 4 | 进程关停（SIGINT/SIGTERM） | 先 `disposeAll` 广播，再**硬断** `controller.error()`（§5.4） |
| 5 | 写失败（broken pipe） | 退订 + 清理 |
| 6 | 订阅竞态（subscribe 抛 SessionNotFoundError） | 404 |

连接跟随「客户端与会话存活」，不跟随「任务是否跑完」：`agent_end` 后流不断，
等下一个 turn。多端观看：每连接独立 `subscribe()`，各自拿快照 + 增量。

### 5.4 进程关停坑（pi-web 教训，`lib/agent-event-stream.ts`）

graceful close 可能被 Node 响应管道吞掉——socket 保持 ESTABLISHED、`server.close()`
永不完成、进程变僵尸。**关停时必须硬断**（error 让客户端立即感知并重连），
且用注册表跟踪全部活跃流统一关闭。SSE 流的进程内注册表放 server 模块级。

### 5.5 Last-Event-ID 差量重放——分阶段兑现

协议承诺（docs/01 §5.4）：重连带 `Last-Event-ID`（即上次收到的 seq），server 重放
`seq > lastEventId` 的差量。**core 现状无事件缓冲**，分两档：

- **M1 降级**：忽略 `Last-Event-ID`，重连 = `connected` + 快照 + 此后增量；
  客户端整体重建（seq 单调保证丢弃 `≤ lastSeq` 的重复事件，幂等成立）。
  断线窗口内已广播的事件丢失由快照覆盖（半截消息场景）或下轮全量状态查询覆盖
- **M1 内增强 / M2**：core `SessionRegistryEntry` 加有界环形缓冲（如最近 500 条），
  server 按游标重放后接增量（重放与订阅的重叠窗口靠客户端 seq 去重）

> 若采用降级方案，docs/01 §5.4 需补一句「分阶段兑现」的标注（避免文档与实现不一致）。

### 5.6 liveness lease

M3 实现：每个 SSE 连接持有会话 lease，观看中的空闲会话不被 idle 回收
（pi-web `session-liveness.ts` 为参照）。M1 无 idle 回收，不需要。

## 6. 安全（docs/01 §5.6 落地）

- **绑定 127.0.0.1**（已落地）——纯本地定位的物理边界
- **token**：启动生成随机 token；API 请求携带 `Authorization: Bearer <token>`
- **Origin / Host 校验**：拒绝非白名单 Origin 与异常 Host（防恶意网页打 127.0.0.1 的
  CSRF / DNS 重绑定——纯本地 ≠ 无攻击面，server 有宿主机文件系统全部权限）
- **SSE 一次性票据**：EventSource 无法携带 header。流程：`POST /api/agent/:id/sse-ticket`
  （带 token）→ `{ticket}`（一次性、短时效）→ `EventSource(url + ?ticket=)`，用后即焚
- **CORS**：dev 白名单 `http://localhost:9528`（已落地）；生产同源无需 CORS
- 开发期 token 校验可关（env 开关），**Origin 校验不可关**
- 新增路由检查清单（AGENTS.md 强制）：①是否触碰文件系统 → allowed-roots？②是否带
  鉴权（token / 票据）？③错误响应是否泄漏内部路径/堆栈？④是否新增 Origin 例外？

## 7. 静态托管与部署形态

- 生产：`@hono/node-server` serveStatic 托管 `apps/web/dist`，SPA fallback 到
  `index.html`；单进程 = 页面 + API + SSE（同源，token 经 bootstrap 下发，M1 末段接入）
- dev：浏览器页面来自 vite 9528，API/SSE 直连 9527（不经代理，避免 SSE 缓冲）

## 8. 开工前置缺口清单

| # | 缺口 | 归属 | 处理 |
|---|---|---|---|
| 1 | SSE 重放缓冲（core 只发不存） | core | M1 降级方案先行（§5.5），缓冲作增强 |
| 2 | `DELETE /api/sessions/:id` 级联删除方法 | core | server 动工时补（M1 范围内端点） |
| 3 | `tool-result-image` 惰性读取（`deferMedia` 必需） | core | 同上；thinking 端点暂缓（全文直发，用途待定） |
| 4 | 优雅退出信号处理 | server | main.ts 接 SIGINT/SIGTERM（§2） |
| 5 | 会话存在性轻量检查（state 端点 404 判定） | core | M1 用 `detail() !== null`；量大后加 `exists(id)` |
| 6 | `POST /api/agent/:id/sse-ticket` 端点 | protocol + server | 票据类型进 protocol（§6） |

## 9. 实施顺序

1. **组装骨架**：DI 改造 `createAgentServer`，接入双 core 服务，Zod 校验中间件
2. **命令通道**：`/api/agent/new` + `POST /api/agent/:id` + 信封映射（curl 可验收一轮 prompt）
3. **SSE 路由**：时序/帧/心跳/六关闭条件（`curl -N` 验收流式输出）
4. **浏览路由**：sessions 全家（list/detail/context/state/…）+ §8-2/3 core 缺口补齐
5. **安全**：token / Origin / SSE 票据（§6 检查清单过一遍全部路由）
6. **收尾**：静态托管 + 优雅退出 + `registryVersion` 轮询端点联调

验收线不变：浏览器完成一轮带工具调用的编程任务（docs/01 §7 M1）。
