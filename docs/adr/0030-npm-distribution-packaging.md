# ADR-0030：npm 分发包 `@ice-ai/pi-boat` 的打包策略——单文件 ESM bundle + 内嵌 Web 静态产物

- 日期：2026-09-29
- 状态：已接受（Accepted）
- 关联文档：`docs/04-server-design.md` §8-7（生产 bin 的模块解析遗留问题）、`docs/01-overview.md` §5.2.1（谁拉起 agent server）
- 关联决策：落地 ADR-0004 的主分发包 `@ice-ai/pi-boat`；补充 ADR-0001 的 bin `piboat`

## 背景

ADR-0004 定了主分发包 `@ice-ai/pi-boat` 与 `publishConfig`，但一直没到打包落地。首次真实发布（v1.2.5）暴露三个必须当场定死的问题：

1. **tsc 产物不能直接跑**。全仓 `moduleResolution: bundler` + `module: ESNext`，tsc 产出的
   `import './start'` 不带扩展名；Node ESM 直接执行 `node dist/main.js` 会 `ERR_MODULE_NOT_FOUND`
   （`docs/04` §8-7 早就挂着这条，标为"遗留到 M4 打包"）。
2. **内部包是否随之发布**。`protocol` / `core` / `server` 现在都是 `private: true`，若主包依赖它们，
   要么把它们一并公开（一次发 4+ 个包、各自的版本与破坏性语义都要维护），要么把运行时打进一个包。
3. **Web 静态产物如何随包分发**。生产形态是单进程托管页面（`docs/01` §5.1），
   npm 安装后不能再依赖仓库布局（`packages/server/<dir>` 推导 `apps/web/dist`）。

## 决策

**主分发包 = 一个自带 CLI 与 Web 静态产物的自包含单包；内部包不单独发布。**

| 项 | 值 |
|---|---|
| 包名 / 版本 | `@ice-ai/pi-boat`（ADR-0004）；本次 `1.2.5` |
| 包目录 | `packages/pi-boat/`（加入 workspace） |
| bin | `piboat` → `dist/piboat.mjs`（已修订：ADR-0031 改为 `pi-boat` → `dist/pi-boat.mjs`，2026-09-30） |
| 产物 | `dist/piboat.mjs`（单文件 ESM）+ `dist/web/`（`apps/web/dist` 原样拷贝）（文件名随 ADR-0031 改为 `dist/pi-boat.mjs`） |
| 打包器 | esbuild（已是 vite 依赖链成员，不新增重型工具） |
| external | `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`、`proper-lockfile`——列为 `dependencies` |
| 发布源 | `publishConfig` 固化 `registry.npmjs.org` + `access: public`（ADR-0004） |

1. **bundle 而不是发多包**。`protocol` / `core` / `server` 的 dist 全部内联进 `piboat.mjs`，
   回避了"内部包要不要公开命名空间、版本怎么对齐"的长期维护面；代价是用户侧多打一份约 1 MB 的文件。
   内部包保持 `private: true`，将来出现独立消费方（如第三方客户端）时再单独立项发布。
2. **SDK 保持 external**。pi SDK 含动态导入与运行时资源，打进 bundle 得不偿失，且它本身就是
   用户的运行时前提（与 `pi` CLI 共用 `~/.pi/agent`）。`proper-lockfile` 同为运行时依赖，一并 external。
3. **启动序列抽成 `startPiboatServer()`**（`packages/server/src/start.ts`），
   仓库内入口 `main.ts` 与 CLI 共用；`staticRoot` 由调用方显式传入——
   仓库内按布局推导，分发包读 `dist/web`，两者不再互相污染。
4. **构建脚本负责组装**：`packages/pi-boat/scripts/build.mjs` 先跑 `turbo run build`
   （保证各包 dist 与 `apps/web/dist` 最新），再 bundle、拷贝静态产物、把根 README 复制进包内
   （npm 页面读包内 README）。挂 `prepack`，故 `npm publish` 一条命令即可复现。
5. **版本号单源**：分发包 `packages/pi-boat/package.json` 是唯一版本源（`release.mjs` 只 bump 它）。
   CLI 侧 bundle 时用 esbuild `define` 注入 `__PIBOAT_VERSION__`；界面侧由 `apps/web/vite.config.ts`
   构建期直读同一份 package.json，`define` 注入 `__APP_VERSION__`。原先手写的
   `packages/client/src/version.ts` `CLIENT_VERSION` 已删除——它不在版本单点里，`1.3.2` / `1.3.3`
   两次发布都漏改、页面停在旧版本（2026-09-30 修复根因）。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 公开全部内部包，主包依赖它们 | ❌ | 5 个包的版本/破坏性语义都要维护；首个外部消费方出现前没有收益（违反"不加期权"） |
| 用 tsc 直出 + 修 moduleResolution 为 NodeNext | ❌ | 需要全仓源码补 `.js` 扩展名（数百处），且每个包要各自发布，成本远高于 bundle |
| 用 vite/rollup 打包 | ❌（暂） | esbuild 已在依赖树内、API 极简；单入口 CLI 没有代码分割需求 |
| 静态产物改从 CDN/远端加载 | ❌ | 违背"纯本地"定位（`docs/01` §1） |

## 后果

**正面**

- 用户侧 `npx @ice-ai/pi-boat@latest` 一条命令即完整产品：页面 + API + SSE 同源，默认 `127.0.0.1:9527`
- 发布流程可复现：`pnpm bundle` / `npm publish`（prepack）产出确定；tarball 约 2.7 MB / 解包 13 MB
- 内部包的 `private: true` 与依赖铁律不变，`core` 仍与传输/分发无关

**负面 / 已知风险**

- 首次发布必须走官方源 + granular token（本地 npm 源是镜像，`publishConfig` 已对冲误发）
- bundle 内联使"哪段代码来自哪个包"在产物里不可读；排障以 sourcemap 为准（当前未随包分发 sourcemap）
- 单文件 1 MB + 12 MB 静态产物会随前端增长；若 Web 产物显著膨胀，需重新评估按需拆分

## 验证记录

```text
2026-09-29 · 干净目录 npm install tarball
  ✓ node_modules/.bin/piboat --version       → 1.2.5
  ✓ piboat --port 9997 --no-open             → listening on http://127.0.0.1:9997
  ✓ GET /api/health                          → {"ok":true,"name":"piboat-server","piVersion":"0.87.1"}
  ✓ GET /                                    → <title>PiBoat</title>（静态产物托管生效）
```
