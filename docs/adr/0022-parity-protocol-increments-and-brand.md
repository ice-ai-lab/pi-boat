# ADR-0022：协议增量与界面品牌口径（会话搜索片段 / health piVersion / `PiBoat`）

- 日期：2026-09-26
- 状态：已接受（Accepted）
- 关联文档：`docs/09-frontend-design-checklist.md` §5.7 / §6（T2-3、T1-5、T3-1）、`docs/04-server-design.md` §4、`docs/05-client-design.md`
- 关联决策：**回答 `docs/09` §7 的 Q1**（品牌名取 `PiBoat`）；修订 `docs/09` §7 Q4 的取向（文件查看器模式文案以规范为准，后续单独落）；ADR-0017（protocol 复用 SDK 类型）与 ADR-0020（视觉基准设计规范）在本 ADR 内继续生效

## 背景

第二轮一致性复核（`docs/09`）把差异收敛到「组件层」，但其中三条要求**前端拿不到数据**，
必须在协议/后端上补一处最小增量，否则只能在前端造近似形态（正是 ADR-0020 要避免的）：

1. **T2-3 会话搜索结果**：A 侧结果项是三段式（标题 / cwd+时间 / **正文片段 + `<mark>` 高亮**），
   而 B 的 `GET /api/sessions/search` 只回 `sessions: SessionInfo[]`——没有命中片段，也没有命中条目锚点。
2. **T3-1 空态版本块**：A 侧品牌行右侧写「web vX / pi vY」。B 的 pi SDK 版本没有对外出口；
   在 web 侧手抄 `0.87.1` 会造出第二份版本真相（违反 AGENTS.md 的 SDK 单一来源）。
3. **界面品牌口径**：侧栏字标 / 空态 / 占位符 / 文档标题此前混用旧原型名，需要定一个明确口径。
   2026-09-26 定案：界面品牌与页面标题统一取 `PiBoat`（与 ADR-0001 的项目名一致，不引入第二品牌）。

## 决策

**1. 界面品牌与页面标题统一为 `PiBoat`（回答 Q1）。**

- `apps/web/index.html`：`<title>PiBoat</title>`、`description` = "PiBoat interface for the pi coding agent"、`application-name` = "PiBoat"、`<html lang="en" translate="no" class="notranslate">`。
- 运行期窗口标题规则：`<项目目录名> - PiBoat`（无项目时 `PiBoat`），并用 `MutationObserver` 保持不被第三方改写。
- 侧栏字标、空态品牌行、占位符文案一律 `PiBoat`。
- 仓库名、包名、CLI 名称仍是 pi-boat/`@ice-ai/*`：**`PiBoat` 是界面品牌，不是项目名**（ADR-0001 不变）。

**2. 会话搜索响应扩展为「命中片段」形状（取代旧的 `sessions` 数组）。**

- protocol：`SessionSearchResponse = { results: SessionSearchHit[]; truncated: boolean }`，
  `SessionSearchHit = { session, entryId, blockIndex, before, match, after }`。
- core：`SessionReadService.searchDetailed(q)`——轻量字段（名字 / 首条消息）命中直接产出片段；
  未命中的按原有界正文扫描逐行找首个命中条目，同时给出 `entryId`（条目锚点）与 ±60 字符片段。
  上限 50 条，超出置 `truncated: true`。原有 `search()` 保留（有界扫描语义不变）。
- server：`GET /api/sessions/search` 改回新形状。
- 口径由 `packages/core/test/session-read-service.test.ts` 的两条用例锁定
  （正文命中带 entryId；轻量命中 entryId 为 null）。

**3. pi SDK 版本经 core 出到 `/api/health`（不手抄第二份版本）。**

- core 新增 `PI_VERSION`（`import { VERSION } from '@earendil-works/pi-coding-agent'`）——
  只有 core 允许 import SDK（AGENTS.md 依赖铁律）。
- protocol：`HealthResponse` 增 `piVersion: string`；server 在 `/api/health` 回应。
- web：`useServerInfo()` 一次拿到连通性与 `piVersion`，空态版本块展示 `web v<APP_VERSION>` /
  `pi v<piVersion>`；`APP_VERSION` 从 client 的 `CLIENT_VERSION` 派生。

**4. `apps/web/public/` 纳入版本管理并排除出 Biome。**

- 新增 （32 个图标，自 A 沿用）与
  （空态品牌行 32×32 图标）。
- `biome.json` `files.includes` 排除 `*/public/**`、`*/dist/**`、`*/test-results/**`、
  `*/playwright-report/**`——静态资源不该走源码 lint。

## 备选方案与被否理由

- **前端造片段**（把 `sessions` 结果在前端拼一段摘要）：B 的列表项不携带正文，前端拿不到命中上下文，
  只能显示首条消息——正是 A 与 B「不像」的来源；且会为将来接 A 的 entryId 跳转再改一次协议。
- **web 侧写死 pi 版本**：多一份版本真相，SDK 升级（ADR-0010）时会漂移；且违反「SDK 已导出的信息一律复用」。
- **另行引入第二界面品牌**：与仓库名 / 包名 / CLI 名不一致，反而多一处需要维护的映射；沿用 `PiBoat` 最省心（ADR-0001）。

## 影响

- 协议出现一处**破坏性变更**（`SessionSearchResponse` 形状）；一期无外部消费者，前端同步改完即可。
- `docs/09` 的 T2-3 / T3-1 由此从「前端近似」变为「按规范结构落地」；Q1 关闭。
- 仍待拍板的：Q3（源码高亮库：规范侧用 react-syntax-highlighter，本仓现有 shiki）、
  Q4（文件查看器模式文案）、Q5/Q6（live watch / load-more / DOCX 需要后端前置）。
