# PiBoat —— server 详细设计

> `@ice-ai/server`：Hono HTTP/SSE 服务，组装 core。本文覆盖 **API 面之外**的传输层与
> 安全实现（API 面见 `docs/02-protocol-inventory.md`，core 语义见 `docs/03-core-design.md`）。
> 状态：**一期全部落地**（M1，2026-09-22；M2/M3 对应路由随 B3–B7 于 2026-02 补齐，见 `docs/07` §6）
> · 同日按 ADR-0007 删除 Bearer token 与 SSE 一次性票据（安全层收敛为 Host / Origin / Sec-Fetch-Site 三闸常开）
> · 按 ADR-0008 新增项目清单端点与列表指纹缓存（`projectKey` 归一）；按 ADR-0013 新增 `POST /api/agent/:id/resume`
> · 生产 bin 直跑 dist 的模块解析问题（extensionless import × `moduleResolution: bundler`）遗留到打包阶段（M4）。

---

## 1. 定位

- 路由即协议实现层：每个端点 = protocol 的请求/响应契约（路由路径用字面量） + core 方法调用 + 信封/错误映射，**不发明新形状**
- server 无业务状态：会话事实在 core 注册表与 `.jsonl`，无自建存储
- 原生模块（未来 node-pty 等）收敛于此；core 保持传输无关

## 2. 进程形态与启动序列

- bin `piboat-server`（`dist/main.js`）；dev `tsx watch`（turbo dev，9527）
- 端口单一来源 protocol `PORTS`，`PORT` 环境变量覆盖（main.ts 已落地）
- **仅绑定 127.0.0.1**（已落地）；stdout 就绪行供 Electron 健康检查（已落地）
- 启动序列：读配置 → 实例化 core 服务 → 组装路由 → listen
- 组装方式：`createAgentServer({ agentService, readService, projectService, configService, systemService, resourceService, pushService, liveness?, staticRoot? })`
  ——core 服务由 main 构造传入（read/project 与 SystemService 共享同一 `ProjectResolver` 实例，ADR-0008），
  路由层不直接 new（测试可注入 fake）；`liveness` 与 `staticRoot` 可选
- **优雅退出**：SIGINT/SIGTERM → `disposeAll('server_shutdown')`（core 广播
  `session_shutdown`，尽力冲刷）→ 硬断全部 SSE（§5.4 关停坑）→ 进程退出
- **后台任务**：`LivenessRegistry.start()`（lease 过期后回收无人看的空闲会话）与
  `agentService.onSettled` → `PushService.deliver()`（只在无观看者时发完成通知）均在 main 装配

## 3. 路由总表（57 条，按域）

形状以 `docs/02` §6 为准（本表只记 core 方法调用与传输层语义要点）。**新增路由必须过
§6 的四条检查清单**。

### 3.1 agent 运行时域（7）——`routes/agent.ts`

| 端点 | core 方法 | 语义要点 |
|---|---|---|
| `POST /api/agent/new` | `agentService.create()` | NewSessionOk 扩展信封；首条消息被拒时会话保留、错误上抛；可选 `ensure_session`（内存会话） |
| `POST /api/agent/:id` | `agentService.send()` | 命令信封（§4.1）；同会话 FIFO 串行；未知 `type` → 400（与 404 区分） |
| `GET /api/agent/:id` | `agentService.getRunningState()` | 轻查直读注册表，**不进 FIFO**（docs/03 §6.4） |
| `POST /api/agent/:id/resume` | `agentService.resume()` | 从 `.jsonl` 重建 runtime 并登记（ADR-0013a）。**必须 POST**——建流时隐式创建会让 GET 产生副作用（ADR-0007） |
| `GET /api/agent/running` | `registryVersion + runningSessionIds()` | 轮询端点；`completionNotificationSuppressedSessionIds` 为推送抑制集 |
| `POST /api/agent/:id/lease` | `liveness.renew()` | 观看心跳；`renewed:false` 表示会话已不在注册表（不是错误，前端据此显式 resume） |
| `GET /api/agent/:id/events` | `agentService.subscribe()` | SSE（§5，本文重点）；鉴权靠 Host/Origin/Sec-Fetch-Site 头校验，无 query 凭据 |

### 3.2 会话浏览域（12）——`routes/sessions.ts`

| 端点 | core 方法 | 语义要点 |
|---|---|---|
| `GET /api/sessions?force&projectKey` | `readService.list()` + `listFingerprint()` | 磁盘扫描 ∪ 注册表 ∪ transient（内存未落盘会话排在最前）；`force=1` 跳过指纹缓存；`projectKey` 只返回一个项目 |
| `GET /api/sessions/search?q` | `readService.search()` | q ≤ 200；q 缺省 → 400；轻量字段过滤 + 有界正文扫描（G2-7） |
| `GET /api/sessions/:id` | `readService.detail()` | null → 404；`force=1` 时做外部写入检测并回 `wrapperRebuilt`（ADR-0013b） |
| `GET /api/sessions/:id/revision` | `readService.revision()` | 文件指纹（G2-6）；null → 404 |
| `GET /api/sessions/:id/export?inline` | `readService.exportHtml()` | HTML 导出（attachment / inline） |
| `POST /api/sessions/:id/auto-name` | `readService.autoName()` | LLM 生成标题 + `usage`（会真发一次模型请求） |
| `GET /api/sessions/:id/state` | 存在性 + `getRunningState()` | **文件不存在 → 404**（区别于轻查的 `{running:false}`） |
| `GET /api/sessions/:id/context` | `readService.context()` | 分页语义见 docs/03 §7.1（`before`/`tail`/`deferMedia`） |
| `GET .../entries/:entryId/thinking` | 条目读取 | 全量推理文本（`blockIndex`）；`deferThinking` 已按 2026-09-20 决策删除 |
| `GET .../entries/:entryId/tool-result-image` | `readService.toolResultImage()` | 二进制图片（`blockIndex`）；deferMedia 占位符形状待后续定 |
| `PATCH /api/sessions/:id` | `readService.rename()` | 运行中会话 → **409**（提示改走 `set_session_name` 命令，避免与 SDK 写盘竞争）；空白名 → 400 |
| `DELETE /api/sessions/:id` | `readService.delete()` | 级联删除 subagent 子会话（§8-2）；运行中 → 409 |

### 3.3 项目与模型域（11）——`routes/projects.ts` + `routes/models.ts`

| 端点 | core 方法 | 语义要点 |
|---|---|---|
| `GET /api/projects?force` | `projectService.listProjects()` | ✅ ADR-0008：项目清单（会话目录派生视图）。`readdir`+`stat`+每目录一次首行头，不解析正文（实测 3–7 ms / 1.8 KB）；按 `projectKey` 合并子目录与 worktree；空目录跳过；**不分页** |
| `GET /api/models?cwd` | `ConfigService` | 可见模型 + 思考档位 + `thinkingLevelPins` / `modelScopeWarnings` / `defaultModel` |
| `GET/PUT /api/models-config` | `ConfigService` | models.json 原文读写（PUT 校验后落盘）——**一期唯一的模型凭据入口** |
| `POST /api/models-config/discover` | `ConfigService` | 按 provider `/models` 端点发现（20s 超时） |
| `POST /api/models-config/test` | `ConfigService` | 真实补全测连通（临时 models.json，20s 超时） |
| `GET /api/models-config/catalog?q` | `ConfigService` | models.dev 目录（1h 缓存，服务端代理） |
| `GET/PUT /api/models/enabled` | `ConfigService` + `model-scope` | 可见范围编辑引擎（ADR-0011）：最小编辑 / `prune` / `resync`；项目 shadow → 只读；最后一个模型 → 409 |
| `POST /api/models/refresh` | `ConfigService` | 按需拉远端目录（只有用户显式请求才联网） |

### 3.4 文件 / Git / Worktree 域（12）——`routes/system.ts`

| 端点 | core 方法 | 语义要点 |
|---|---|---|
| `GET /api/home` · `POST /api/default-cwd` | `SystemService` | 家目录；`~/pi-cwd-YYYYMMDD` 并加入 allowed-roots |
| `GET /api/cwd/browse?path` · `POST /api/cwd/validate` | `SystemService` | 目录选择器（Windows 盘符）；`~` 展开 + 项目归一 + 选定即入 allowed-roots |
| `GET /api/files/*?type=&sessionId=` | `SystemService` + `PathGuard` | `list/read/download/meta/preview`（`watch` 返 400，`docs/07` §9）；`sessionId` = 会话引用放行 |
| `POST /api/files/*?type=` | `SystemService` | `upload`（单文件 ≤ 25MB / 总量 ≤ 100MB、文件名校验、冲突策略）/ `upload-check` |
| `GET /api/file-index?cwd&q` | `SystemService` | git 仓库走 tracked 文件；无 q ≤ 5000、硬上限 20 万；per-cwd 缓存 |
| `GET /api/git/status` · `GET /api/git/diff` | `SystemService` | 含 `additions/deletions`；单文件 unified diff；路径一律过 `samePath()` |
| `GET/POST/DELETE /api/worktrees` | `SystemService` | 增删查；已存在分支复用；脏 worktree 删除 → 409 `{dirty:true}`；被删 worktree 的会话归回主项目 |

### 3.5 资源域（13）——`routes/resources.ts`

| 端点 | core 方法 | 语义要点 |
|---|---|---|
| `GET/POST /api/project-trust` | `ResourceService` | POST 两种拒绝 → **409 + `reason`**：`no-trusted-resources`（该项目没有需要信任的资源）；`session-active`（该 cwd 有活跃会话时不许改信任——已加载的项目资源不能中途撤下，换信任要重开会话） |
| `GET/PATCH /api/skills` | `ResourceService` | 用 `DefaultResourceLoader`（与运行时同源）；PATCH 只手术 `disable-model-invocation` frontmatter |
| `POST /api/skills/{search,install,check,update}` | `ResourceService` | 市场搜索；安装经 `npx skills add … --agent pi`；版本对比（`search/install/check/update` 会联网） |
| `GET/POST /api/plugins` · `POST /api/plugins/check` | `ResourceService` | 经 `SettingsManager` + `DefaultPackageManager`；disable 写空数组；check 为更新检查 |
| `GET/PUT /api/tools/settings` | `ResourceService` | `{isWindows, powerShellEnabled}` |

子代理域（`/api/subagents/*`）按 ADR-0014 延后，不在本服务（docs/07 §8-4）。

### 3.6 辅助通道（3）——`routes/push.ts` + `server.ts`

| 端点 | core 方法 | 语义要点 |
|---|---|---|
| `GET /api/health` | — | `{ok, name}`（注册在 `server.ts`，不在路由文件里） |
| `GET /api/push/config` | `PushService.config()` | VAPID 公钥；未装可选包 `web-push` → `{enabled:false, reason:'web-push-not-installed'}` |
| `POST /api/push/subscribe` | `PushService.subscribe()` | 按 endpoint upsert；投递只在“没有观看者”时发（main.ts 接 `onSettled`） |

bash-output 端点已随 Shell 直连命令组移除（2026-09-22，docs/02 §4 决策注）。

## 4. REST 实现要点

### 4.1 命令信封映射

| core 结果 | HTTP | 响应体 |
|---|---|---|
| 正常返回 | 200 | `{success: true, data}`（CommandOk） |
| `SessionNotFoundError` | 404 | `{error}`（CommandError） |
| `PromptRejectedError` | 400 | `{error, code: 'prompt_rejected', accepted: false}` |
| `UserInputError`（create 模型不可用 / **cwd 不存在** / rename 空白名等） | 400 | `{error}`（无堆栈） |
| 其余异常 | 500 | `{error: 'Internal server error'}`（堆栈只进服务端日志，不泄漏） |

### 4.2 请求校验

body/query 一律过 protocol Zod schema（`safeParse` 失败 → 400 + `{error}`）；
命令 body 先判别 `type` 是否在 24 条命令内（未知命令 → 400，区别于 404）。

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
| 3 | 连接时会话不在注册表 | 404（**冷会话不自动拉起**——恢复语义归 M2 的显式端点，不在建流时隐式创建 runtime） |
| 4 | 进程关停（SIGINT/SIGTERM） | 先 `disposeAll` 广播，再**硬断** `controller.error()`（§5.4） |
| 5 | 写失败（broken pipe） | 退订 + 清理 |
| 6 | 订阅竞态（subscribe 抛 SessionNotFoundError） | 404 |

连接跟随「客户端与会话存活」，不跟随「任务是否跑完」：`agent_end` 后流不断，
等下一个 turn。多端观看：每连接独立 `subscribe()`，各自拿快照 + 增量。

### 5.4 进程关停坑

graceful close 可能被 Node 响应管道吞掉——socket 保持 ESTABLISHED、`server.close()`
永不完成、进程变僵尸。**关停时必须硬断**（error 让客户端立即感知并重连），
且用注册表跟踪全部活跃流统一关闭。SSE 流的进程内注册表放 server 模块级。

### 5.5 Last-Event-ID 差量重放——分阶段兑现

协议承诺（docs/01 §5.4）：重连带 `Last-Event-ID`（即上次收到的 seq），server 重放
`seq > lastEventId` 的差量。**core 现状无事件缓冲**，分两档：

- **M1 降级（已采用）**：忽略 `Last-Event-ID`，重连 = `connected` + 快照 + 此后增量；
  客户端整体重建（seq 单调保证丢弃 `≤ lastSeq` 的重复事件，幂等成立）。
  断线窗口内已广播的事件丢失由快照覆盖（半截消息场景）或下轮全量状态查询覆盖
- **待补（B8 可选）**：core `SessionRegistryEntry` 加有界环形缓冲（如最近 500 条），
  server 按游标重放后接增量（重放与订阅的重叠窗口靠客户端 seq 去重）。当前实现仍是
  整体重建（上一条降级方案）；单测已覆盖“忽略 Last-Event-ID 也幂等”

### 5.6 liveness lease 与 idle 回收 ✅ 已实现

每个 SSE 连接持有会话 lease（`LivenessRegistry`，`DEFAULT_LEASE_TTL_MS = 180s`，回收扫描周期 60s），
观看中的空闲会话不被 idle 回收；判据 = **没有观看者**（lease 过期**且**无 SSE 订阅）**且不在跑**
（`isStreaming` / `isPromptRunning` 任一为真就留——回收正在跑的会话会丢流，与 ADR-0013b 同一取舍）。
`main.ts` 装配：`subscriberCount` 读本模块的活跃流注册表，`onReap` 走
`agentService.disposeSession(id, 'idle')`。SSE 长连接本身不算观看证据（断网标签页会留
ESTABLISHED 很久），因此前端靠 `POST /api/agent/:id/lease` 心跳续期（建议 60s 续一次）；
`renewed:false` 表示会话已不在注册表，前端据此显式 resume（ADR-0013）。

## 6. 安全（docs/01 §5.6 落地，鉴权模型见 ADR-0007）

- **绑定 127.0.0.1**（已落地）——纯本地定位的物理边界；不提供非回环绑定开关
- **三道闸全部常开、不可关**（`src/security.ts`）：
  - ① **Host 校验**：只认回环主机名（`localhost` / `127.0.0.1` / `[::1]`，可带端口）——防 DNS 重绑定。
    比"任意 IP 字面量"更严（我们不提供非回环绑定）
  - ② **Origin 校验**：带 Origin 才校验（curl / 同源 GET 导航无 Origin）；白名单 = 同源 ∪
    dev web 白名单 `http://localhost:9528` / `http://127.0.0.1:9528`
  - ③ **Sec-Fetch-Site**：值为 `cross-site` 一律 403——覆盖 `<img>`/`<script>`/表单导航等**无 Origin**
    的跨站子资源请求；`Sec-` 前缀是 forbidden header name，页面 JS 无法伪造；`same-site` 必须放行
    （`localhost:9528 → localhost:9527` 是 same-site cross-origin，而 `localhost` ↔ `127.0.0.1` 互换是
    cross-site——**直连模式下页面与 API 须用同一主机名**；dev 默认走 Vite proxy，见 §7）
- **无凭据**（ADR-0007，2026-09-22）：token / SSE 一次性票据 / 鉴权 bootstrap 已全部删除。
  理由：token 相对 ①② 只多挡一格（无 Origin 的跨站请求，已由 ③ 覆盖），而票据层只为
  `EventSource` 无法带 header 而存在，且 dev 期跨源页面无从取得随机 token
- **代价：GET 不得有副作用**——无 Origin 的跨站 GET 不再有凭据兜底；读的响应虽被 CORS 挡住，
  有副作用的 GET 会被直接利用。与下面清单第 ④ 条配套
- **CORS**：白名单 `http://localhost:9528` / `http://127.0.0.1:9528`（`server.ts` + `security.ts` 共享同一份
  `DEV_WEB_ORIGINS`）；生产同源无需 CORS。**dev 默认走 Vite proxy（§7），浏览器路径不经三道闸**——白名单
  保留给直连场景（Electron / LAN / PWA），闸门行为由 `test/server.test.ts` 断言覆盖
- **LAN / 移动端接入**（docs/01 §9-4）另议：届时应引入**用户可输入的口令**（cookie 会话 / Basic，
  参见 ADR-0007 备选方案表），而非随机 token
- 新增路由检查清单（AGENTS.md 强制）：①是否触碰文件系统 → allowed-roots？②错误响应是否泄漏
  内部路径/堆栈？③是否新增 Origin / Sec-Fetch-* 例外？④**是否为有副作用的 GET**（禁止）？

## 7. 静态托管与部署形态

- 生产：`@hono/node-server` serveStatic 托管 `apps/web/dist`，SPA fallback 到
  `index.html`；单进程 = 页面 + API + SSE（同源，无凭据分发，ADR-0007）
- dev：浏览器只与 vite 9528 同源通信，`/api/*`（含 SSE）由 Vite dev server **代理**到
  `http://127.0.0.1:9527`（ADR-0009，2026-09-22 定案）——dev 与 prod 拓扑一致；代理转发的请求
  不带 Origin / Sec-Fetch-*，故 ②③ 在 dev 期不经浏览器路径（它们防护直接打 9527 的来源，
  行为已由单测覆盖）。CORS 白名单保留为直连备选。⚠️ 代理必须保持流式（勿开缓冲/压缩）。

## 8. 缺口清单（2026-09-22 server 落地后复盘；状态已刷到 2026-02）

| # | 缺口 | 归属 | 处理 |
|---|---|---|---|
| 1 | SSE 重放缓冲（core 只发不存） | core | ⏸ 降级方案在用（§5.5）；环形缓冲属 B8 可选（`docs/07` §6） |
| 2 | `DELETE /api/sessions/:id` 级联删除方法 | core | ✅ `SessionReadService.delete()`（subagent 标记判定，fork 子会话不级联） |
| 3 | `tool-result-image` 惰性读取（`deferMedia` 必需） | core | ✅ `toolResultImage()` 与 `/thinking` 端点均已就位；deferMedia 占位符形状待后续定 |
| 4 | 优雅退出信号处理 | server | ✅ main.ts 接 SIGINT/SIGTERM（§2），含关停硬断（§5.4，SIGTERM 验收） |
| 5 | 会话存在性轻量检查（state 端点 404 判定） | core | 仍用 `detail() !== null`（贵但正确）；量大后加 `exists(id)` |
| 6 | `POST /api/agent/:id/sse-ticket` 端点 | protocol + server | ✅ M1 落地后于同日按 ADR-0007 撤销（票据层随 token 一并删除） |
| 7 | 生产 bin 直跑 dist（extensionless import × bundler 解析） | 构建 | 遗留到 M4 打包（dev/test 全走 tsx，不影响验收） |
| 8 | 列表 transient 合并（ensure_session 未落盘会话不可见） | core/server | ✅ `mergeTransient()`：内存会话排在最前，同 id 以内存态为准 |
| 9 | 前端无法正确分组（只能按 cwd 字符串） | core/server | ✅ ADR-0008：`ProjectResolver` 归一 + `GET /api/projects` + `?projectKey` 过滤 |
| 10 | 全量列表成本随会话数线性增长，且无磁盘侧失效信号 | core | ✅ ADR-0008：目录指纹缓存（实测 75 ms → 3 ms）+ `listFingerprint` 响应字段 |
| 11 | 会话列表分页 | protocol + server | ⏸ 推迟：触发条件与游标轴见 `docs/02` §9-7；当前靠 `?projectKey` + 指纹缓存收敛 |

## 9. 实施顺序与验收（全部完成）

### 9.1 M1 批次（2026-09-22）

1. ✅ **组装骨架**：DI 改造 `createAgentServer`，接入 core 服务，Zod 校验中间件
2. ✅ **命令通道**：`/api/agent/new` + `POST /api/agent/:id` + 信封映射（curl 验收过）
3. ✅ **SSE 路由**：时序/帧/心跳/六关闭条件（`curl -N` + 单测验收流式输出）
4. ✅ **浏览路由**：sessions 全家 + §8-2/3 core 缺口补齐
5. ✅ **安全**：Host / Origin 校验（原 token 与 SSE 票据于同日 ADR-0007 删除，新增 Sec-Fetch-Site）
6. ✅ **收尾**：优雅退出（SIGTERM 验收 session_shutdown 帧送达后进程干净退出）+
   `registryVersion` 轮询端点；静态托管代码就位

### 9.2 补齐批次 B3–B7（2026-02）

模型域（B3）· 会话域增强 export/auto-name/thinking/revision/summary/正文搜索/外部写入探测/transient（B4）·
文件与 git/worktree（B5）· 资源域（B6）· lease+idle 回收+推送（B7）。批次切分与验收见表 `docs/07` §6。

### 9.3 验收命令

- `packages/server/test/server.test.ts`（**66 用例**：安全层三闸 / 信封映射 / 浏览 / 项目 / SSE / 模型 / 资源 / 系统均覆盖）；
  手工验证用 `curl -N` 对 SSE 端点即可（序列与时序见 §5.1）
- `pnpm turbo run lint build test` 全绿（protocol 33 / core 184 / server 66 用例）

### 9.4 代码地图

`src/server.ts`（DI 装配 + `/api/health`）、`src/security.ts`（三道闸，ADR-0007）、
`src/sse.ts`（SSE 传输层与关停注册表）、`src/envelope.ts`（信封映射）、
`src/routes/{agent,sessions,projects,models,system,resources,push}.ts`（七域路由）、
`src/main.ts`（启动、core 服务装配、push 投递、优雅退出）、`test/server.test.ts`（66 用例）；
core 侧 `read/session-read-service.ts`（列表/详情/导出/auto-name/指纹缓存）、`read/project-resolver.ts`
（git 归一，ADR-0008）、`system/`（PathGuard + 文件/git/worktree）、`config/`（模型域）、
`resources/`（技能与插件）、`agent/liveness.ts`（lease + push）、`agent/extension-ui-bridge.ts`（ADR-0012）。

> **前端未开工**：`apps/web` 目录尚未创建（ADR-0002），因此生产静态托管目前实际不挂目录；
> 验收线仍是 docs/01 §7「浏览器完成一轮带工具调用的编程任务」，待 client/ui/web 落地。
