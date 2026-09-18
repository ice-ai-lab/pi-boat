# ADR-0001：项目定名 pi-boat

- 日期：2026-09-18
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §9.1

## 背景

概要设计自 v0.1 起使用占位名 `pi-studio`（scope `@pi-studio/*`）。进入工程骨架（M0）前必须定名——包名、bin 命令、仓库名此后都会固化。

npm 注册表核查（2026-09-18）发现：

- `pi-studio` 已被占用（v0.9.60，活跃），且**同属 pi 生态**——其描述为 "Two-pane browser workspace for pi with prompt/response editing, annotations, critiques…"，与本项目为同类工具
- 连带 `@pi-studio/*` scope 无法注册；npx 分发与搜索发现均会与该包撞车

## 决策

| 项 | 值 |
|---|---|
| 项目代号 | **PiBoat**（驼峰） |
| 包名 / 仓库名 | `pi-boat` |
| npm scope | `@pi-boat/*`（npm scope 允许连字符）（已修订：ADR-0004 变更为 `@ice-ai/*`，2026-09-18） |
| bin 命令 | `piboat`（用户主命令，单进程即完整产品）；`piboat-server`（`packages/server` 的服务入口） |

命名含义：**产品 = 载着 pi 航行的船。** 船体 = core + server（常驻本机），甲板 = web / desktop / mobile 多个前端，与"一核多端"架构互为隐喻；亦呼应 pi SDK 出品方 Earendil Works 之名来源（Eärendil the Mariner，航海者）。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| `pi-studio`（原占位） | ❌ 出局 | npm 被同生态同类工具占用（v0.9.60），scope 不可注册 |
| `Vingilot` | ❌ 出局 | 叙事最佳（Eärendil 之船）但可读性差，中文团队/用户读不顺 |
| `PiDeck` | 强备选 | 好读、有"控制台"工具感；败于 boat 的"船体—甲板"包含关系更贴一核多端 |
| `Zhuishu`（缀术） | 备选 | 祖冲之算 π 之著作，"缀"合多端双关；zh 拼音对国际用户有门槛 |
| `Pier` / `piper` / `spigot` / `milu` / `piport` / `hearth` / `pilothouse` / `agentden` | ❌ 出局 | npm 已被占用 |
| **`pi-boat` / `piboat`** | ✅ 采用 | npm 全空；两音节，中英文零门槛 |

## 后果

**正面**

- 命名空间干净：核查时 `pi-boat` / `piboat` 在 npm 均无占用
- bin 用 `piboat` 而非 `boat`，避开 `boat@1.2.4` 的全局命令冲突
- 好读、好打、好记；`piboat start`（"开船"）自带亲和梗
- 叙事与产品结构自洽，且代码层与上游 pi 零耦合（依赖已收敛于 `@pi-boat/core` 一包，未来更换 SDK 底层名字不尴尬）

**负面 / 已知风险**

- `boat` 是"载具"而非"控制台"，工具感弱于 `deck` —— 接受此 trade-off
- GitHub 上可能存在 Raspberry Pi 无人船类同名 DIY 项目（不同领域、影响低；**注册组织/仓库前需人工确认一次**）
- 域名（piboat.dev 等）为可选项，未核查

## 验证记录

```bash
# 2026-09-18 · npm registry 核查
pi-boat   ✅ 可用
piboat    ✅ 可用
boat      ❌ 1.2.4（bin 不用 boat 即规避全局冲突）
pi-studio ❌ 0.9.60（同生态竞品，出局主因）
```
