# ADR-0018：跨包引用类型解析走源码、运行时走 dist（paths + vitest alias）

- 日期：2026-09-25
- 状态：**已废弃（Deprecated，2026-09-25 当天撤销）**
- 关联文档：`AGENTS.md`「Monorepo 结构与依赖铁律」；`packages/{core,server,client,ui}/tsconfig.json` 与 `tsconfig.build.json`；`packages/{core,server}/vitest.config.ts`
- 关联决策：ADR-0006（独立 protocol 契约包）、ADR-0017（SDK 类型即协议）

> **撤销记录（2026-09-25）**：方案已完整实施并验证全绿，但**代价不被接受**——它把「类型/IDE 看 src」与「运行时看 dist」劈成两套解析，并引入 8 处必须手工同步的配置（其中漏 `vitest.config.ts` 是**静默**假绿）。现决定恢复「dist 是唯一解析目标」，跨包引用一律按 `exports` 解析到 `dist`。
>
> **本条目刻意保留**：它记录了实测证据与失败模式（TS6059、Vite 不读 paths、turbo 缓存看不见跨包源码），供将来重新评估时直接引用，避免重复探索。**代码里已无任何 `paths` / alias 配置。**

## 背景

症状：protocol 里的 `AgentRunningState` 在 IDE 里 Find Usages 恒为 0，尽管 core 的
`getRunningState()` 返回它、server 的两个路由转手它。

机理：包间引用一律写包名（全仓 21 个文件 `from '@ice-ai/protocol'`），解析交给 `package.json`
的 `exports` → `dist/index.d.ts`。于是 **`protocol/src` 里的声明与 `dist` 里的声明是两个文件、两个符号**：
`declarationMap` 只保证 Cmd/Ctrl+点击能跳回源码，不建立符号同一性，而 WebStorm 的 TS 引用搜索由 TS
语言服务驱动——从 src 那个符号出发自然找不到任何引用（没人 import src）。

为什么不干脆让 `exports` 指向 src、彻底去掉 dist：

1. **Node ESM 只认 `exports` + 显式扩展名**，而 protocol 的 src 内部是免扩展名相对导入（`'../constants'`）；
2. 生产是 `node dist/main.js`（server），`@ice-ai/protocol` 必须有可被 Node 直接加载的产物；
3. tsx / Vitest 能跑 `.ts` 源码，Node 不能——dist 就是「runtime 的真身」。

## 决策

**类型解析走源码，运行时（emit 产物）走 dist，三处配置配套：**

1. 消费方包（core / server / client / ui）的 `tsconfig.json`（noEmit，IDE 与 `pnpm typecheck` 用）
   加 `paths`：`@ice-ai/protocol` → `../protocol/src/index.ts`；
2. 同一批包的 `tsconfig.build.json` 加 `"paths": {}` 显式抵消继承——构建 emit 仍以
   `protocol/dist/*.d.ts` 为准（否则 tsc 把 `protocol/src` 拉进本包程序并报
   `TS6059: ... is not under 'rootDir'`）；
3. **带测试的包**（core / server）加 `vitest.config.ts` 的 `resolve.alias` 指向同一份 src——
   Vite **不读** tsconfig 的 `paths`；
4. 将来的 Vite 应用（`apps/web`）同理需要 `resolve.alias`；新增消费方包按 1–3 补全。

protocol 自身的 `tsconfig.json` 不加 `paths`（自引用全是相对路径）。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 不改，接受「dist 是唯一真身」 | ❌ 放弃 | 跨包 Find Usages / 重命名重构永久不可用（本 ADR 的起点），只能退回全文搜符号名 |
| `exports` 直接指向 src，彻底删 dist | ❌ 放弃 | Node 需显式扩展名，protocol src 是免扩展名相对导入；且生产 `node dist/main.js` 依赖编译产物 |
| 项目引用（`composite` + `references`） | ❌ 放弃 | 收益相同（LS 的 source-of-project-reference redirect 让 IDE 读源码），但要引入 composite / tsbuildinfo / 构建图；且本仓 TS 7.0.2 是 native preview，`createLanguageService` 等 JS API 全为 `undefined`，**无法本地验证 redirect 是否对 WebStorm 生效** |
| 只在 vitest 里指 src，tsconfig 不动 | ❌ 放弃 | 变成「测试跑 src、类型看 dist」的反向分歧，IDE 症状不解决，且更容易让人误判 |
| `development` 导出条件 + `customConditions` | ❌ 放弃 | 运行时（tsx）与 TS 都可能要额外开关，概念比 paths 多，收益相同 |
| **paths + build 清空 + vitest alias（本决策）** | ✅ 当时采纳（**当天已撤销**，见状态栏） | 一次生效：IDE / typecheck / tsx dev / 测试同源；代价是三类配置必须配套 |

## 后果

**正面**

- protocol 类型的**跨包 Find Usages / 重命名重构可用**；类型直接对着源码校验，改 protocol 立刻在消费方报错
- dev（tsx）与测试跑 protocol **源码**：改 protocol 不必等 `tsc --watch` 刷 dist
- 新增依赖 SDK 类型的包（ADR-0017 的后续）不需要 dist 先行构建即可通过 typecheck

**负面 / 已知风险**

- **三类配置缺一即静默分歧**（尤其漏 `vitest.config.ts` 会退化成「类型 src / 测试 dist」）。已逐包加
  就近注释，并在 AGENTS.md 立规；新增消费方包必须三处齐全
- **dist 不再被 dev/test 覆盖**：它的新鲜度只由 `turbo run build`（`dependsOn: ["^build"]`）保证。
  若有「不 build 直接 `node dist/...`」的路径，注意 dist 可能滞后（生产启动仍应走 `pnpm turbo run build`）
- 生产仍是 dist：src 与 emit 产物的差异只会在 build 阶段暴露（这是有意的分层，不是遗漏）
- 与 pnpm 的严格 `node_modules` 相容：protocol 的 SDK 依赖从 **protocol 自己**的位置解析，不受消费方影响

## 验证记录

```bash
# 2026-09-25，改完全绿（清缓存强制执行）
pnpm turbo run build test lint typecheck --force   # → 20/20 tasks（protocol 33 / core 183 / server 64）
```

解析目标核对（core，`--listFiles`）：

```bash
tsc --noEmit --listFiles | grep -c packages/protocol/src            # → 20（typecheck 看源码）
tsc --noEmit --listFiles | grep -c packages/protocol/dist           # → 0
tsc -p tsconfig.build.json --listFiles | grep -c packages/protocol/src   # → 0（build 只看 dist）
tsc -p tsconfig.build.json --listFiles | grep -c packages/protocol/dist  # → 20
```

决定性探针（在 `protocol/src/constants.ts` 临时加一个**只存在于源码、不重建 dist** 的导出）：

- 改动前：core 的 vitest 看不到它（证明测试跑的是 dist）
- 改动后：core / server 的 vitest 与 server 的 `tsx`（dev 运行时）都能看到它（`PROBE_ONLY_IN_SRC`）
- 探针已还原，全仓无残留（`grep -rn PROBE_ONLY_IN_SRC packages apps` 为空）
