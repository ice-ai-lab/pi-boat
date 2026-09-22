# ADR-0007：本机鉴权删除 Bearer token 与 SSE 票据——Host / Origin / Sec-Fetch-Site 三闸常开

- 日期：2026-09-22
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §5.2.1 / §5.2.2 / §5.6 / §9-4；`docs/02-protocol-inventory.md` §2 / §7 / §9-4；`docs/04-server-design.md` §2 / §6 / §7 / §8-6；AGENTS.md「新增路由检查清单」
- 关联决策：ADR-0002（Web 前端独立 server + Vite SPA，开发期 2 进程）

## 背景

M1 按 `docs/01-overview.md` §5.6 落地了三道防护闸：① Host 校验（防 DNS 重绑定）② Origin 校验（防 CSRF）③ Bearer token（随机生成，`PI_BOAT_TOKEN` 可指定、`PI_BOAT_NO_TOKEN=1` 可关）+ SSE 一次性票据（`POST /api/agent/:id/sse-ticket`，30s、按会话绑定、用后即焚）。

复核时两个事实推翻了 ③ 的必要性：

**事实 1：参考实现 pi-web（0.9.1）的默认形态没有 token。** 其 `middleware.js` 只做 Host 校验（`localhost` / `*.localhost` / 任意 IP / `PI_WEB_HOSTNAME` + `PI_WEB_ALLOWED_HOSTS`）与 `/api/*` 的 Origin + `Sec-Fetch-Site` 校验；密钥是**可选**的 `PI_WEB_PASSWORD`（未设置则完全跳过凭据校验），`bin/pi-web.js` 也仅在绑定非回环地址时警告"建议启用密码或走可信 VPN"。即：**回环地址 + 浏览器头校验 = 默认足够；离开回环才引入凭据**，而那时引入的是用户可输入的口令（cookie/Basic），不是随机 token。

**事实 2：token 是票据层存在的唯一理由，而它给 SPA 带来的成本落在还没写的代码上。** `EventSource` 无法携带 header，所以有了票据仓 + 换票端点 + 二次握手（`docs/02` §2 自陈"与 token 鉴权配套"）。更麻烦的是取 token：生产同源可以注入 `index.html`，但**开发期页面在 9528、API 在 9527，跨源页面读不到注入值**，`docs/01` §5.2.2 的"token 经同源 bootstrap 下发"在 dev 形态下不成立，只能手工粘贴或另开 dev 旁路。

**威胁逐个对照：token 相对 ①② 的差集只有一格。**

| 攻击路径 | ① Host | ② Origin | ③ token |
|---|---|---|---|
| DNS 重绑定（`evil.com` → 127.0.0.1） | Host 是 `evil.com` → 拒 | Origin 是 `evil.com` → 拒 | 拒 |
| 跨源 `fetch` / `XHR` / `EventSource` | — | 浏览器恒带 Origin → 拒 | 拒 |
| `<img>`/`<script>`/表单导航等无 Origin 的跨站子资源请求 | 放行（Host 本就是回环） | 无 Origin → **放行** | **拒** |

也就是说 token 唯一独有地挡住了最后一行。而现有路由的写操作**全部**是 `POST`/`PATCH`/`DELETE`（`routes/agent.ts` 的 `new` / 命令通道、`routes/sessions.ts` 的改名/删除），GET 全为读，读的响应被 CORS 挡住——攻击者拿不到数据。token 的边际价值因此收缩为"不依赖 header 校验正确性的第二道闸"，而它防不住真正的本地攻击者（同用户进程读得到 env / stdout）。

## 决策

**删除 ③：Bearer token 与 SSE 一次性票据一并移除**；常开两道闸，并新增一道覆盖 token 差集的校验：

1. **Host 校验（不可关）**：只认回环主机名 `localhost` / `127.0.0.1` / `[::1]`（含端口），比 pi-web 的"任意 IP"更严——我们不提供非回环绑定
2. **Origin 校验（不可关）**：带 Origin 才校验；白名单 = 同源 ∪ dev web（9528）
3. **Sec-Fetch-Site 校验（新增，不可关）**：值为 `cross-site` 一律 403。它精确覆盖上表最后一行（跨站子资源请求），且 `Sec-` 前缀是 forbidden header name，页面 JS 无法伪造；`same-site` 必须放行——dev 期 `localhost:9528 → localhost:9527` 正是 same-site cross-origin

随之确立一条**新的硬约束：GET 不得有副作用**。无 Origin 的跨站 GET 不再有凭据兜底，一个有副作用的 GET 会被直接利用；此约束写进 AGENTS.md 与 `docs/04` §6 的路由检查清单。

删除清单（破坏性协议变更）：

| 位置 | 删除内容 |
|---|---|
| `packages/server/src/security.ts` | `SseTicketStore` 整类、token 分支、SSE 路径正则；新增 Sec-Fetch-Site 校验 |
| `packages/server/src/routes/agent.ts` | `POST /api/agent/:id/sse-ticket` 路由与 `ticketStore` 依赖 |
| `packages/protocol/src/rest/agent.ts` | `agentSseTicketPath` / `SseTicketResponseSchema` / `AgentEventsQuerySchema`（含类型） |
| `packages/server/src/main.ts` | `PI_BOAT_TOKEN` / `PI_BOAT_NO_TOKEN` / stdout token 打印 |
| `packages/server/src/server.ts` | `AgentServerDeps.token` 与票据仓装配 |

LAN 场景（`docs/01` §9-4 待定项）**另议**：届时应引入的是用户可输入的口令（pi-web 的 `PI_WEB_PASSWORD` ⊕ cookie 会话 / Basic 形态），而不是随机 token——手机用户没法输入一个启动时随机、只在终端里出现过一次的字符串。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 维持现状（随机 token + 票据） | ❌ 放弃 | 边际价值仅一格（无 Origin 的跨站子资源请求），该格由三行 Sec-Fetch-Site 校验即可覆盖；成本却是票据仓 + 换票端点 + 二次握手 + 3 个协议导出 + dev 期无法自洽的 bootstrap |
| token 换 SameSite=Strict cookie（同源自动携带，顺带干掉票据层） | ⏸ 延后 | 形态上确实优于现状（cookie 同源自动携带，`EventSource` 也自动带，票据层消失；且 `localhost:9528 → 9527` 属 same-site，Strict 在 dev 也成立，见 RFC6265bis §4.1.2.7 / §5.2）。但引入 cookie + 跨源凭证（`credentials: 'include'` + ACAO/ACAC）调试面，且"持有凭据"的增益已被 Sec-Fetch-Site 覆盖；LAN 场景真正需要的可输入口令届时一并设计 |
| 只留 Host + Origin（完全对齐 pi-web，不加 Sec-Fetch-Site） | ❌ 放弃 | 无 Origin 的跨站 GET 那一格裸露；补上它只需三行，没有理由不补 |
| 口令 + cookie + 限流（pi-web `PI_WEB_PASSWORD` 形态） | ❌ M1 不采用 | 纯本地回环、单用户，登录页是纯摩擦；仅在开 LAN（多设备接入、可能非可信网络）时才有价值 |
| 引入 CSRF token（double-submit cookie） | ❌ 不采用 | 与随机 token 同类问题（跨源页面拿不到），且需要写路径才生效，SSE 与只读 API 无收益 |

## 后果

**正面**

- 净减代码：server 去掉票据仓、换票路由、token 装配与环境变量；protocol 去掉 3 个导出；单测去掉票据用例，其余用例不再需要注入 Bearer 头
- **SPA 侧零配置**：鉴权 bootstrap 需求消失（`docs/01` §5.2.2 / `docs/04` §7 的"token 经 bootstrap 下发"作废），dev 跨源直连不再需要任何取 token 的旁路——这削掉了尚未开写的 `packages/client` 上一块最别扭的接口
- 与 pi-web 默认形态对齐，后续对照/移植成本降低
- `docs/04` §8-6 记录的"票据端点"缺口随之关闭

**负面 / 已知风险**

- 防护从"三道闸"降为"两道闸 + Sec-Fetch-Site"：Origin 校验若被改松（如把 dev 白名单扩成通配）便没有凭据兜底。补偿：Sec-Fetch-Site 与 Host/Origin 同为不可关，且写进检查清单
- **GET 无副作用从良好实践升级为硬约束**，靠 code review 与检查清单守（新增路由第 ④ 条）
- dev 期页面与 API **必须使用同一主机名**（都 `localhost` 或都 `127.0.0.1`）：混用属 cross-site，会被 ③ 拦下。原先 `DEV_WEB_ORIGINS` 同时放行两种变体，这个便利现在只对"Origin 精确匹配"有效，Sec-Fetch-Site 仍需同站
- Electron 二期（`app://` / `file://` 页面，Origin 为 `null`）**本就不在白名单内**，是独立待解问题；本决策不使之恶化（token 也解决不了 Origin 校验），但二期开工时须一并给出白名单策略
- LAN 访问（§9-4）成本上升：不再是"打开开关 + 强制 token"，而必须设计口令/配对流程——这是把它推后而非取消
- 协议破坏性变更：commit 须用 `!` 标注。**`PROTOCOL_VERSION` 沿用 2026-09-22 shell 直连移除（`28b50dd`）的先例暂不 bump**——M1 尚未对外发布、无独立消费端（server 与 web 同源同发、形状不匹配由 TS 在编译期拦截），基准在首次对外发布时统一定

## 验证记录

```bash
# 2026-09-22 · 落地后核查
rg -n "PI_BOAT_TOKEN|PI_BOAT_NO_TOKEN|SseTicketStore|agentSseTicketPath|sse-ticket" packages apps docs
  → 代码/协议零残留；命中仅：ADR-0007 自身、docs/adr/README 索引行、
    docs/04 的撤销记述（§3 表已删行、§8-6）

pnpm turbo run build test lint → 全绿（server 28 / core 55 / protocol 28 用例）

# 对运行中的 dev server（tsx watch，127.0.0.1:9527）做真机验收
curl -s -o /dev/null -w '%{http_code}' …
  200  /api/health                        （无额外头）
  200  /api/sessions                      （无额外头：无凭据也可访问）
  403  /api/sessions                      Sec-Fetch-Site: cross-site
  403  /api/sessions                      Origin: https://evil.example.com
  403  /api/sessions                      Host: evil.example.com:9527
  404  /api/agent/nope/events             （无额外头：冷会话 404，证明无 401 拦截）
```

单测覆盖：SSE 建流无需凭据 → 200 + `text/event-stream`；建流同样受三闸保护（cross-site / 异常 Host → 403）；
same-site / same-origin / 无 `Sec-Fetch-*` 头 → 放行。
