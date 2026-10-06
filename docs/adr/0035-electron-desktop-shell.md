# ADR-0035：Electron 桌面端——壳进程编排与 renderer 同源接入

- 日期：2026-10-06
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §5.2 / §5.5 / §6（二期范围）· ADR-0007（无凭据三闸）·
  ADR-0009（baseURL 相对路径 `/api`）· ADR-0030（`@ice-ai/pi-boat` 分发包）
- 外部参照：DeepSeek Harness（DSH，`github.com/deepseek-ai/deepseek-harness`，MIT）的
  `apps/desktop` 与 `docs/architecture.md`——仅参照架构形状与工程对策，未移植代码；
  `THIRD_PARTY_NOTICES.md` 无需变更（若后续移植具体实现再登记）

## 背景

M4 桌面端（`docs/01` §7.2）开工前须定四件事：进程编排、renderer 接入方式、构建与打包、窗口生命周期。
`docs/01` §5.5 已给推荐路径（main 拉起 server 子进程 + renderer 复用 web UI），本 ADR 把它落成可执行决策。

开工前对照了 DSH 桌面端的实际实现（本地源码核验：`apps/desktop/src/main.ts` 的 `protocol.handle`、
`web-document.ts` 的 `forwardWebRequest`、`docs/architecture.md`「Desktop application」节）：

- DSH 用 Electron RunAsNode 子进程跑 Desktop Host（完整 Web 应用），默认 **OS 分配端口**
  （`webserver.config.port` 可覆盖），与 CLI 的固定 3080 分离
- 窗口页面住 `dsh-app://app` **自定义协议假源**：静态资产由主进程直读磁盘，API 请求经主进程
  改写 URL 并注入 Host 签发的认证 cookie 转发（`forwardWebRequest`），WebSocket 经
  `onBeforeSendHeaders` 改头直连；凭据只存在主进程内存，页面脚本与外部浏览器都拿不到
- 该机制为「认证 Host + 页面先于服务就绪渲染」而生——DSH 有 DeepSeek 账号体系，Host 是
  authenticated 的，这是它与本仓架构分叉的根源

本仓定位纯本地、无账号无凭据（ADR-0007 / ADR-0014；2026-10-06 用户定案：桌面端不需要登录、
不需要凭据），不具备采纳该路线的前提。分叉是**有意的**。

## 决策

| 项 | 值 |
|---|---|
| 包名 / 位置 | `@ice-ai/desktop`（`apps/desktop`，private）；**版本与 `@ice-ai/pi-boat` 绑定、同版本发布**——壳 API、web 产物、server 作为一个组合验证（DSH 同款原则） |
| 构建工具 | main + preload 用 **esbuild** bundle（external: electron；ADR-0030 同款思路）；**不引 electron-vite、不用 create-electron 脚手架模板**（版本组合与本仓冲突、renderer 流水线闲置；升级触发条件：preload/main 出现第三方 npm 依赖、入口增多、或明确要 main 热重启） |
| 包结构 | `src/main/`（`index.ts` 生命周期 / `server-process.ts` 子进程编排 / `window.ts`）+ `src/preload/index.ts`（contextBridge 窄桥）+ `scripts/build.mjs` + `test/`；**无 `src/renderer/`**——renderer 零自有代码，复用 `apps/web` 产物 |
| 进程模型 | main 获取单实例锁 → `spawn(process.execPath, [pi-boat.mjs], { env: { ELECTRON_RUN_AS_NODE: '1' } })` 拉起 server 子进程（RunAsNode + `--expose-internals`，DSH 同款；不要求用户装系统 Node） |
| server 产物 | 依赖 npm 分发包 `@ice-ai/pi-boat`（自带 `dist/pi-boat.mjs` + `dist/web`）；desktop 不二次 bundle |
| 就绪信号 | 解析子进程 stdout 的 `[pi-boat-server] listening on <url>`（`packages/server/src/start.ts` 既有 stdout 契约）；超时/失败进恢复界面 |
| 端口 | 默认 `PORT=0`（OS 分配），从就绪日志取实际端口；保留覆盖入口；多开与 CLI（9527）天然不冲突 |
| renderer 接入 | `loadURL('http://127.0.0.1:<port>')` **同源**——三闸（Host/Origin/Sec-Fetch-Site）零改动放行，`AgentClient` 相对路径 baseURL 原样工作（ADR-0009）；**不引入自定义协议与请求转发** |
| 浏览器访问 | 桌面端拉起的实例浏览器同样可访问（无凭据的副产品，**有意保留**）；应用菜单提供「复制服务地址」入口 |
| dev 工作流 | desktop dev 仅 `loadURL('http://127.0.0.1:9528')` 复用 `turbo dev` 两进程，不拉子进程；dev/prod 同一份 main 代码，按 `app.isPackaged` 分支 |
| 窗口生命周期 | 关窗=隐藏（页面与子进程继续跑、任务不中断），macOS 经 Dock / Windows 经最小托盘恢复；显式退出前经 server 询问进行中任务（v1 用 `GET /api/agent/running`），确认后 kill 子进程（SIGTERM 优雅退出已由 `start.ts` 实现，含 `disposeAll('server_shutdown')`） |
| 原生能力 | preload `contextBridge` 窄桥；第一项=原生目录选择对话框（选完仍走 `POST /api/cwd/validate`）；业务 API 一律不经 IPC |
| Electron 侧防护 | sandbox / contextIsolation 开、nodeIntegration 关；`will-navigate` + `setWindowOpenHandler` 拦外部导航（外链交系统浏览器）；IPC handler 校验 sender frame URL |
| 打包 | electron-builder；asar 只装 `dependencies`（main bundle 内联 devDeps），加 `desktop-bundle-imports` 式静态检查在打包期抓不可解析裸导入；pi SDK 运行时资产 `asarUnpack` |
| Node 底线 | 选定 Electron 版本的内嵌 Node 须 ≥ 22.19（SDK engines），不足先升 Electron |
| 二期后续（逐项立项，不养期货） | 自动更新（electron-updater + 签名/公证，发布通道未定）、全局快捷键、`pi-boat` CLI 安装器（DSH Manage Command 式，用桌面端同版本运行时）、多工作区窗口 |

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| `dsh-app://` 自定义协议 + 主进程请求转发（DSH 路线） | ❌ | 为认证与「页面先于服务渲染」而生；本仓无凭据，照搬只买复杂度（转发层、cookie 注入、hop-by-hop 头处理、WS 改头），且页面源不再是 server 源，② 闸要开 Origin 例外（违反 docs/04 §6 清单③的默认立场） |
| `file://` 加载 web 产物 | ❌ | Origin `file://` 撞 ② 闸 403；资源路径与缓存行为差 |
| main 直接 import core、业务走 IPC | ❌ | `docs/01` §5.2.2 已否决：56 端点双份映射维护，web/desktop 行为分叉 |
| 依赖用户系统 Node 启动子进程 | ❌ | 提高安装门槛；DSH 已证明 RunAsNode 生产可行 |
| 固定 9527（与 CLI 同端口） | ⏸ 备选 | 单实例下可行，多开必撞；默认 OS 分配、保留覆盖入口即可 |
| electron-vite / create-electron 脚手架 | ❌（暂） | 脚手架自带版本组合与自有 renderer 工程，与本仓冲突（ADR-0009 否决外部模板同因）；electron-vite 5（peer vite ^5–^7）虽兼容本仓，但无自有 renderer 时其核心流水线闲置；迁移成本低（`src/main`/`src/preload` 目录约定一致），留触发条件 |

## 后果

**正面**

- desktop 源码面 = main 编排 + preload 窄桥，零业务逻辑；web 端功能自动到达桌面端
- 浏览器 / CLI / 桌面三入口共享同一 server、同一份会话状态（同源语义）
- 关键工程对策全部有 DSH 生产验证（RunAsNode、单实例锁、关窗隐藏、electron-builder 依赖策略）
- 桌面端实例可被浏览器访问，与「一核多端」定位自洽（同一个 server 的多个客户端）

**负面 / 已知风险**

- Electron 内嵌 Node 版本被 SDK engines（≥22.19）反向约束；SDK 升级抬高底线时桌面端被动跟随
- 安装包体积：Electron runtime + pi SDK + 静态产物，预计 100MB+ 量级
- 退出询问 v1 只覆盖「进行中会话」维度（本仓无排队/定时任务域可供查询）
- 自动更新与签名/公证不在本 ADR 范围；`GET /api/app-update` 维持排除（`docs/07` §8-5）

## 验证（M4 验收线）

macOS 安装包：安装 → 启动 → 窗口出页面 → 跑通一轮带工具调用的会话 → 关窗重开任务仍在 →
退出无残留进程；「复制服务地址」在浏览器打开同一实例且状态一致。

## 实现附记（2026-10-06，M4 落地时）

打包链路实测发现的落地细节（决策不变，粒度比原表述更粗/更细之处在此登记）：

- **asarUnpack 落地为 `node_modules/**` 全量解包**：RunAsNode 子进程是普通 Node，读不了 asar
  —— `@ice-ai/pi-boat` 整树（入口 + dist/web + SDK 依赖链）必须在真实文件系统上，否则子进程
  require 不到依赖。asar 只包 desktop 自有的 main/preload/恢复页。「pi SDK 运行时资产
  asarUnpack」的具体形式即此，比按包枚举更不易漏。
- 端口覆盖入口定为环境变量 `PIBOAT_PORT`（默认 0 = OS 分配；非法值回落 0）。
- 打包应用 Finder 启动时 PATH 极简（/usr/bin:/bin…）：子进程 env 用用户登录 shell
  （`$SHELL -l -c 'printf %s "$PATH"'`，3s 超时）兑底一份完整 PATH，取不到维持继承；
  仅打包态调用。
- `--expose-internals` 按决策表保留（DSH 同款），本仓 bundle 对它无实际消费。
- 「desktop-bundle-imports 静态检查」落地为 build.mjs 内的 esbuild metafile 白名单校验
  （electron + node:* 之外的 external 导入即报错）；Electron 内嵌 Node 底线由 build.mjs
  与 `test/release-constraints.test.ts` 双闸把关（Electron 44.5.1 = Node 24.21.0）。
- 应用菜单/托盘/恢复页文案用英文（与 CLI 口径一致）；i18n 三语（ADR-0021）只覆盖 web UI。
- 窄桥第一项（原生目录选择）已接入 `packages/ui` 的 DirectoryPicker：特性检测
  `window.piBoat?.pickDirectory`，浏览器环境零变化；选中路径仍走 `POST /api/cwd/validate`。
- `scripts/release.mjs` 同步 bump `apps/desktop/package.json` 版本（同版本发布的机械化保障，
  另有测试锁定相等性）。
