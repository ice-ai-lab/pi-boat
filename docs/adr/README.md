# 架构决策记录（ADR）索引

> 新增 ADR：编号递增（格式见 [0001](0001-project-naming.md)），写完文件后**同步在下方表格追加一行**。
> 状态取值：已接受 / 已废弃 / 被 NNNN 取代（原条目保留，不删除）。

| 编号 | 标题 | 状态 | 日期 |
|---|---|---|---|
| [0001](0001-project-naming.md) | 项目定名 pi-boat | 已接受 | 2026-09-18 |
| [0002](0002-web-frontend-vite-react-spa.md) | Web 前端采用 Vite + React 19 SPA，不引入 Next.js | 已接受 | 2026-09-18 |
| [0003](0003-biome-and-typescript-7.md) | 代码质量工具链采用 Biome，TypeScript 升级 7 原生版 | 已接受 | 2026-09-18 |
| [0004](0004-npm-scope-ice-ai.md) | npm scope 变更为 @ice-ai/*（修订 ADR-0001） | 已接受 | 2026-09-18 |
| [0005](0005-protocol-zod-schema.md) | protocol 保留 Zod schema 作为类型单一真相源（否决纯 TS type 方案） | 已接受 | 2026-09-20 |
| [0006](0006-protocol-package.md) | 独立 protocol 契约包——前后端唯一契约层 | 已接受 | 2026-09-20 |
| [0007](0007-local-auth-without-token.md) | 本机鉴权删除 Bearer token 与 SSE 票据——Host / Origin / Sec-Fetch-Site 三闸常开 | 已接受（LAN 段被 0014 取代） | 2026-09-22 |
| [0008](0008-project-grouping-and-list-cache.md) | 项目分组（projectKey 归一）与会话列表缓存——列表性能分层 | 已接受 | 2026-09-22 |
| [0009](0009-frontend-stack.md) | 前端技术栈与分层（client / ui / web）——Tailwind v4 / Axios / TanStack Query 边界 / 不引外部 skills | 已接受 | 2026-09-22 |
| [0010](0010-sdk-0-87-alignment.md) | pi SDK 从 0.85.x 对齐到 0.87.x（含 system / usage / context_edit 三类新记录的处理） | 已接受 | 2026-01 |
| [0011](0011-model-scope-and-catalog-refresh.md) | 模型可见范围（enabledModels）与目录刷新——完整引擎 + 全局可写/项目只读 + 仅手动刷新 | 已接受 | 2026-01 |
| [0012](0012-extension-ui-channel.md) | 扩展 UI 双向通道——采用 SDK RPC 面的 9 个 method，不引入 TUI 渲染 | 已接受 | 2026-01 |
| [0013](0013-session-resume-and-external-write-detection.md) | 冷会话恢复走显式 `POST /resume`；外部写入检测只在全量读路径做 | 已接受 | 2026-01 |
| [0014](0014-phase-one-scope-exclusions.md) | 一期范围排除与延后（鉴权 / 登录 / 终端 / 内建子代理运行时）；部分取代 0007 | 已接受 | 2026-01 |
| [0015](0015-drop-exact-system-prompt.md) | 纯聊天不做精确系统提示词覆写——systemPrompt 一律按 pi 默认组装（撤销 G2-10） | 已接受 | 2026-09-24 |
| [0016](0016-drop-web-push-notifications.md) | 删除 Web Push 完成通知（撤销 G2-13） | 已接受 | 2026-09-25 |
| [0017](0017-sdk-types-as-protocol.md) | SDK 类型即协议——protocol 复用 pi-ai / pi-coding-agent 类型，不重复定义（部分取代 0006，修订 0005） | 已接受 | 2026-01 |
| [0018](0018-cross-package-type-resolution.md) | 跨包引用类型解析走源码、运行时走 dist（tsconfig paths + build 清空 + vitest alias） | 已废弃（2026-09-25 当天撤销） | 2026-09-25 |
| [0019](0019-frontend-phase-one-scope.md) | 前端一期范围与复用策略——按设计规范页面功能（i18n 单语 / 深色 F5 / ui 容器例外四处 / G2-11 前端绕过 / 单路由 ?s= / 视觉走原型；修订 docs/06 深色时点） | 已接受（决策 6 被 0020 取代；决策 1/3 被 0021 修订） | 2026-09-27 |
| [0020](0020-visual-baseline.md) | 前端视觉基准定为统一 Web 设计规范——Token 与组件样式逐条对齐（推翻 0019 §6「视觉走原型 v3」） | 已接受（§4 的 mermaid 一句被 0021 修订） | 2026-01 |
| [0021](0021-i18n-three-locales.md) | i18n 三语（en / zh-CN / ja）——引入设计规范 registry 架构，Provider 放 ui（推翻 0019 决策 1「zh-CN 单语」） | 已接受 | 2026-09-26 |
| [0022](0022-parity-protocol-increments-and-brand.md) |按设计规范所需的协议增量与品牌口径——搜索片段 `SessionSearchHit` / health `piVersion`（core 的 SDK `VERSION`）/ 品牌与页面标题统一 `PiBoat`（回答 10 §7 Q1） | 已接受 | 2026-09-26 |
