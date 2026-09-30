# ADR-0031：bin 命令改为 `pi-boat` / `pi-boat-server`

- 日期：2026-09-30
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md`、`docs/04-server-design.md`
- 关联决策：修订 ADR-0001 的 bin 项；配合 ADR-0004（npm scope）、ADR-0030（npm 分发打包）

## 背景

ADR-0001 定名时把 bin 命令定为 `piboat` / `piboat-server`（无连字符的紧凑写法，理由见该 ADR 后果节：避开 `boat@1.2.4` 的全局命令冲突、好打好记）。但包名与仓库名一直写作 `pi-boat`，于是同一套标识出现两种拼写分裂：

- 装的是 `@ice-ai/pi-boat`、目录是 `packages/pi-boat`，执行的却是 `piboat`
- 文档、`--help`、日志前缀与包名对不上，读者需在脑子里做一次 `piboat` ↔ `pi-boat` 映射

进入首次对外发布（`1.3.0`）时，这个不一致从"风格问题"变成有真实成本的文档与心智负担。此刻是改名的成本最低点：

- npm 上仅有占位的 `0.0.1`，无真实外部用户
- Electron / 直连等消费方尚未落地，无下游依赖 `bin` 名或 `health.name`

## 决策

**用户可见命令与产物统一到连字符拼写 `pi-boat`。**

| 项 | 旧值 | 新值 |
|---|---|---|
| 用户主命令 | `piboat` | `pi-boat` |
| 服务入口命令 | `piboat-server` | `pi-boat-server` |
| bundle 产物 | `dist/piboat.mjs` | `dist/pi-boat.mjs` |
| health 标识 | `"name": "piboat-server"` | `"name": "pi-boat-server"` |

配套同步：`--help` 与错误提示文案、stdout 日志前缀（`[piboat]` → `[pi-boat]`）、README / docs 命令示例、AGENTS.md 包说明；`CLIENT_VERSION` 与包版本升 minor（`1.2.5` → `1.3.0`）。

**不变项**（有意保留，避免扩大破坏面）：

- 包名 `@ice-ai/pi-boat`、仓库名、npm scope（ADR-0004）
- 产品代号 **PiBoat**（驼峰）与页面标题（ADR-0022）
- 前端 localStorage 键前缀（`piboat:theme` 等）与磁盘格式常量——与命令名无关，改名会使既有用户设置失效
- 代码内部标识符（`startPiboatServer`、`PiboatServerHandle`、`PiBoatEvent`、`__PIBOAT_VERSION__` 等）——不对外暴露

## 后果

**正面**

- 命令名、包名、仓库名、目录名统一为 `pi-boat`，去掉"要不要打连字符"的心智负担
- 全局安装后 `pi-boat` 与 `npx @ice-ai/pi-boat` 拼写一致，更易发现与记忆
- 改在发布前，无外部用户受影响；`health.name` 无兼容负担

**负面 / 已知风险**

- 属破坏性变更（命令名变更），按 semver 升 minor 到 `1.3.0`
- `piboat` 命令不再提供，也不申请占用该空名（避免维护第二个 bin 造成双入口）

## 验证记录

2026-09-30 · 本地

```text
✓ pnpm turbo run build                  → 6/6 通过
✓ pnpm turbo run test                   → 7/7 通过（server 73 用例，含 health.name = pi-boat-server 断言）
✓ pnpm --filter @ice-ai/pi-boat bundle  → dist/pi-boat.mjs（1.1 MB）+ dist/web/
✓ npm pack                              → ice-ai-pi-boat-1.3.0.tgz（2.7 MB / 394 files）
✓ 干净目录 npm i <tarball>               → node_modules/.bin/pi-boat 生成
✓ pi-boat --version                     → 1.3.0
```
