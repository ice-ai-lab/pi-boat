# PiBoat —— server 详细设计（M1）

> `@ice-ai/server`：Hono HTTP/SSE 服务，组装 core。本文覆盖 **API 面之外**的传输层与
> 安全实现（API 面见 `docs/02-protocol-inventory.md`，core 语义见 `docs/03-core-design.md`）。
> 状态：M1 已落地（2026-09-22，含单测与 curl/SIGTERM 验收） · 同日按 ADR-0007 删除 Bearer token
> 与 SSE 一次性票据（安全层收敛为 Host / Origin / Sec-Fetch-Site 三闸常开） · 按 ADR-0008 新增
> 项目清单端点与列表指纹缓存（`projectKey` 归一，替换 M1 的“按 cwd 分组”） · 生产 bin 直跑 dist 的
> 模块解析问题（extensionless import × `moduleResolution: bundler`）遗留到打包阶段（M4）。

---

## 1. 定位

- 路由即协议实现层：每个端点 = protocol 路径常量 + core 方法调用 + 信封/错误映射，**不发明新形状**
- server 无业务状态：会话事实在 core 注册表与 `.jsonl`，无自建存储
- 原生模块（未来 node-pty 等）收敛于此；core 保持传输无关

## 2. 进程形态与启动序列

- bin `piboat-server`（`dist/main.js`）；dev `tsx watch`（turbo dev，9527）
- 端口单一来源 protocol `PORTS`，`PORT` 环境变量覆盖（main.ts 已落地）
- **仅绑定 127.0.0.1**（已落地）；stdout 就绪行供 Electron 健康检查（已落地）
- 启动序列：读配置 → 实例化 core 服务 → 组装路由 → listen
- 组装方式：`createAgentServer({ agentService, readService, projectService })` 依赖注入——core 服务由
  main 构造传入（read/project 两服务共享同一 `ProjectResolver` 实例，ADR-0008），路由层不直接
  new（测试可注入 fake）
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
| `GET /api/agent/:id/events` | `agentService.subscribe()` | SSE（§5，本文重点）；鉴权靠 Host/Origin/Sec-Fetch-Site 头校验，无 query 凭据 |
| `GET /api/projects?force` | `projectService.listProjects()` | ✅ ADR-0008：项目清单（会话目录派生视图）。`readdir`+`stat`+每目录一次首行头，不解析正文（实测 3–7 ms / 1.8 KB）；按 `projectKey` 合并子目录与 worktree；空目录跳过；**不分页** |
| `GET /api/sessions?force&projectKey` | `readService.list()` + `listFingerprint()` | 磁盘扫描 ∪ 注册表；`force=1` 跳过指纹缓存（缓存键 = 会话目录指纹，磁盘变动自动失效），`projectKey` 只返回一个项目。⚠️ ensure_session 建的未落盘会话（transient）暂不在列表，待 M2 合并 |
| `GET /api/sessions/search?q` | `readService.search()` | q ≤ 200；q 缺省 → 400 |
| `GET /api/sessions/:id` | `readService.detail()` | null → 404 |
| `GET /api/sessions/:id/state` | 存在性 + `getRunningState()` | **文件不存在 → 404**（区别于轻查的 `{running:false}`）；M1 存在性用 `detail() !== null`（贵但正确，优化见 §8-5） |
| `PATCH /api/sessions/:id` | `readService.rename()` | 运行中会话 → 409（M2 接 `set_session_name` 命令）；空白名 → 400（core UserInputError） |
| `DELETE /api/sessions/:id` | ✅ `readService.delete()` | 级联删除（§8-2 已补；运行中 → 409） |
| `GET /api/sessions/:id/context` | `readService.context()` | 分页语义见 docs/03 §7.1 |
| `GET .../entries/:entryId/tool-result-image` | ✅ `readService.toolResultImage()` | §8-3 已补（deferMedia 占位符形状待 protocol 定稿后接，见 docs/03 §7 注） |
| `GET .../entries/:entryId/thinking` | 暂缓 | 历史 thinking 全文直发后用途待定（docs/02 §6.3） |

bash-output 端点已随 Shell 直连命令组移除（2026-09-22，docs/02 §4 决策注）。

## 4. REST 实现要点

### 4.1 命令信封映射

| core 结果 | HTTP | 响应体 |
|---|---|---|
| 正常返回 | 200 | `{success: true, data}`（CommandOk） |
| `SessionNotFoundError` | 404 | `{error}`（CommandError） |
| `PromptRejectedError` | 400 | `{error, code: 'prompt_rejected', accepted: false}` |
| `UserInputError`（create 模型不可用 / rename 空白名等） | 400 | `{error}` |
| 其余异常 | 500 | `{error: 'Internal server error'}`（堆栈只进服务端日志，不泄漏） |

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
| 2 | `session_shutdown` 事件（core dispose 广播） | 先送达该帧（客户端据此区分「关停」与「断线」，决定是否重连）→ graceful close |
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

- **M1 降级（已采用）**：忽略 `Last-Event-ID`，重连 = `connected` + 快照 + 此后增量；
  客户端整体重建（seq 单调保证丢弃 `≤ lastSeq` 的重复事件，幂等成立）。
  断线窗口内已广播的事件丢失由快照覆盖（半截消息场景）或下轮全量状态查询覆盖
- **M1 内增强 / M2**：core `SessionRegistryEntry` 加有界环形缓冲（如最近 500 条），
  server 按游标重放后接增量（重放与订阅的重叠窗口靠客户端 seq 去重）

### 5.6 liveness lease

M3 实现：每个 SSE 连接持有会话 lease，观看中的空闲会话不被 idle 回收
（pi-web `session-liveness.ts` 为参照）。M1 无 idle 回收，不需要。

## 6. 安全（docs/01 §5.6 落地，鉴权模型见 ADR-0007）

- **绑定 127.0.0.1**（已落地）——纯本地定位的物理边界；不提供非回环绑定开关
- **三道闸全部常开、不可关**（`src/security.ts`）：
  - ① **Host 校验**：只认回环主机名（`localhost` / `127.0.0.1` / `[::1]`，可带端口）——防 DNS 重绑定。
    比 pi-web 的"任意 IP"更严（我们不提供非回环绑定）
  - ② **Origin 校验**：带 Origin 才校验（curl / 同源 GET 导航无 Origin）；白名单 = 同源 ∪
    dev web 白名单 `http://localhost:9528` / `http://127.0.0.1:9528`
  - ③ **Sec-Fetch-Site**：值为 `cross-site` 一律 403——覆盖 `<img>`/`<script>`/表单导航等**无 Origin**
    的跨站子资源请求；`Sec-` 前缀是 forbidden header name，页面 JS 无法伪造；`same-site` 必须放行
    （dev 期 `localhost:9528 → localhost:9527` 正是 same-site cross-origin，因此**页面与 API 须用同一主机名**）
- **无凭据**（ADR-0007，2026-09-22）：token / SSE 一次性票据 / 鉴权 bootstrap 已全部删除。
  理由：token 相对 ①② 只多挡一格（无 Origin 的跨站请求，已由 ③ 覆盖），而票据层只为
  `EventSource` 无法带 header 而存在，且 dev 期跨源页面无从取得随机 token
- **代价：GET 不得有副作用**——无 Origin 的跨站 GET 不再有凭据兜底；读的响应虽被 CORS 挡住，
  有副作用的 GET 会被直接利用。与下面清单第 ④ 条配套
- **CORS**：dev 白名单 `http://localhost:9528`（`server.ts`）；生产同源无需 CORS
- **LAN / 移动端接入**（docs/01 §9-4）另议：届时应引入**用户可输入的口令**（cookie 会话 / Basic，
  参见 ADR-0007 备选方案表），而非随机 token
- 新增路由检查清单（AGENTS.md 强制）：①是否触碰文件系统 → allowed-roots？②错误响应是否泄漏
  内部路径/堆栈？③是否新增 Origin / Sec-Fetch-* 例外？④**是否为有副作用的 GET**（禁止）？

## 7. 静态托管与部署形态

- 生产：`@hono/node-server` serveStatic 托管 `apps/web/dist`，SPA fallback 到
  `index.html`；单进程 = 页面 + API + SSE（同源，无凭据分发，ADR-0007）
- dev：浏览器页面来自 vite 9528，API/SSE 直连 9527（不经代理，避免 SSE 缓冲）

## 8. 开工前置缺口清单（2026-09-22 server 落地后复盘）

| # | 缺口 | 归属 | 处理 |
|---|---|---|---|
| 1 | SSE 重放缓冲（core 只发不存） | core | ✅ M1 降级方案先行（§5.5），缓冲作 M1 内增强/M2 |
| 2 | `DELETE /api/sessions/:id` 级联删除方法 | core | ✅ `SessionReadService.delete()`（subagent 标记判定，fork 子会话不级联） |
| 3 | `tool-result-image` 惰性读取（`deferMedia` 必需） | core | ✅ `toolResultImage()`；deferMedia 占位符形状待 protocol 定稿；thinking 端点暂缓 |
| 4 | 优雅退出信号处理 | server | ✅ main.ts 接 SIGINT/SIGTERM（§2），含关停硬断（§5.4，SIGTERM 验收） |
| 5 | 会话存在性轻量检查（state 端点 404 判定） | core | M1 用 `detail() !== null`；量大后加 `exists(id)` |
| 6 | `POST /api/agent/:id/sse-ticket` 端点 | protocol + server | ✅ M1 落地后于同日按 ADR-0007 撤销（票据层随 token 一并删除） |
| 7 | 生产 bin 直跑 dist（extensionless import × bundler 解析） | 构建 | 遗留到 M4 打包（dev/test 全走 tsx，不影响 M1 验收） |
| 8 | 列表 transient 合并（ensure_session 未落盘会话不可见） | core/server | M2：列表 ∪ 注册表需要 SessionInfo 化的运行时快照 |
| 9 | 前端无法正确分组（只能按 cwd 字符串） | core/server | ✅ ADR-0008：`ProjectResolver` 归一 + `GET /api/projects` + `?projectKey` 过滤 |
| 10 | 全量列表成本随会话数线性增长，且无磁盘侧失效信号 | core | ✅ ADR-0008：目录指纹缓存（实测 75 ms → 3 ms）+ `listFingerprint` 响应字段 |
| 11 | 会话列表分页 | protocol + server | ⏸ 推迟：触发条件与游标轴见 `docs/02` §9-7；当前靠 `?projectKey` + 指纹缓存收敛 |

## 9. 实施顺序（已完成）

1. ✅ **组装骨架**：DI 改造 `createAgentServer`，接入双 core 服务，Zod 校验中间件
2. ✅ **命令通道**：`/api/agent/new` + `POST /api/agent/:id` + 信封映射（curl 验收过）
3. ✅ **SSE 路由**：时序/帧/心跳/六关闭条件（`curl -N` + 单测验收流式输出）
4. ✅ **浏览路由**：sessions 全家 + §8-2/3 core 缺口补齐
5. ✅ **安全**：Host / Origin 校验（原 token 与 SSE 票据于同日 ADR-0007 删除，新增 Sec-Fetch-Site）
6. ✅ **收尾**：优雅退出（SIGTERM 验收 session_shutdown 帧送达后进程干净退出）+
   `registryVersion` 轮询端点；静态托管代码就位（apps/web 待建，目录存在即挂载）

验收线不变：浏览器完成一轮带工具调用的编程任务（docs/01 §7 M1，待 client/web）。
**验收命令（curl 实测手册：安全层一键块 / 运行时域 / SSE 帧 / SIGTERM）见 `packages/server/README.md`。**
代码地图：`src/server.ts`（DI 装配）、`src/security.ts`（三道闸，ADR-0007）、
`src/sse.ts`（SSE 传输层与关停注册表）、`src/envelope.ts`（信封映射）、
`src/routes/{agent,sessions,projects}.ts`（三域路由：agent 运行时 / 会话浏览 / 项目分组视图）、`src/main.ts`（启动与优雅退出）、
`test/server.test.ts`（30 用例：安全/信封/浏览/项目/SSE）；core 侧 `read/session-read-service.ts`
（列表/项目清单/目录指纹缓存）与 `read/project-resolver.ts`（git 归一，ADR-0008）。
