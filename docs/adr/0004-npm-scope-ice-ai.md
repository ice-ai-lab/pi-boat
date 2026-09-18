# ADR-0004：npm scope 变更为 @ice-ai/*

- 日期：2026-09-18
- 状态：已接受
- 关联文档：修订 ADR-0001 的 npm scope 决策；`docs/01-overview.md` §9.1

## 背景

ADR-0001 定名时选定 scope `@pi-boat/*`（彼时因 `pi-studio` 撞名改道）。M0 完成后确定将发布至 npmjs，暴露两个问题：

1. **主分发包命名困境**：scope = 产品名，主包将被迫成为 `@pi-boat/pi-boat`（冗余）、`@pi-boat/server`（主产品藏在子包名后，发现性差），或赌 unscoped `pi-boat` 不被抢注——pi 生态正活跃扩张（SDK 出品方自身即发布 `@agegr/pi-web`），而 ADR-0001 的起因恰是同类抢注（`pi-studio`）。
2. **发布者命名空间缺失**：作者持有 npmjs 组织 `ice-ai`（账号 `mabaoguo` 为 owner，CLI 已验证）。发布者命名空间与产品名分离是多产品的自然形态，与上游 SDK 一致（`@earendil-works/pi-coding-agent` = 公司/产品）。

注册表核查（2026-09-18）：unscoped `pi-boat`、unscoped `ice-ai` 均未被占，`@ice-ai/*` 下无任何包；组织已创建（npmjs.com/org/ice-ai）。

## 决策

| 项 | 值 |
|---|---|
| workspace 包名 | `@pi-boat/*` → **`@ice-ai/*`**（protocol / core / server / client / ui / typescript-config，含全部 import 与 tsconfig extends） |
| 主分发包（未来） | **`@ice-ai/pi-boat`**；`publishConfig` 固化 `{ "access": "public", "registry": "https://registry.npmjs.org" }`（对冲开发者本地镜像源误发） |
| 不变项 | 仓库名 `pi-boat`、根 package.json（private）、bin 命令 `piboat` / `piboat-server` |

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 维持 `@pi-boat/*` | 否 | 主包命名困境无解（见背景 1） |
| 抢注 unscoped `pi-boat` 作主包 | 否 | 与生态抢注风险对赌；无多产品归拢能力 |
| 内部包留 `@pi-boat/*`，仅主包用 `@ice-ai/pi-boat` | 否 | 单仓双 scope，自找混乱 |

## 影响

- 全仓 import / package.json / tsconfig extends / 文档一次性替换，`pnpm install` 重建 lockfile；此刻零外部依赖者，是成本最低时点（发布后再改即等于弃号重来）
- 后续发布操作须走官方源 + granular token（账号开启 auth-and-writes 2FA；开发者本地 npm 全局源为镜像，详见 `publishConfig` 决策）
