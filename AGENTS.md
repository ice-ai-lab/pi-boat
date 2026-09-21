# AGENTS.md — pi-boat

> 载着 pi 航行的船：基于 `@earendil-works/pi-coding-agent` SDK 的本地 AI 编程助手（一核多端）。
> 完整设计见 `docs/01-overview.md`；重大决策记录见 `docs/adr/`。

## 必读文档（动架构前）

- `docs/01-overview.md` —— 分层架构、进程模型、事件流协议、已知风险（§8 坑清单）
- `docs/adr/` —— 所有已定决策及理由（0001 命名；后续：SDK 升级、WebSocket 引入等均须 ADR）

## 常用命令（M0 落地后核对一遍）

```bash
pnpm install                # Node ≥ 22.19（engines 强制）
pnpm turbo run dev          # 目前仅 agent server (9527, tsx watch)；web 前端待建后加入（vite dev, 9528）
pnpm turbo run build        # 全量构建（M0 验收线）
pnpm turbo run test         # Vitest（core/protocol/client/ui）
pnpm turbo run lint         # Biome 2（lint + format；修复用 pnpm lint:fix）
```

- 开发期浏览器页面来自 9528（vite dev，web 待建），API/SSE 直连 9527（CORS 白名单已预留 `http://localhost:9528`）；端口单一来源为 `protocol` 的 `PORTS`，server 可用 `PORT` 环境变量覆盖
- 提交前 `build + test` 全绿

## Monorepo 结构与依赖铁律

```
apps/web          前端 SPA —— Vite + React 19 静态产物（待建，决策见 ADR-0002）
apps/desktop      Electron（二期，未建）
packages/protocol 纯类型 + Zod schema，零业务逻辑 —— 前后端唯一契约
packages/core     Agent 业务核心 —— 全仓唯一允许依赖 pi SDK 的包
packages/server   Hono HTTP/SSE 服务，组装 core，原生模块收敛于此
packages/client   类型安全 client SDK + React hooks
packages/ui       纯展示组件，只依赖 protocol 类型与 client hooks
packages/config/  typescript-config（Biome 配置在根 biome.json，见 ADR-0003）
```

依赖方向**自上而下单向**，违反即 bug：

- `apps/*` → client → protocol；`apps/server` → core → protocol
- **任何包不得绕过 core 直接 import pi-coding-agent**
- `core` 传输无关：不得引入任何 HTTP 概念（为 Electron 进程内直连留路）
- `ui` 不得依赖任何宿主框架（Next.js / Electron 等）
- SDK 版本锁 `0.85.x`；升级必须单独 PR + 新 ADR + 全量回归

## 代码规范（只列 lint 管不了的，按需增长）

- 简单优先：默认写最朴素的可行实现；“简洁”指最少概念与间接层，不是最短代码。抽象/别名/包装层须有第二个真实用例或已记录的分叉需求；条件/递归类型等高级语法仅在简单方案确实不够时使用，就近注释一句为什么（出处：NewSessionInput 无变化轴别名教训，2026-09-18）
- 事件对外投影统一走 `toWireAgentEvent()`（core），wire 类型只在 protocol 定义；SDK 事件字段变动不许泄漏出 core（流式 toolcall 增量的 id/toolName 补齐即在此层完成）
- 新增路由必须过 allowed-roots / 鉴权检查清单（server 拥有宿主机文件系统全部权限）
- 提交消息用 Conventional Commits：`<type>(<scope>): <描述>`；type 限定 feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert；scope 用包名或目录（core/server/protocol/client/ui/web/docs）；破坏性变更用 `!` 或 `BREAKING CHANGE:` 脚注（采纳 Conventional Commits 1.0.0，2026-09-18）
- 提交纪律：AI 不主动 `git commit` / `git push`——完成改动后停在未提交状态，附建议的 commit 消息等用户明确指令（2026-09-18 定案）

## 测试

- 单测 Vitest；web E2E 用 Playwright
- 改动 SDK 相关代码须跑事件快照回归（防事件格式漂移）

## 文档与决策

- 架构级变更（进程模型、传输协议、依赖规则、包结构）→ 先读相关 ADR，定案后新增 `docs/adr/NNNN-*.md`（编号递增，格式见 0001），并同步更新 `docs/adr/README.md` 索引
- 概要设计与代码不一致时：以代码为准，并当天更新文档
- 文档文件名一律英文 kebab-case：`docs/NN-slug.md`、`docs/adr/NNNN-slug.md`；内容中文，不做双语维护（评估过 deepseek-harness 的双语 + 门禁体系后定案暂不引入，2026-09-18）

## 维护

- 规则只在被纠正第二次后写入（一次是意外，两次是规则）；写入时附一句出处
- 本文件保持 < 200 行；超了先删过时条目再考虑拆分（子包 AGENTS.md / .cursor 规则）
- 结束会话前：若本次有值得沉淀的规则或决策，列出 diff 提议更新本文件或新增 ADR，等确认后提交
