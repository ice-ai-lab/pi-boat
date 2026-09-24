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
| [0007](0007-local-auth-without-token.md) | 本机鉴权删除 Bearer token 与 SSE 票据——Host / Origin / Sec-Fetch-Site 三闸常开 | 已接受 | 2026-09-22 |
| [0008](0008-project-grouping-and-list-cache.md) | 项目分组（projectKey 归一）与会话列表缓存——列表性能分层 | 已接受 | 2026-09-22 |
| [0009](0009-frontend-stack.md) | 前端技术栈与分层（client / ui / web）——Tailwind v4 / Axios / TanStack Query 边界 / 不引外部 skills | 已接受（样式面被 0010 修订） | 2026-09-22 |
| [0010](0010-prototype-faithful-styling.md) | 前端视觉按原型逐字落地（修订 0009 样式面）——原型 CSS 单一来源 / 启用深色 / 前移界面骨架 | 已接受（承载方式被 0011 修订，原型指向被 0012 修订） | 2026-09-23 |
| [0011](0011-ui-styles-colocation-and-palette.md) | ui 样式按组件就近拆分，表面配色对齐 pi-web（修订 0010 承载方式） | 已接受 | 2026-09-24 |
| [0012](0012-visual-baseline-v4.md) | 视觉基准迁到原型 v4，v3 的功能位继承（修订 0010 的原型指向） | 已接受 | 2026-09-24 |
