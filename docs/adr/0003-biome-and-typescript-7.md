# ADR-0003：代码质量工具链采用 Biome，TypeScript 升级 7 原生版

- 日期：2026-09-18
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §4；替代 M0 初期的 ESLint 9 + typescript-eslint 方案

## 背景

M0 骨架按概要设计 v0.2 §4 搭建了 ESLint 9 flat + `@pi-boat/eslint-config`（typescript-eslint recommended）。同期 TypeScript 锁在 `~5.9.3`：typescript-eslint v8 内嵌 TS 编译器的 JS API，对 7.x（Go 原生重写版）的兼容未经生态验证，是升级 TS 的主要阻碍——两者实为同一决策链。

## 决策

| 项 | 值 |
|---|---|
| lint / format | **Biome 2.5** 替代 ESLint（及原计划引入的 Prettier），一工具两用 |
| 配置形态 | **根 `biome.json` 单配置**（recommended preset + formatter + organizeImports assist，vcs 挂 .gitignore）；各包 `lint` 脚本 = `biome check .`（向上查找根配置）；删除 `@pi-boat/eslint-config` 包 |
| TypeScript | 全仓 `~7.0.2`（Go 原生实现，bin 仍为 `tsc`）；lint 与 TS 版本自此解耦（Biome 自研解析器） |
| 常用命令 | `pnpm lint`（turbo 分包跑）/ `pnpm lint:fix`（= `biome check --write .`，格式化+自动修复）/ `pnpm format` |

## 理由

- 单工具替代 ESLint + Prettier（Rust 实现、零插件依赖链）；lockfile 净减约 900 行
- 项目当前只用**非类型感知** lint 规则（与原 tseslint recommended 同级），Biome recommended 完全覆盖；React hooks 规则（`useExhaustiveDependencies` / `useHookAtTopLevel`）内置，M1 前端落地直接受益
- TS 7 原生 tsc：全仓 typecheck 进入亚秒级；升 7 的阻碍（typescript-eslint）随 Biome 替换而消失
- ESLint 生态的真实价值（类型感知规则、专项插件）现阶段不需要；将来需要时可局部并行引入，不推翻本决策

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 维持 ESLint 9 + typescript-eslint | ❌ 放弃 | 双工具（+Prettier）、插件链重；且钉死 TS 升级路径 |
| ESLint 10 + Biome 只做 format | ❌ 放弃 | 仍双工具，收益不叠加 |
| TS 停留 5.9 / 6.0 桥接版 | ❌ 放弃 | Biome 解耦后无必要；6.0 仅为生态迁移过渡线 |

## 后果

**正面**

- 工具链少一个包（eslint-config 删除）、CI lint 显著提速；TS 7 解锁
- 格式化有了统一事实源（此前 Prettier 尚未接入即被替代，零迁移成本）

**负面 / 已知风险**

- Biome 无类型感知规则：将来若需要（边界类型约束、深度 exhaustive-deps 等），再评估并行 ESLint（仅 type-aware 规则）——记录于此，不预设
- TS 7 处于大版本早期（7.0.2），冷门 flag 兼容风险存在；当前 tsconfig 全部 flag（verbatimModuleSyntax / noUncheckedIndexedAccess / declarationMap…）已实测通过
- 编辑器需安装 Biome 官方扩展（替代 ESLint/Prettier 扩展）

## 验证记录

```bash
# 2026-09-18 · 切换落地
tsc --version    → 7.0.2（原生）
biome --version  → 2.5.14
pnpm turbo run build / test / lint / typecheck → 5 / 4 / 5 / 8 任务全绿
pnpm turbo run typecheck → 232ms（原生编译器）
git diff --stat pnpm-lock.yaml → 净减 ~896 行（ESLint 生态移除）
server dev 冒烟：GET /api/health → {"ok":true,"name":"piboat-server"} ✅
```
