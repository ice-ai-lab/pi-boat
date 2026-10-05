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
| [0011](0011-model-scope-and-catalog-refresh.md) | 模型可见范围（enabledModels）与目录刷新——完整引擎 + 全局可写/项目只读 + 仅手动刷新 | 已接受（① 的 prune / resync 被 0027 删除） | 2026-01 |
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
| [0023](0023-session-tree-wire-projection.md) | 会话树改为 wire 投影——分支导航只要 id/角色/预览，不要整条 entry（ADR-0017 的显式例外） | 已接受 | 2026-09-26 |
| [0024](0024-defer-media-images.md) | 图片惰性化（`deferMedia`）——空 data 占位 + 按坐标取字节，端点收拢为 `/entries/:entryId/image` | 已接受 | 2026-09-26 |
| [0025](0025-settings-master-detail-provider-auth.md) | 设置面板主从化——恢复「Web 内管理 API Key」与 provider 用量查询（部分取代 0014 §2）；插件 disable 改为保留来源清空过滤器 | 已接受 | 2026-01 |
| [0026](0026-project-scoped-session-list.md) | 会话列表按项目取数——`projectKey` 下推到扫描层 + 按范围缓存 + 运行态会话随列表带回 cwd（`runningSessionIds` → `runningSessions`，提交标注 `!`） | 已接受 | 2026-09-27 |
| [0027](0027-drop-model-scope-prune-resync.md) | 删除可见范围的 prune / resync 批量修复操作——只留 toggle（修订 0011①） | 已接受 | 2026-09-27 |
| [0028](0028-css-modules-by-domain.md) | 组件级 CSS 按域就近模块化（CSS Modules）——全局表只留共享钩子与未接线规范类 | 已接受 | 2026-01 |
| [0029](0029-source-highlight-shiki-reuse.md) | 源码高亮统一复用 shiki——双主题经 CSS 变量下发，ui 不订阅宿主主题（关闭 `docs/09` §7 Q3） | 已接受 | 2026-09-29 |
| [0030](0030-npm-distribution-packaging.md) | npm 分发包 `@ice-ai/pi-boat` 的打包策略——单文件 ESM bundle + 内嵌 Web 静态产物 | 已接受 | 2026-09-29 |
| [0031](0031-cli-bin-rename.md) | bin 命令改为 `pi-boat` / `pi-boat-server`——命令名与包名统一（修订 0001 的 bin 项） | 已接受 | 2026-09-30 |
| [0032](0032-default-model-and-thinking-setting.md) | 选择列表钉选设「新会话默认模型 / 默认推理级别」，显式配置写全局 settings.json（收窄 0019 决策 4 边界，落实 07 G2-11 预留方案） | 已接受 | 2026-10-05 |
| [0033](0033-sdk-1-0-2-alignment.md) | pi SDK 从 0.87.x 对齐到 1.0.2——preflightResult 判据反转；新能力分级：disposition / exposure / thinkingLevel 搭车采纳，MCP / codemode 等延后立项 | 已接受 | 2026-10-05 |
