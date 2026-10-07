# PiBoat

[English](./README.md) | **简体中文**

> 载着 pi 航行的船 —— 基于 [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) SDK 的**本机 AI 编程助手**，一核多端。

PiBoat 与 pi CLI 共用同一份本机配置与会话文件：终端里 pi 聊过的会话，浏览器里能继续聊；浏览器里配好的模型与凭据，终端同样生效。它只跑在你自己的电脑上（默认绑定 `127.0.0.1`），没有账号、没有云端中转、没有遥测。

**一条命令启动，浏览器即用**：`npx @ice-ai/pi-boat@latest`

![PiBoat 演示：终端里用 pi CLI 开会话，浏览器里接着聊](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/pi-boat-demo.gif)

---

## 一核多端

PiBoat 的定位不是"又一个 Web 版 pi"，而是**一套核心 + 多个前端**。Agent 的全部业务逻辑只在 `packages/` 里写一次，`apps/` 下的每个前端都是薄壳，只负责渲染与交互。前端与核心之间用同一套 HTTP + SSE 契约通信；这套契约刻意做到传输无关，因此 Node.js 进程模型（Electron、移动端、插件）都能原样复用。

| 端 | 状态 | 说明 |
| --- | --- | --- |
| **Web** | ✅ 当前版本已交付 | 浏览器访问本机 Agent；单进程即完整产品（页面 + API + SSE 同源） |
| **桌面（Electron，macOS）** | ✅ 当前版本已交付 | 同一个单进程 server 的原生窗口：壳自己拉起 server（不要求系统 Node），复用同一套 Web UI、会话与设置 |
| **移动 / 其他** | 📋 远期 | 传输无关的核心 + 浏览器原生 SSE，对移动端天然友好 |

> **当前版本已实现 Web 端与 macOS 桌面端，移动端尚未开工**。核心与契约已按多端设计：`packages/core` 不含任何 HTTP 概念，协议也不绑定传输方式，新增端不需要改动核心逻辑。

---

## 功能特性

- **会话工作区**：按项目分组浏览、恢复、重命名、导出、删除会话；显示运行状态、上下文用量、费用与压缩（compaction）详情。
- **两种分支方式**：从某条历史消息**新建独立会话**，或在当前会话内**就地编辑分叉**。
- **项目文件工具**：浏览与上传文件、查看 Git diff、预览源码 / Markdown / 图片 / 音频 / PDF，并随外部改动自动刷新（DOCX 等二进制文件提供下载）。
- **Git worktree**：同一仓库及其 worktree 的会话归为同一个项目，每个会话都会显示自己所在的 worktree 分支。
- **可视化配置**：provider 登录与 API Key、模型、模型连通性测试、插件包与技能，都能在页面内管理，无需回到命令行。
- **三种界面语言**：English / 简体中文 / 日本語，首次跟随浏览器语言，可在设置里切换。

Web 端快速走览——对话、项目文件与系统面板：

![PiBoat Web 端走览：对话、项目文件与系统面板](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-demo.gif)

| 会话统计与用量 | 设置 |
| --- | --- |
| ![会话统计：消息数、token、费用、上下文与缓存命中率](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-session-stats.png) | ![设置：界面语言、聊天内容宽度与字号](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-settings.png) |

**工具与源码查看**：工具调用、文件浏览、Git diff 与语法高亮的源码预览集中在同一界面。

![工具面板与源码查看器](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/web-source-viewer.png)

---

## 快速开始

PiBoat 需要 **Node.js ≥ 22.19.0**（pi SDK 的要求）。先用 `node --version` 确认，然后：

```bash
npx @ice-ai/pi-boat@latest
```

CLI 会在服务就绪后自动打开浏览器。如果没有自动打开，请手动访问 <http://127.0.0.1:9527>。服务默认只监听 `127.0.0.1`。

如果还没有配置任何模型 provider，启动后打开 **模型** 面板登录或填入 API Key 即可。

全局安装 `pi-boat` 命令：

```bash
npm install -g @ice-ai/pi-boat@latest
pi-boat
```

升级：`Ctrl+C` 停掉正在运行的进程，重新执行上面的安装命令即可。卸载：`npm uninstall -g @ice-ai/pi-boat`。

### 桌面应用（macOS）

桌面端是同一个本地 server 的原生窗口（不要求系统 Node，也不需要重复配置）：关窗后任务在后台继续跑，退出前会询问进行中的任务，目录选择走系统原生对话框，菜单里可复制服务地址、用浏览器打开同一个实例。

![PiBoat macOS 桌面端](https://raw.githubusercontent.com/ice-ai-lab/pi-boat/main/docs/images/desktop-macos.png)

目前从仓库自行打包（签名安装包与自动更新在路线图上，见 [ADR-0035](./docs/adr/0035-electron-desktop-shell.md)）：

```bash
pnpm install
pnpm --filter @ice-ai/desktop run package   # 产出 apps/desktop/release/mac-arm64/PiBoat.app（未签名）
```

### 启动参数

命令行参数优先于环境变量。

| 参数或环境变量 | 作用 | 默认值 |
| --- | --- | --- |
| `-h`, `--help` | 打印启动选项并退出 | — |
| `-v`, `--version` | 打印版本并退出 | — |
| `-p <端口>`, `--port <端口>` 或 `PORT` | 监听端口 | `9527` |
| `--no-open` | 启动后不自动打开浏览器 | 自动打开 |

```bash
pi-boat --help
pi-boat -p 8080 --no-open
PORT=8080 pi-boat
```

---

## 使用说明

- **Agent 数据**：PiBoat 默认读取 pi 的数据目录 `~/.pi/agent`，会话文件位于 `sessions/<编码后的 cwd>/<时间戳>_<uuid>.jsonl`。设置 `PI_CODING_AGENT_DIR` 可指向另一个 pi agent 目录。
- **文件系统权限**：PiBoat 需要读取 agent 数据目录，以及会话记录里的工作目录。要与已有的 pi 会话互通，请在同一个文件系统环境（同一台机器、同一用户）里运行。
- **配置共享**：模型面板读写的是 pi 的模型、设置与凭据存储，两个界面的改动互相可见。
- **文件访问边界**：文件浏览器只覆盖你在 PiBoat 里选中的工作目录，以及它已知的项目 / 会话根目录；它不是通用文件系统浏览器。
- **并发写入**：pi CLI 与 PiBoat 同时写同一个会话文件不受支持。服务端会在全量读取时检测外部写入并重建运行时，但运行期间不检测。

### 安全

服务默认只绑定回环地址，并常开三道闸（Host 校验防 DNS 重绑定、Origin 校验防 CSRF、`Sec-Fetch-Site` 拦截跨站请求）。**不要**把 PiBoat 直接暴露到公网；它对本机文件系统拥有完整权限。

---

## 开发

```bash
pnpm install         # Node ≥ 22.19（engines 强制）
pnpm turbo run dev   # agent server (9527, tsx watch) + web (9528, vite dev，/api 代理到 9527)
pnpm turbo run build
pnpm turbo run test  # Vitest（core / protocol / client / ui）+ Playwright（web E2E）
pnpm turbo run lint  # Biome 2
```

`pnpm turbo run dev` 会同时拉起两个进程：agent server 提供 API 与 SSE，vite dev 提供页面与热更新，并把 `/api` 代理到 server —— 浏览器视角与生产同源。生产模式下由 server 直接托管 web 构建产物，单进程即完整产品。

打包 npm 分发包（`dist/pi-boat.mjs` + `dist/web/`）：

```bash
pnpm bundle
```

### 仓库结构

```text
apps/web            前端 SPA：Vite + React 19（当前交付端）
apps/desktop        Electron 桌面端（macOS，同一 server 的原生窗口）
packages/protocol   API 契约与事件 wire 格式（纯类型 + Zod，零业务逻辑）
packages/core       Agent 业务核心（全仓唯一允许依赖 pi SDK 的包，传输无关）
packages/server     Hono HTTP/SSE 服务，组装 core（bin: pi-boat-server）
packages/client     类型安全的客户端 SDK + React hooks
packages/ui         纯展示组件库（只依赖 protocol 类型与 client hooks）
packages/pi-boat    npm 分发包：`pi-boat` CLI（打包 server + web 静态产物）
```

依赖方向**自上而下单向**，违反即 bug：`apps/* → client → protocol`；`apps/server → core → protocol`。任何包都不得绕过 core 直接 import pi SDK。

---

## 文档与决策

- 概要设计：[`docs/01-overview.md`](./docs/01-overview.md)（分层架构、进程模型、事件流协议、已知风险）
- 架构决策记录：[`docs/adr/`](./docs/adr/README.md)（命名、依赖规则、传输协议等）
- 协作规则：[`AGENTS.md`](./AGENTS.md)

## 第三方资源

见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

---

## 参考项目

当前项目对这些项目有参考和改进：

- <https://github.com/agegr/pi-web>
- <https://github.com/deepseek-ai/deepseek-harness>

## 许可证

[MIT](./LICENSE)。第三方组件遵循其自身许可证，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
