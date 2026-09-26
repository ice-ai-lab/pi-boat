# pi-boat × pi-web 前端一致性审查报告

- 日期：2026-09-26（**v2**：范围边界已确认，见 §3）
- 基线（唯一真相）：`/Users/gatesma/project/WebstormProjects/pi-web` @ `http://127.0.0.1:30141`
- 受审：`/Users/gatesma/project/WebstormProjects/pi-boat` @ `http://localhost:9528`
- 依据：ADR-0020「视觉基准 = pi-web，组件层照抄 pi-web 结构与样式」
- 方法：双实例同视口截图对照（1440/1024/390 × light）+ CSS 选择器集合差集 + 逐组件源码比对 + 运行态 DOM 取证
- 截图与取证脚本：`/Users/gatesma/WorkBuddy/2026-09-26-11-02-10/piweb-audit/shots/`

> **v2 变更摘要**：范围边界已由用户确认。4 项排除（移动端 / 子代理 / 终端 / Provider 用量）与 `docs/08` §5 既有决策一致，**不要实现**；1 项 **i18n 决策被推翻** —— 从「zh-CN 单语」改为「en + zh-CN + **ja** 三语」，并需引入 pi-web 的 registry 架构（§5.9 为新工作流）。
> 由此，§5 差异矩阵中标为 `排除域` 的行、以及 §6 中 `T0-2 / T1-1 / T1-2 / T2-4 / T5-8 / T6-3` 等条目**已作废，不得动手**。

---

## 0. 一句话结论

**Token 层与 CSS 规则层基本已经"逐字照抄"到位了，真正没到位的是「组件 DOM 换类名」这一步。**
大量 pi-web 的 CSS 规则在 pi-boat 里是**已搬运但零消费方的死代码**；同时有若干组件**整块缺失**或**换了另一种形态**。所以现在"不像"的原因不是配色，而是**结构**。

三条量化结论：

| 维度 | 状态 |
|---|---|
| 颜色 / 字体 / 圆角 token | ✅ 已逐条对齐（light/dark/mist/rose/pine 五套取值完全一致） |
| CSS 规则（`globals.css` / `settings.css`） | 🟡 已搬运 ~96%，但 **40+ 条 `config-*` / `enabled-models-*` / `skill-*` / `extension-*` / `.chat-scroll-to-bottom` 规则无任何组件使用** |
| 组件 DOM 结构 | ❌ 主要差距所在：外壳、侧栏、设置壳、面板、扩展货架结构均与 pi-web 不同；mermaid / ProviderIcon / AnsiText / FrontmatterCard / EnabledModelsSection / ModelSelector / SettingsUi 全族整块缺失 |
| i18n | ❌ **完全没做**（pi-boat 零 i18n 基建，~70 个文件里的界面文案全是硬编码）。pi-web 有 701 key × 3 语；本期按确认口径做 **en + zh-CN + ja**（§5.9） |

---

## 1. 必须先修的 3 个硬 bug（与"像不像"无关，是功能坏了）

### BUG-1 【P0】`chat-scroll-to-bottom` 永远不可见
- pi-boat `packages/ui/src/chat/message-list.tsx:191` 只写了 `className="chat-scroll-to-bottom"`，**从不追加 `is-visible`**。
- 而 `packages/ui/src/styles/pi-web.css:853` 的默认态是 `opacity:0; visibility:hidden; pointer-events:none`，只有 `.chat-scroll-to-bottom.is-visible`（`pi-web.css:879`）才可见。
- **后果**：回到底部悬浮按钮**恒不可见**，"跳到最新"能力等于不存在。
- 修：`className={'chat-scroll-to-bottom' + (showJump ? ' is-visible' : '')}`；同时删掉内联 `transform`（`message-list.tsx:186-193`），改用 pi-web 的外层 wrapper 定位（`pi-web/components/ChatWindow.tsx:1325-1349`：`position:absolute; bottom:100%; left:0; right:36; paddingBottom:10; display:flex; justify-content:center; pointer-events:none`）。

### BUG-2 【P0】`.app-shell` 类从未出现在 DOM → 移动端媒体查询是死代码

**结论已定（用户确认「无需移动端布局」）：整块删掉门禁机制，不要走补 class 那条路。**

- 现状取证：`apps/web/src/index.css:45-56` 定义了 `.mobile-gate{display:none}` 与 `@media (width<880px){ .app-shell{display:none}; .mobile-gate{display:flex} }`；`MobileGate` 组件**确实挂载了**（`apps/web/src/pages/workspace-page.tsx:2,13`）。
- 但全仓 `grep app-shell` 只命中 CSS 定义这一处 —— `apps/web/src/layout/workspace-layout.tsx:248` 的根 `<div>` **只有内联 style，没有 className**，`apps/web/index.html` 的 `#root` 也没有。
- **后果**：`<880px` 时桌面壳照常渲染、门禁块被挤在 flex 列里裁切掉 —— 看到的是"半坏的桌面壳"，既不是 pi-web 的移动布局，也不是设计中的门禁页。（390px 截图为证：侧栏以抽屉形态铺满屏幕、主区被压扁。）
- **修（已定案）**：删除死代码，桌面单形态。
  1. 删 `apps/web/src/layout/mobile-gate.tsx`（整个文件）；
  2. 删 `apps/web/src/pages/workspace-page.tsx:2` 的 import 与 `:13` 的 `<MobileGate />`；
  3. 删 `apps/web/src/index.css:45-56` 整段（`.mobile-gate` + `@media (width<880px)`）；
  4. `workspace-layout.tsx:259` 保留移动抽屉遮罩注释可清掉，遮罩本身按桌面语义保留（宽屏下 CSS 已 `display:none`）。

### BUG-3 【P1】右栏在桌面端无法关闭
- pi-boat `workspace-layout.tsx:47` 硬编码 `const rightPanelFullWidth = false;`，且 `FilesPane` 顶行**没有展开 / 隐藏按钮**（`apps/web/src/panes/files-pane.tsx:37-45` 只有 `FileTabs`）。
- 而宽屏下 `.right-panel-overlay-backdrop{display:none}`（`pi-web.css:1214-1216`）—— 遮罩不可点。
- **后果**：≥960px 时右栏一旦打开（点开任一文件页签）就**再也关不掉**。
- pi-web 的对应实现：`AppShell.tsx:2435-2449`（展开，`.file-panel-expand-button`）+ `:2450-2469`（隐藏）。
- 修：`FilesPane` 顶行右侧补两个 36×36 图标按钮，回调上抛到 `workspace-layout`；`rightPanelFullWidth` 改为真实状态 `rightPanelExpanded`。

---

## 2. 页面 / 路由层对照

| pi-web | pi-boat | 判定 |
|---|---|---|
| `/` → `app/page.tsx` → `<AppShell/>` | `/` → `router.tsx` 单路由 → `<WorkspacePage/>` → `<WorkspaceLayout/>` | ✅ 结构等价（SPA 单路由，无独立页面） |
| `/login` → `app/login/page.tsx` | — | ✅ **有意删除** |
| `/api/*` 共 53 个 route handler | `packages/server` Hono 55 端点 | ✅ 后端形态不同（ADR-0004），前端不关心 |
| 无其它页面 | 无其它页面 | ✅ |

**结论：页面层没有缺口。** 差异全部在组件层 —— pi-web 是"1 个 AppShell（2544 行）统管三栏 + 39 个组件"，pi-boat 是"WorkspaceLayout（379 行）+ 6 个 pane + 49 个 ui 组件"。**分片更细不是问题，问题是分片后的结构没对着 pi-web 抄。**

---

## 3. 范围边界 —— 已确认（v2 定稿）

### 3.1 确认结论

| # | 项 | 确认结果 | 与 `docs/08` §5 的关系 |
|---|---|---|---|
| 1 | 移动端布局 | ❌ **不做** | 与 §5-5 一致 |
| 2 | Provider 用量/余额面板 | ❌ **不做** | 与 §5-7 一致（**但你的前提需纠正，见 3.2**） |
| 3 | 子代理（Agents 设置节 + 会话家族聚簇） | ❌ **不做** | 与 §5-9 / §5-10 一致 |
| 4 | **i18n** | ✅ **要做，三语：中文 / 英文 / 日语** | ⚠️ **推翻 §5-14 与 §6-1**（原定「zh-CN 单语」） |
| 5 | 终端能力 | ❌ **不做** | 与 §5-1 一致 |

**关键提示给执行方（AI）**：5 项里有 4 项与 `docs/08` §5 既有决策**完全一致** —— 也就是说这些不是"漏做"，而是**主动不做**。
本报告下文凡是标 `排除域` 的差异行、以及已划掉的整改条目，**一律不得实现**。否则会把 15 项有意差异重新建回来。

### 3.2 对第 2 条的前提纠正：pi-web **确实有** Provider 用量面板

你的判断「pi-web 好像没有」不成立。取证如下：

| 证据 | 位置 |
|---|---|
| 组件定义 | `pi-web/components/ProviderUsageSummary.tsx:28`（164 行） |
| 实际渲染点 ①（OAuth / 已登录 provider 详情） | `pi-web/components/ModelsConfig.tsx:1561` — `<ProviderUsageSummary providerId={provider.id} enabled={provider.loggedIn} />` |
| 实际渲染点 ②（API Key provider 详情） | `pi-web/components/ModelsConfig.tsx:1696` — `enabled={provider.configured}` |
| 生效范围 | 仅 9 个 provider id：`openai-codex / deepseek / openrouter / moonshotai / moonshotai-cn / minimax / minimax-cn / vercel-ai-gateway / opencode-go`（`pi-web/lib/provider-usage-ids.ts:1-11`） |
| 数据来源 | `POST /api/provider-usage/query`（`ProviderUsageSummary.tsx:66`），结果缓存进 `localStorage["pi-web:provider-usage:<id>"]` |
| 形态 | **不是一个独立面板**，而是嵌在「设置 → 模型 → 选中某个 provider」的详情底部：一行「用量」标题 + 32×30 刷新按钮（成功变绿勾 2s）+「更新于 {time}」；下方 `grid: 180px minmax(0,1fr)` 的 key/value 表（bucket + metric 两组，等宽字体） |
| 配套 i18n | `providerUsage.*` 7 个 key（`usage / notQueried / refresh / refreshing / updated / queryFailed / available`） |

所以它是**真实存在、且只在"已登录 provider 详情页里"才出现**的一小块。`docs/08` §5-7 已决定不做（理由：依赖已删的 OAuth 登录流，成本高）。

> **需要你说的只有一句话**：维持不做，还是要做？若维持不做，本节即为定稿；若要做，则 §5.5 的 G19 与 §6 阶段 5 需要加回一条（且必须先补 OAuth/API Key 的凭据查询链路）。

### 3.3 排除项的连带影响（AI 容易漏掉的地方）

子代理排除**不只是**删掉一个设置节，它连带以下 6 处也必须一并排除，否则会半做：

| 连带项 | pi-web 证据 | 处理 |
|---|---|---|
| 侧栏会话家族聚簇（root + `family.subagents` 缩进 + 机器人图标 + 折叠 chevron） | `lib/session-family.ts:46-69`、`SessionSidebar.tsx:1815-1844, 2342-2347, 2395-2412` | 不做。会话平铺即可（见 §5.2 L6） |
| 侧栏 subagent 会话过滤与完成通知抑制 | `SessionSidebar.tsx:532-536, 675-681` | 不做（无 subagent 会话即无触发） |
| `MessageView` 工具结果里的「打开子代理会话」按钮 | `MessageView.tsx:1040-1120`、`messageView` 的 `SubagentToolDetails` | 不做 |
| `AgentSessionPanel`（浮层面板第 4 个） | `AgentSessionPanel.tsx:153-240` | 不做（见 §5.6 P4） |
| i18n key | `agents.*` 42 个、`agentSwitcher.*` 14 个、`subagent.open` 1 个、`sidebar.expandSubagents` / `collapseSubagents` / `agentRunning` 3 个 | **语言包不要包含这 60 个 key**（§5.9 已扣除） |
| `settings.css` 的 12 条 `.agents-*` + `SettingsSectionIcon` 的 `is-agent` 分支 | `settings.css` | 不补（§4.2） |

> 除 §3.1 这 5 项 + §3.3 连带项外，**本报告其余所有差异都属"未完成的移植"，不在排除域内，必须做。**

---

## 4. 样式层对照（三层）

### 4.1 Token 层 ✅ 已对齐，无需改动
`packages/ui/src/theme.css` 与 pi-web `app/globals.css:24-122` 逐条一致：
`--bg/-bg-panel/-bg-hover/-bg-selected/-border/-text/-text-muted/-text-dim/-accent/-accent-hover/-accent-contrast/-user-bg/-assistant-bg/-tool-bg/-bg-subtle/-chat-content-max-width/-chat-content-font-size` × 5 套调色板（light/dark/mist/rose/pine）取值完全相同。
`@theme inline` 也已暴露 pi-web 类名（`bg-bg-panel` / `text-text-muted` / `border-border`）。
`apps/web/src/index.css:14-43` 的 `*` / `html,body` / `pre,code` 三段与 pi-web 逐字一致。
字体：`@fontsource-variable/noto-sans-mono` 提供 `--font-noto-mono`，与 pi-web 同字体同轴。✅

### 4.2 CSS 规则层：差集结果

**`globals.css` → `styles/pi-web.css`：288 vs 211 个选择器，缺 77 条，其中：**

| 缺失内容 | 判定 |
|---|---|
| `.web-login-*`（14 条）、`.terminal-*`（17 条） | ✅ 有意排除，不要补 |
| `:root` / `html` / `body` / `*` / 5 个 `[data-theme]` 块 | ✅ 已落在 `theme.css` + `index.css` |
| **`.mermaid-block*` + `.mermaid-zoom-*`（21 条）** | ❌ **真缺口** —— mermaid 未排入排除域（§5 #12 只排除"扩展自绘 UI"） |
| **`.markdown-body .katex` / `.katex-display`** | ❌ **真缺口** —— 公式渲染样式缺失 |

**`settings.css` → `styles/settings.css`：190 vs 178，缺 12 条**，全部是 `.agents-*`：
`.agents-concurrency-control(- input)`、`.agents-feature-actions`、`.agents-feature-copy(> span / > .agents-feature-reload-notice)`、`.agents-feature-setting`、`.agents-overridden-label`、`.agents-system-prompt(::-webkit-scrollbar/-thumb/-track)`
→ ✅ **排除域，确认不补**（§3.1 #3 / §3.3）。另缺 `@media(max-width:640px)` 2 条与 `@supports(-webkit-touch-callout:none)` iOS standalone 整块 —— 前者属移动端（排除），后者仅影响 iOS standalone 安装（PWA 已排除）。

> **注意（i18n 反向）**：`.settings-language-options / -option / -radio / -radio-dot / -label / -code`（`pi-web/app/settings.css:1226-1272`）在 pi-boat 里**已搬运但零消费方**（§4.3）。i18n 落地后它们将变成**必需消费**——语言选择器必须用这套类，见 §5.9。

**`ChatMinimap.module.css`（251 行）→ 完全没有移植。** pi-boat 全仓无任何 `*.module.css`。

### 4.3 已搬运但**零消费方**的死 CSS（"类已备、组件未用"）
这是本报告最重要的发现之一。以下规则在 pi-boat 里存在，但没有任何组件使用对应类名：

| 死 CSS | 位置 | 本应消费它的 pi-web 组件 |
|---|---|---|
| `.config-panel-*` / `.config-split-view` / `.config-sidebar-*` / `.config-detail-*` / `.config-footer` / `.config-button*` / `.config-switch*` / `.config-field*` / `.config-list-action*` | `styles/settings.css` | `SettingsUi.tsx` 全族 22 个导出（pi-boat **完全不存在**） |
| `.models-sidebar-*` | 同上 | `ModelsConfig.tsx` provider 树 |
| `.enabled-models-*`（含 banner / filter / row / pin） | 同上 | `EnabledModelsSection.tsx`（**缺失**） |
| `.skill-*`（detail-heading / version-row / source-link / update-status…） | 同上 | `SkillsConfig.tsx` 详情面板 |
| `.settings-dialog-*` / `.settings-section-tab*` / `.settings-mobile-section-picker` / `.settings-general-*` / `.settings-theme-option*` / `.settings-shell-option` / `.settings-chat-*` / `.settings-language-*` | 同上 | `SettingsPanel.tsx` 外壳与通用节（pi-boat 部分用、多数未用） |
| `.extension-widget-update-pulse` / `is-updating` / `.extension-widget-placement(-icon)` | `styles/pi-web.css:119-324` | `ExtensionWidgets.tsx`（未接） |
| `.chat-scroll-to-bottom.is-visible` | 同上 | 见 BUG-1 |
| `.image-preview-dialog/-image/-close` / `::backdrop` | 同上 | `ImagePreview.tsx` 灯箱（pi-boat 无此组件） |
| `.file-viewer-mode-switch` / `-mode-button` / `-load-more` / `-live-indicator` | 同上 | `FileViewer.tsx`（pi-boat 未接） |
| `.catppuccin-file-icon` + `--catppuccin-icon-*` mask | 同上 | `FileIcons.tsx`（pi-boat 用 lucide 彩色图标，**且 `apps/web/public/` 目录根本不存在**） |
| `.tool-definition-*` / `.system-prompt-*` | pi-web 写在组件内联 `<style>`，未搬运 | `ToolDefinitionsPanel` / `SystemPromptPanel` |
| `.markdown-frontmatter*` / `.markdown-custom-message` / `.markdown-compaction-message` / `.compaction-file-*` | 同上 | `FrontmatterCard` / 压缩卡片 |

### 4.4 自造类名污染（不在 pi-web 词汇表内）
pi-boat 组件大量使用 pi-web 没有的类：`sq`（`border-radius:6px`）、`hairline-b`、`bg-surface-side`、`bg-surface-raised`、`bg-line-2`、`bg-line-3`、`text-fg-faint`、`text-fg-subtle`、`bg-warn-soft`、`bg-danger-soft`、`bg-success-soft`、`bg-accent-weak`、`elev-panel`。
**整改口径**：这些别名（`theme.css:232-277`、`utilities.css`）在"改造后的区域"一律换成 pi-web 的 `--bg/-bg-panel/-bg-hover/-bg-selected/-border/-text/-text-muted/-text-dim/-accent` + 显式 5px/6px 圆角。别名只允许在尚未改造的组件里临时存在。

---

## 5. 组件层差异矩阵

> 等级：**P0** = 结构/信息架构不同或整块缺失（一眼不像）｜**P1** = 布局或交互不同｜**P2** = 视觉细节（间距/字号/圆角/颜色/hover）

### 5.1 应用外壳 / 布局 / 响应式

| # | 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|---|
| S1 | 移动端布局 | `useIsMobile`(640) + `isNarrowMobile`(480)，移动工具条 = ☰ 侧栏开关 + `...` 溢出 + 居中「Session info」+ 右栏开关；侧栏默认关闭（`AppShell.tsx:1966-2059, 244-246`） | 无 `matchMedia`、无 `useIsMobile`；侧栏默认 `open=true`（`workspace-layout.tsx:43`） | ⛔ **排除域**（§3.1 #1）：不做，且侧栏默认 `open=true` 保持现状（桌面语义正确） |
| S2 | `.app-shell` 类缺失导致门禁是死代码 | — | `workspace-layout.tsx:248` 根 div 无 className → 媒体查询死代码 | **P0（改为"删死代码"，见 BUG-2）** |
| S3 | MobileGate | pi-web 无此件 | 自造（`workspace-page.tsx:13` 已挂载），因 S2 而失效 | ⛔ **排除域 → 直接删除**（`mobile-gate.tsx` 整文件 + import + CSS） |
| S4 | 中栏工具条右侧缺 **Session 统计按钮** | tokens/cost/context 内联显示 + popover（`AppShell.tsx:1599-1760` + `2094-2298`） | 无（藏在"统计"页签里） | **P0** |
| S5 | 中栏工具条缺 **文件面板开合按钮** | `AppShell.tsx:1762-1795` | 无 | **P0** |
| S6 | 右栏 full-width 展开 | `rightPanelExpanded` 真实状态 + `.right-panel-full-width`（`AppShell.tsx:182-186, 408-411`） | `rightPanelFullWidth = false` 硬编码 | **P0** |
| S7 | 右栏展开/隐藏按钮 | `AppShell.tsx:2435-2469` + `.file-panel-expand-button` | 无 → 桌面无法关右栏（见 BUG-3） | **P0** |
| S8 | 工具条页签集合 | 完整历史 / 生成标题 / 分支 / 系统 / 工具（`AppShell.tsx:1303-1594`） | 分支 / 系统 / 工具 / 统计（`chat-pane.tsx:375-402`）—— **缺前 2 个、多统计** | **P0** |
| S9 | 工具条触发形态 | 面板是 `position:fixed` + `zIndex:500` 贴顶下拉（`AppShell.tsx:2061-2070`） | `PanelShell` 文档流内插入，把消息区往下推 | **P0** |
| S10 | 空态也应有工具条 | `showChat` 在"已选目录的新会话"时为 true（`AppShell.tsx:1111`），页签为 disabled | `chat-pane.tsx:329-346` 直接 `return <EmptyState/>` | **P0** |
| S11 | safe-area | 工具条 `height: calc(36px + env(safe-area-inset-top))` + `paddingTop` | 固定 `h-9` | P2（可选：桌面下 `env()` 为 0，改不改视觉等价；改了 CSS 更逐字一致） |
| S12 | `useViewportHeight`（移动键盘） | `hooks/useViewportHeight.ts` | 缺失 | ⛔ **排除域**（移动端专用，不做） |
| S13 | 全局快捷键 | Esc 停止 + `Ctrl+Alt+N` 新建 | `⌘B/⌘J/⌘K/⌘,`（且 `onToggleStats` 实现为 `setSettingsOpen(false)`，空操作） | P2 |
| S14 | 全局品牌顶栏 | **pi-web 根本没有**（`<header>` 只在登录页和终端面板里） | 同样没有，品牌只在侧栏内 | ✅ 不是缺口 |

### 5.2 左侧栏

| # | 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|---|
| L1 | **多了"会话 / 文件"页签** | 无页签 | `sidebar-pane.tsx:152-171` | **P0** |
| L2 | **文件树位置** | 常驻 EXPLORER 区，与会话列表**同屏**，中间有 12px `sidebar-section-resize-handle`（`SessionSidebar.tsx:1769-1779, 1850-1867, 1870-2014`） | 藏在"文件"页签里，用 `content` **替换**会话列表（`sidebar.tsx:149-164`） | **P0** |
| L3 | 搜索入口 | 头部 32×32 搜索**图标按钮**，点击才插入输入框（`SessionSidebar.tsx:1171-1186, 1395-1413`） | 搜索框**常驻** | **P0** |
| L4 | 搜索结果 UI | 三段式结果（标题 / cwd+时间 / **正文片段 + `<mark>` 高亮**）+ `role="status"` 计数行（`SessionSearch.tsx:46-75`） | 复用会话列表行，无片段、无高亮、无计数 | **P0** |
| L5 | **缺独立 worktree/分支行** | `SessionSidebar.tsx:1430-1473`（height 29 / mono 分支名 / main 标注 / chevron）+ 只读引导态 `:1730-1765` | 完全没有；分支只在会话行与项目浮层里 | **P0** |
| L6 | 会话列表**缺 subagent 家族分组** | `listSessionFamilies()`（`lib/session-family.ts:46-69`）+ 子行缩进 `depth*12+14` + 机器人图标 + 折叠 chevron（`SessionSidebar.tsx:1815-1844, 2258, 2342-2347, 2395-2412`） | `session-list.tsx:62-85` 直接平铺 | ⛔ **排除域**（§3.1 #3 / §3.3）：会话平铺即终态，**保持现状** |
| L7 | 会话行 meta 第二段语义不同 | `[时间] [消息条数 "454 msgs"] [worktree 分支，accent + 图标]`（`SessionSidebar.tsx:2366-2391`） | `[时间] [454 条] [branch 纯灰字]`（`session-row.tsx:137-162`）—— 截图中显示为 "454 main" | **P0** |
| L8 | 项目下拉内容 | 筛选框(>8) + 选中对勾 + 活动徽标 + **「使用默认目录」+「自定义路径…」**（`SessionSidebar.tsx:1251-1392`） | 圆角 pill 列表 + 会话计数；无筛选、无对勾、无底部两项（`project-picker.tsx:93-133`） | **P1** |
| L9 | `DirectoryPicker` 未接线 | 从"自定义路径…"打开 520px 模态（`DirectoryPicker.tsx:103-227`） | 组件存在但**只被 export，无宿主调用**（`ui/src/index.ts:88-90`） | **P1** |
| L10 | EXPLORER 头部图标行 | 折叠按钮 + 终端 + 变更文件 + 搜索文件 + 上传 + 刷新（`SessionSidebar.tsx:1882-1995`，`ToolbarIconButton` 26×26） | 一行路径 + 一个文字"上传"按钮（`file-explorer-pane.tsx:73-95`） | **P0** |
| L11 | 缺"变更文件"区块（`+a -d`） | `FileExplorer.tsx:1062-1089` | 无 | **P1** |
| L12 | 缺文件搜索面板 | `FileExplorer.tsx:995-1060`（150ms 防抖 + 结果树） | 无 | **P1** |
| L13 | 会话行 hover 操作 | 两个 32×32 图标按钮（改名铅笔 / 垃圾桶）+ **行内删除确认** + Shift 跳过（`SessionSidebar.tsx:2415-2473, 2273-2313`） | 三个文字按钮「改名 / 复制 / 删除」，无确认，多一个 pi-web 没有的"复制 id"（`session-row.tsx:164-199`） | **P1** |
| L14 | 运行 / 未读指示器 | 都在 meta 行第一格：14×14 accent 旋转弧 / 14×14 `#0891b2` 脉冲点（`SessionSidebar.tsx:2019-2082`） | 运行指示是标题行内的 `Loader2`；**无未读概念** | **P1** |
| L15 | 新建按钮 | `+ New` 在标题行右侧，32px / 圆角 7 / `bg-hover` / 有 hover 与 disabled 态（`SessionSidebar.tsx:1130-1170`） | `+ 新会话` 独占一行、右对齐、无 hover、无 disabled（`sidebar.tsx:79-126`） | **P1** |
| L16 | 品牌字标 | `Pi Web`，mono / 15px / 700 / letterSpacing -0.01em，点击可切换显示版本（`SessionSidebar.tsx:342-383`） | `🚢 PiBoat`，emoji + sans / 13px / 600（`sidebar-pane.tsx:137-151`） | P2 |
| L17 | 头部上边距翻倍 | 一层 `padding:'12px 10px 10px'` | `sidebar-pane.tsx:133` 的 `12px 10px 0` + `sidebar.tsx:72-78` 的 `12px 10px 10px` 叠加 | P2 |
| L18 | 文件树行 | `paddingLeft: 8 + depth*14`、`height:24`、`gap:4`、`borderRadius:4`、文字 `var(--text)` | `paddingLeft: depth*12+6`、`py-[3px]`、`rounded-[6px]`、`text-fg-muted`（`file-tree.tsx:163-182`） | P2 |
| L19 | 文件图标 | Catppuccin SVG + mask 压成单色 `--text-dim`，14px，文件夹开合两态 | lucide 彩色图标，按扩展名分色，13px（`file-icon.tsx:18-71`） | P2 |
| L20 | git 徽标 | 14×14 / mono 11 / 600；untracked 绿 `#4ade80`；**仅未 hover 时显示** | 10px / 无字重 / untracked 灰 / 常显（`file-tree.tsx:38-45, 183-187`） | P2 |
| L21 | 行内"提及 / 下载" | hover 时右侧出现（`FileExplorer.tsx:366-432`） | 显示文件大小文字；无提及/下载 | P2 |
| L22 | 底栏文案 | zh-CN 是 **"技能"** | 硬编码 "Skills"（`workspace-layout.tsx:156-160`） | P2 → **归入 i18n**（§5.9）：不要在这里写死"技能"，改为 `t("common.skills")` |
| L23 | 底栏三按钮 | `padding:8` / `gap:4` / 每个 `flex:1; height:32; borderRadius:9; gap:6; fontSize:12` | **逐条一致** | ✅ |

### 5.3 中栏对话区

| # | 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|---|
| C1 | **空态/落地页整体换了一种东西** | 品牌行（32×32 app icon + `Pi Web` 22px/700 + `v0.9.3 ↗` 更新链接 + 右侧两行版本块）→ 直接就是**完整 Composer**（含附件/模型/思考/工具/压缩/声音工具行） | 品牌行（`🚢` emoji）→ **目录输入卡**（`/path/to/project（绝对路径）` + 「开始」）→ 提示"输入一个工作目录，开始一段新的航行"（`empty-state.tsx:42-146`） | **P0** |
| C2 | 空态垂直定位 | 上 `flex-1` 空 → 内容 → 下 `flex-1`（`ChatWindow.tsx:990, 1373`）→ 居中偏下 | 顶对齐（`empty-state.tsx:29-30`） | P1 |
| C3 | **附件能力全缺** | 32×32 附件按钮 + 56×56 缩略图 + 粘贴图片 + HTML 链接转 markdown + 客户端压缩 + 整屏拖拽覆盖层（3 圈涟漪）（`ChatInput.tsx:1592-1603, 1735-1765, 1391-1431, 316-366`；`ChatWindow.tsx:934-964`） | `composer.tsx` 内**零附件代码** | **P0** |
| C4 | **无 ModelSelector / ProviderIcon** | composer 左侧模型选择器 + 供应商图标（40+ 映射，`public/provider-icons.svg`） | 只有模型名纯文本（`composer-toolbar.tsx:63-74`）；`ProviderIcon` **不存在** | **P0** |
| C5 | 底部工具行结构 | 在**输入卡下方** `marginTop:8`；左=附件+模型，右=思考档位 / 工具预设 / Compact / **停止（红系）** / 声音（SVG） | 在**输入卡上方**（`aboveInput`）；用 3 个原生 `<select>`；多"自动命名/导出/统计/插队"；声音用 emoji；停止被塞进输入卡内且是黄色（`chat-pane.tsx:521-594`） | **P0** |
| C6 | 流式中输入卡内按钮 | Steer（黄）+ Follow-up（靛蓝）双按钮（`ChatInput.tsx:2180-2230`） | 单个黄色"停止"（`composer.tsx:203-227`） | P1 |
| C7 | 候选浮层（`/` 与 `@`） | 双形态：header（标题+计数+`Tab/Enter`）+ 分组 + `auto-fit minmax(220px,1fr)` 网格 + 条目 accent 描边+ring；`maxHeight:min(72.8vh,598px)` / `min(48vh,400px)`（`ChatInput.tsx:1856-2110`） | 单一菜单、只有 10px 大写标题、无分组/网格/激活描边/文件图标，`max-h-64`（`suggestion-menu.tsx:36-101`） | **P1** |
| C8 | 输入历史浮层 | ↑ 在空输入时开浮层（序号 + 时间图标头 + active 底）（`ChatInput.tsx:1769-1855`） | 直接替换 textarea 内容（`chat-pane.tsx:513-520`） | **P1** |
| C9 | **ChatMinimap** | 36px 右缘栏：`borderLeft` + `bg-panel` + 中轴线 + 8×8 圆角节点（active/hover 态）+ **hover 展开 320px 大纲预览面板**（序号 / toolBadge / 用户文本 clamp 4 / 助手 h1-h3 大纲 + "A" 跳转）+ 251 行 CSS module | **36 行的桩**：`absolute right-2 w-3.5`，每轮一根 3px 圆角横条，tone 决定颜色（`chat-minimap.tsx:13-36`） | **P0** |
| C10 | 用户气泡 | 有 `maxHeight:300` 内滚；渲染 `images`（240×240 缩略图 + 点击放大）；hover 出现「复制 / 从此编辑 / 新会话」；有时间戳（`MessageView.tsx:358-383, 486-593, 400-415`） | 无 maxHeight、**不渲染图片**、无 hover 操作行、无时间戳；且 `markdown-body` 嵌套两层（`assistant-turn.tsx:31-61`） | **P1** |
| C11 | 助手底部 | 用量 `12,345 in · … · $0.0012` + 复制按钮 + 时间戳 + 截断告警块（`MessageView.tsx:856-900, 810-850`） | 只有 `in/out/cache R`（无 cache W、无 $cost）+ 流式 `生成中…`（`assistant-turn.tsx:21-28, 84-98`） | **P1** |
| C12 | TurnWrittenFiles | 内联在助手消息末尾，一行 chip（mono 12px / `bg-subtle` / 描边 / 圆角 6 + 文件图标）（`TurnWrittenFiles.tsx:20-51`） | 移到了 **MessageList 与 composer 之间的独立区块**，纵向列表、无边框、无图标（`chat-pane.tsx:477-486`；`turn-written-files.tsx:16-37`） | **P1** |
| C13 | 工具行展开体 | 入参 `<pre>` 与结果 `<pre>` **分开**、结果独立配色 + `maxHeight:400` + 空结果 `(no output)` 斜体；支持 **split diff**（双列/行号/marker）与结果图片（`MessageView.tsx:1202-1448, 1454-1494`） | 入参与输出用 `\n` 拼在同一 `<pre>`；无 diff、无结果图片（`tool-row.tsx:122-124`） | **P1** |
| C14 | 图片预览 | `<dialog class="image-preview-dialog">` 灯箱（72% 黑背板 / 36×36 关闭 / 圆角 8 + 大阴影）（`ImagePreview.tsx:14-108`） | 同名组件是**右栏文件查看器风格的内联缩放**，不是 dialog；markdown `img` 未覆盖 → **消息内图片无法放大**（`files/image-preview.tsx:26-74`） | **P1** |
| C15 | markdown 能力 | katex 公式 + mermaid + `img`→灯箱 + 本地文件链接拦截 + `MAX_MARKDOWN_CHARS=100_000` 保护（`MarkdownBody.tsx:45-131`） | 表格/行内代码 ✅，但**公式、mermaid、图片灯箱、本地链接、超大消息保护全缺**（`markdown-view.tsx:11-47`） | **P1** |
| C16 | 运行态 phase 文案 | "正在运行 xxx 工具 / 等待模型…" + `animate-pulse`（`ChatWindow.tsx:1203-1226`） | 只有 `生成中…` shimmer，无工具级文案（`assistant-turn.tsx:115`） | **P1** |
| C17 | 页内通知位置 | 聊天区**右上角** `NoticeShelf`（圆点 + 圆角 14 + `notice-shelf-in/out` 动画）（`ChatWindow.tsx:966-981, 1382-1476`） | 全局**底部居中** fixed toast（`primitives/toast.tsx:34-52`） | **P1** |
| C18 | "加载更早" | 纯文字哨兵 `py-3 text-center text-xs text-text-muted`（`ChatWindow.tsx:1190-1194`） | 描边按钮（`message-list.tsx:161-175`） | P2 |
| C19 | 排队条 | 右侧"撤回"是描边按钮；行内是 steer/follow-up **胶囊徽标**（`ChatInput.tsx:1619-1685`） | 右侧裸文字"清空队列"；多出 pi-web 没有的分组头（`queue-bar.tsx:12-103`） | P2 |
| C20 | 思考行 | 折叠态用 `allowedElements={[]}` 剥掉 markdown 记号；展开行尾显示 `{duration}s`；正文色 `--text-muted`（`MessageView.tsx:979-1038`） | 直接取首行原文（会漏 `**`/`#`）；无 duration；正文色用 `--accent`（`thinking-row.tsx:38, 99`） | P2 |
| C21 | 代码块 | 有"复制 + 换行切换"两个按钮（`.markdown-code-action.is-active`）；pi-web 用 `react-syntax-highlighter`+`showLineNumbers` | 只有"复制"；`.is-active` 规则未被使用；shiki 无行号（`code-block.tsx:56-78`） | P2 |
| C22 | 发送按钮图标 | 右箭头 + 竖线起点（`line 2 7 11 7` + `polyline 7.5 3 12 7 7.5 11`） | lucide `ArrowUp`（方向不符，`composer.tsx:260`） | P2 |
| C23 | 占位符文案 | "消息…输入 / 使用命令，输入 @ 查找文件"；流式时切换 | "给 PiBoat 发消息…（Enter 发送，Shift+Enter 换行）"，流式不变（`composer.tsx:44`） | P2 |
| C24 | 缺失的 banner | 模型错误/作用域警告、重试、压缩结果、图片不支持模型警告、bash 模式 `!`/`!!` | 全无 | P2 |
| C25 | 消息结构骨架 | 滚动容器 + `padding:0 16px` + `maxWidth var(--chat-content-max-width)` + `margin:0 auto` + `marginBottom:16` 分隔 | **逐条一致** ✅ | ✅ |
| C26 | 过程组折叠 | `处理详情 · N 条消息 · M 次工具调用` + chevron 参数 | 逐条一致（仅多了耗时后缀，建议去掉以保持一字不差） | P2 |
| C27 | ThinkingIcon / ThemeIcon | — | SVG **逐字节一致** ✅ | ✅ |

### 5.4 右栏文件面板

| # | 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|---|
| F1 | 体量 | `FileViewer` 1800 + `FileExplorer` 1125 + 配套 ≈ 3725 行 | ≈ 1050 行 | **P0** |
| F2 | **Mermaid 完全缺失** | `MermaidBlock.tsx`（329 行）+ zoom dialog；文件预览与聊天都渲染 | 无组件；CSS 被显式排除（`pi-web.css:4` 注释列 `mermaid-*` 为剔除域） | **P0** |
| F3 | **markdown / HTML 预览模式** | `displayModes = ['source','preview','diff']`，md 走 ReactMarkdown、HTML 走 sandbox iframe（`FileViewer.tsx:1541-1547, 1708-1780`） | 只有「内容 / diff」；markdown 按纯文本展示（`file-viewer.tsx:77-105, 184-189`） | **P0** |
| F4 | FrontmatterCard | `parseFrontmatter` + 卡片（`FrontmatterCard.tsx:1-70`） | 缺失 | P1 |
| F5 | 源码语法高亮 | `react-syntax-highlighter`（Prism `vs`/`vscDarkPlus`）+ 超 1000 行降级（`FileViewer.tsx:8-10, 1375-1444, 1781-1793`） | `CodeViewer` 只有行号 + 等宽文本，**无高亮**（`code-viewer.tsx:31-63`） | P1 |
| F6 | live 文件监听 | `EventSource(...?type=watch)` + `.file-viewer-live-indicator` 绿点 + `live/static` 文案（`FileViewer.tsx:1294-1346, 1573-1583`） | 无 EventSource、无指示点 | P1 |
| F7 | 大文件 load-more | `.file-viewer-load-more`：已读/总大小 + 续拉 `nextOffset`（`FileViewer.tsx:1666-1694`） | 截断到 5000 行 + "请下载"（`code-viewer.tsx:17, 57-61`） | P1 |
| F8 | 上传交互 | 头部图标触发 + 进度条 + 同名冲突三选一 + 结果汇总 + 树内蓝点（`FileExplorer.tsx:719-810, 877-993`） | 可见"上传"文字按钮 + 一次 `uploadFiles('rename')` + toast（`file-explorer-pane.tsx:47-66`） | P1 |
| F9 | 图片查看器 | toolbar 显示 path + 尺寸 `W×H` + 大小 + live 圆点；内容区棋盘格背景（`FileViewer.tsx:516-590`） | 自带缩放工具栏，无 live、无原始尺寸、无棋盘格（`files/image-preview.tsx:30-72`） | P1 |
| F10 | 音视频查看器 | `AudioViewer` / `VideoViewer` / `DocumentViewer`（PDF 分页）（`FileViewer.tsx:603-1083`） | 只有裸 PDF `<iframe>`；音视频落进"二进制 → 下载"（`file-viewer.tsx:166-168, 190-205`） | P1 |
| F11 | `catppuccin` 图标 | SVG sprite + mask，**且 `pi-boat/apps/web/public/` 目录根本不存在** | lucide 彩色图标 | P2 |
| F12 | toolbar 内联值 | `gap:8` / `padding:'5px 12px'` / `background: var(--bg)` / `fontSize:11` / `color: var(--text-dim)` | `gap-3` / 只有 `px-3` / **`background: var(--bg-panel)`** / meta 只有文件大小（`file-viewer.tsx:62-76`） | P2 |
| F13 | 模式按钮文案 | `Source / Preview / Diff` | `内容 / diff` | P2 |
| F14 | TabBar 交互 | 中键关闭、方向键 ←/→/Home/End 轮转、terminal 标签图标（`TabBar.tsx:59-77, 99-103`） | 无中键、无方向键、无 terminal 图标（`file-tabs.tsx:53-59`） | P2 |
| F15 | `AnsiText` | `AnsiText.tsx:1-20` | **全仓不存在** | P2 |

### 5.5 设置中心

| # | 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|---|
| G1 | **导航轴** | **顶部横向 tab**（`.settings-section-tab`，`flex:0 0 96px; height:50px`，`::after` 2px accent 下划线），标题 "Settings" 在左 | **左侧纵向 nav**（`w-48` = 192px，顶部一行 mono 大写"设置"）（`settings-panel.tsx:60-115`）—— 已用运行时 DOM 取证确认 | **P0** |
| G2 | 节清单 | general / models / skills / **agents（Sub-agents）** / plugins | general / models / skills / plugins（**缺 agents**） | ✅ **不是缺口**（§3.1 #3）：pi-boat 的 4 节就是终态，**不要补 agents tab**。`settings-navigation.ts:7` 的 `SETTINGS_SECTIONS` 保持 4 项 |
| G3 | 尺寸 / 遮罩 / 阴影 | 1080px / 84vh / `rgba(0,0,0,0.38)` / `0 16px 48px rgba(0,0,0,0.22)` | 1040px / 760px / `0.35` / `0 8px 32px 0.18`（`settings-panel.tsx:47-58`） | **P0** |
| G4 | 内容区 padding | `settings-section-host` **无 padding**，由各节自备（`settings.css:1082-1096`） | 外层统一 `padding:20`（`settings-panel.tsx:131`）→ 各节相对 pi-web 多 20px | **P0** |
| G5 | 节图标 | `SettingsSectionIcon` 在 tab 内 | **未使用**（`settings-panel.tsx:100` 只有文字） | **P0** |
| G6 | 通用节内容 | 6 节：外观 / **对话**（思考块默认展开、内容宽 range、字号 range、选中文字浮窗）/ Shell(Windows) / ~~推送~~ / **语言** / ~~登出~~ | 4 节：外观 / 工具 / **项目信任** / **关于**（`general-section.tsx:36-108`）→ **缺"对话"节** 与 **"语言"节**；多 2 项 pi-web 没有的（工具 / 关于） | **P0**（两项都缺）：①"对话"节见 T5-3；②**"语言"节是 i18n 的必要宿主，见 §5.9 / T8-4**。Shell(Windows) 属 pi-web 的 PowerShell 设置（与 `/login`、推送同属排除域，不补） |
| G7 | 模型节 | `ConfigPanelShell + SplitView`（provider 树 + 详情 + Footer Save）（`ModelsConfig.tsx:2111-2266`） | 单列三块：checkbox 列表 + models.json textarea + 目录刷新（`models-section.tsx:62-219`） | **P0** |
| G8 | EnabledModelsSection / Banner | `EnabledModelsSection.tsx:330-447` + `EnabledModelsBanner` + helpers | **整体缺失** | **P0** |
| G9 | Skills 节 | `ConfigPanelShell + SplitView`（列表 + `skill-detail-*` 详情）（`SkillsConfig.tsx:739-940`） | 单列三块（`skills-section.tsx:82-250`） | **P0** |
| G10 | 扩展包节 | `ConfigPanelShell + SplitView`（extensions / packages 分组 + 详情）（`PluginsConfig.tsx:913-1092`） | 单列三块（`plugins-section.tsx:54-204`） | **P0** |
| G11 | Agents 节 | `AgentsConfig.tsx`（668 行）+ `.agents-*` 12 条 CSS | **整体缺失**（CSS 也缺） | ⛔ **排除域**（§3.1 #3）：维持缺失，**不要实现** |
| G12 | DirectoryPicker | portal 模态 520×620 / `rgba(0,0,0,0.35)` / 圆角 10（`DirectoryPicker.tsx:103-228`） | 内嵌行，**未挂载**（`directory-picker.tsx:49-153`） | **P0** |
| G13 | 控件 | `.config-switch`（**32×18** 胶囊、knob 12×12 `var(--bg)`）；`.config-button`（圆角 **5px**、h32/h28、font 12/11、含 `is-success` 动画）；输入框 12px + `bg-panel` | `Switch` = 36×20 / 圆角 6 / knob 16px **白色**；`Button` 圆角 7-8、无 secondary/danger、无 success 动画；`Input` 11px（`primitives/switch.tsx:18-32`、`button.tsx:10-33`、`input.tsx:8-11`） | **P1** |
| G14 | 设置行 | pi-web **没有 `.settings-row`**；用 `.settings-shell-option`（`max-width:420px; min-height:44px; border-radius:5px; background:var(--bg-panel)`） | 自造 `SettingsRow`（`border-line-1` 下边框式）（`settings-panel.tsx:233-251`），被 5 处使用 | **P1** |
| G15 | 节常驻挂载 | `mountedSections` + `hidden` 切换，不丢状态（`SettingsPanel.tsx:356-358, 386-400`） | 条件渲染，切节即卸载（安装输入框/scope 会被重置） | P2 |
| G16 | 移动端节选择器 | `@media(max-width:640px)` 显示 `<select class="settings-mobile-section-picker">` | 无（窄屏仍是 192px 侧 nav） | ⛔ **排除域**（§3.1 #1）：不做 |
| G17 | 关闭按钮 | `.config-close-button.settings-dialog-close`（`×` 字符，30px） | lucide `X` 15px / 32×32（`settings-panel.tsx:126-129`） | P1 |
| G18 | ESC 关闭 | document 级监听 | `onKeyDown` 只在 backdrop 上 → **焦点不在其中时 Esc 无效**（实测：点开设置后按 Esc 关不掉） | P1 |
| G19 | ProviderUsageSummary | key/value 表（`ProviderUsageSummary.tsx:90-139`） | 缺失 | ⛔ **排除域**（§3.2 已取证 pi-web 确实有；按 §3.1 #2 维持不做） |
| G20 | 主题选择器 | 5 调色板 + auto，`role=radiogroup` + `.settings-theme-options` + `ThemeIcon` | **结构一致、图标 SVG 逐字节一致** ✅（仅多传了 `origin` 给圆形揭示动画） | ✅ |

### 5.6 浮层面板

| # | 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|---|
| P1 | **挂载形态** | 工具条 inline 触发 + `position:fixed` 贴顶下拉（`AppShell.tsx:2061-2070`） | `PanelShell` 内联整宽面板，把消息区往下推（`panels-host.tsx:107-161`） | **P0** |
| P2 | **ToolDefinitionsPanel** | 两栏 `grid-template-columns: clamp(112px,26%,220px) minmax(0,1fr)`；左 `.tool-definitions-item`（`min-height:38px`，选中 `inset 2px 0 0 accent`）；右参数表（`formatSchemaType` / `required` 徽标 / guidelines）（`ToolDefinitionsPanel.tsx:115-375`） | 单列 `name + description + 激活勾选方块`（`tool-definitions-panel.tsx:24-83`） | **P0** |
| P3 | BranchNavigator | 树行 `height:24` + 16px 缩进导引线 + 连接横线 + **7×7 节点圆点**（active/on-path/其它三态）+ **`U`/`A` 角色徽章** + `+N` 链压缩 + `compressChain` 算法（`BranchNavigator.tsx:31-117, 128-255`） | `hairline-b` 行 + `▾/▸` 折叠 + lucide `GitBranch` 图标；无连接线/圆点/徽章/`+N`；算法在宿主（`branch-navigator.tsx:36-141`；`panels-host.tsx:40-105`） | **P0** |
| P4 | AgentSessionPanel | `role="listbox"`，`min-height:56px` grid 行 + 状态图标（running/failed/aborted/completed）+ >8 时搜索框（`AgentSessionPanel.tsx:153-240`） | **缺失** | ⛔ **排除域**（§3.3）：子代理面板不实现。**但注意**：它是「工具条第 5 个页签」的宿主之一，需确认 S8 补齐页签时不要把它算进去 |
| P5 | SystemPromptPanel | 无标题栏；`height:min(600px,75dvh); min-height:220px`；`.system-prompt-scroll/-text/-empty`（`SystemPromptPanel.tsx:9-58`） | `PanelShell` 包裹（多 header）+ `60dvh`（`system-prompt-panel.tsx:15-44`） | **P1** |
| P6 | 面板样式出处 | 写在组件内联 `<style>` | 未搬运 → 需落到 `styles/pi-web.css` | P2 |

### 5.7 扩展货架

| # | 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|---|
| X1 | 外层结构 | **单一** `.extension-status-shelf`，内含 `ExtensionWidgets`（在前）+ `.extension-status-line`（在后），带 `has-widgets` / `has-status`（`ExtensionStatusBar.tsx:24-55`） | 两者是**兄弟节点**且顺序相反；无 shelf 包装、无 has-* 类（`chat-pane.tsx:460-461`） | **P0** |
| X2 | 状态行内容 | `sanitizeExtensionStatusText` → 按 key 排序 → 空格 join → `<AnsiText>`；`role="status"` + `title`（`ExtensionStatusBar.tsx:17-22`） | `statuses.map(...)` 裸 `<span>`；**无 AnsiText、无排序、无 role**（`extension-status-bar.tsx:8-21`） | **P0** |
| X3 | widget 更新脉冲 | `.extension-widget-update-pulse` + `is-updating` + 快照 diff（`WIDGET_UPDATE_IDLE_MS=1100`）（`ExtensionWidgets.tsx:49-208`） | `WIDGET_UPDATE_IDLE_MS` 定义了但**从未引用**；无脉冲层、无 `is-updating`（`extension-widgets.tsx:12, 29-60`） | **P1** |
| X4 | widget 位置三角 | `.extension-widget-placement` + `<svg viewBox="0 0 8 6" data-direction>` | 无；改为一个 pi-web 没有的 "N 行" 文本 | **P1** |
| X5 | panels 顺序 | `.extension-widget-panels` 在 trigger **之前** | 在 trigger **之后** | P2 |
| X6 | CSS | — | `.extension-*` 规则**逐字一致** ✅（只是组件没用） | ✅ |

### 5.8 其它对话框

| 差异 | pi-web | pi-boat | 等级 |
|---|---|---|---|
| ProjectTrustDialog | 模态 440px / `rgba(0,0,0,0.4)` / 圆角 8 / `0 12px 36px 0.24` / 琥珀盾牌 + cwd code 块 + 取消/信任双按钮（`ProjectTrustDialog.tsx:20-145`） | **完全缺失**，降级为工具栏上直接点一下就信任的按钮（`chat-pane.tsx:357-366`） | **P0** |
| `::backdrop` | 只有 `.image-preview-dialog` 与 `.mermaid-zoom-dialog` 用原生 `<dialog>`；其余全是内联 rgba 遮罩 div | 同 | ✅ 口径一致 |

### 5.9 【新增工作流】i18n —— 本期唯一的决策变更项

> 这一节不是"差距"，而是**新建**。`docs/08` §6-1 原定「zh-CN 单语、不引 i18n 框架」，该决策已被推翻。

#### 5.9.1 现状：pi-boat 的 i18n 完成度 = 0

| 检查项 | 结果 |
|---|---|
| 是否有 i18n 目录 / 框架 | ❌ 无（全仓无 `i18n` / `locales` / `messages` 目录，无 i18next / react-intl 依赖） |
| 是否有 `useI18n` / `t()` | ❌ 无（`grep useI18n` 零命中） |
| 界面文案 | ❌ **~70 个文件内联硬编码中文**（`packages/ui/src` 约 60 个 + `apps/web/src` 约 12 个），典型：`sidebar.tsx:79-126` 的「+ 新会话」、`workspace-layout.tsx:156-160` 的「Skills」、`composer.tsx:44` 的占位符、`general-section.tsx:36-108` 的节标题 |
| `docs/08` §6-1 说的 `ui/src/locales/zh-cn.ts` | ❌ **从未创建**（决策未落地） |
| `pi-web` 侧 | ✅ 完整基建 + 3 语 × **701 key**，`en` 与 `zh-CN` 的 key 集合**已实测完全一致**（可直接当契约基线） |

#### 5.9.2 目标口径（按你的确认）

**三语：`en`（英）/ `zh-CN`（简中）/ `ja`（日）**

⚠️ **两处必须明确的偏差**（pi-web 没有 `ja`，日语是**全新语言包**，无法从 pi-web 拷贝）：

| # | 事项 | 说明 |
|---|---|---|
| D1 | pi-web 的第三语是 **`zh-TW`（繁中）**，不是 `ja` | 你确认的三语里不含繁中。→ **需拍板**：(a) 只要 en/zh-CN/ja，**放弃 zh-TW**（与 pi-web 的 locale 列表产生可见差异：语言选择器少一项）；(b) 做 4 语 `en/zh-CN/zh-TW/ja`（完全覆盖 pi-web + 加日语，推荐）；(c) 拿 `zh-TW` 语言包**占位改写成 `ja`** —— ❌ **不可取**，繁中直译成日文会得到大量非本地化文本 |
| D2 | `resolveBrowserLocale` 目前**不识别 `ja`** | `lib/i18n/registry.ts:27-41` 只匹配 `en* / zh*`，未命中回落 `en`。移植时必须加 `ja` / `ja-*` → `ja` 分支 |

#### 5.9.3 要移植的 pi-web 基建（体量很小，可直接照抄）

| pi-web 文件 | 行数 | 移植落位建议 | 说明 |
|---|---|---|---|
| `lib/i18n/types.ts` | 15 | `packages/ui/src/i18n/types.ts` | `Locale` / `TranslationParams` / `LocalePlugin` |
| `lib/i18n/registry.ts` | 41 | `packages/ui/src/i18n/registry.ts` | `getLocalePlugin` / `getSupportedLocales` / `resolveBrowserLocale`（**需加 `ja` 分支**） |
| `lib/i18n/format.ts` | 77 | `packages/ui/src/i18n/format.ts` | `interpolateMessage`（`{name}` 占位）/ `translateMessage`（**回落链：当前语 → en → 返回 key**，dev 下 `console.warn`）/ `formatRelativeTime` / `formatUpdatedTime` |
| `hooks/useI18n.tsx` | 85 | `packages/ui/src/i18n/i18n-provider.tsx` | Context：`{ locale, setLocale, t, supportedLocales }`；`localStorage` key **`pi-locale`**；写 `document.documentElement.lang`；**hydration 守卫**（未 hydrate 前强制 `en`，避免 SSR/首帧闪中文） |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 701×3 | `packages/ui/src/i18n/messages/{en,zh-CN,ja}.ts` | `zh-CN` 可**直接从 pi-web 拷贝**；`en` 同样可拷贝；`ja` 需新写 |
| `lib/i18n/format.test.mjs` + `registry.test.mjs` | 33 + 55 | Vitest | 断言用 `Intl` 的 locale 行为需带 `ja` 用例 |
| `app/settings.css:1226-1272` 的 `.settings-language-*` | 6 条 | 已在 `styles/settings.css`（**已搬运但零消费方**，§4.3） | i18n 落地后即成为必需消费 |

**架构决策建议**：`I18nProvider` / `useI18n` 放 **`packages/ui`**（不是 `packages/client`）。理由：`ui` 里约 60 个组件要直接调 `t()`，走 props 下传 612 个 key 不可行；这与 `theme.css` 放在 `ui`、以及 `docs/08` §6-3 已登记 4 处 ui「容器例外」的口径一致 —— **建议把 i18n 登记为第 5 处例外**。
接入方式：`apps/web` 顶层包 `<I18nProvider>`（`main.tsx` 或 `WorkspacePage` 外层，需覆盖设置浮层）。

#### 5.9.4 Key 集合口径（**已扣除排除域的 89 个 key**）

pi-web 共 701 key。按 §3 确认的口径，以下命名空间**不要搬**：

| 扣除项 | 数量 | 依据 |
|---|---|---|
| `agents.*` | 42 | §3.1 #3 子代理排除 |
| `agentSwitcher.*` | 14 | 同上（全部是子 Agent 切换器文案） |
| `subagent.open` | 1 | 同上 |
| `sidebar.expandSubagents` / `collapseSubagents` / `agentRunning` | 3 | 同上 |
| `terminal.*` | 11 | §3.1 #5 |
| `auth.*` | 10 | §5-4 登录排除 |
| `providerUsage.*` | 7 | §3.1 #2 |
| `appUpdate.*` | 1 | §5-8 |
| **合计** | **89** | |

➡️ **目标：约 612 key / 语**（含 `i18n.*` 171、`chat.*` 124、`models.*` 80、`sidebar.*` 58、`session.*` 34、`settings.*` 32、`files.*` 32 等）。
**加一条 Vitest 断言：三语 key 集合必须完全一致**（pi-web 的 en vs zh-CN 已实测一致，这是可直接复用的验收口径）。

#### 5.9.5 改造工作量热点（按 pi-web 的 `t()` 调用密度排序，pi-boat 需对应替换）

pi-web 侧 `t(` 出现次数：`ChatInput` 176、`ModelsConfig` 162、`SessionSidebar` 129、`ChatWindow` 120、`AppShell` 91、`MessageView` 90、`PluginsConfig` 74、`FileViewer` 71、`AgentsConfig` 68（**排除**）、`FileExplorer` 67、`SettingsPanel` 59、`SkillsConfig` 43、`ChatMinimap` 34、`EnabledModelsSection` 33、`MermaidBlock` 28。
→ pi-boat 的对应文件（`composer.tsx` / `composer-toolbar.tsx` / `sidebar*.tsx` / `chat-pane.tsx` / `message-list.tsx` / `file-viewer.tsx` / `file-tree.tsx` / `settings/settings-panel.tsx` / `chat-minimap.tsx` …）是替换重点。

> **执行顺序建议**：**先做 i18n 基建 + 抽出 key（T8 阶段），再做结构对齐（T1–T7）**。理由：结构改造会大量重写这几个热点文件，先落 i18n 会在两次改写里各写一遍文案；而 i18n 基建是纯新增、零冲突，可以立刻并行开工。

#### 5.9.6 语言选择器 UI（照抄 pi-web）

- 宿主：**设置 → 通用 → 「语言」节**（`SettingsPanel.tsx:313-336`），位于「外观」节之后。
- 结构：`<h3 class="settings-general-heading">{t("common.language")}</h3>` + `<div role="radiogroup" aria-label={t("common.language")} class="settings-language-options">`，逐语言一个 `<button role="radio" aria-checked>`，内含三格：`.settings-language-radio`（16px 圆环，选中时内嵌 `.settings-language-radio-dot`）+ `.settings-language-label`（`plugin.label`，如「简体中文」/「English」/「日本語」）+ `.settings-language-code`（`plugin.id`，如 `zh-CN` / `en` / `ja`）。选中态 `background: var(--bg-selected)`；hover/focus `var(--bg-hover)`；选中圆环描边 `var(--accent)`。
- `label` 取值需在 `messages/*.ts` 的 `LocalePlugin.label` 里给（pi-web 现有的三个 label 在 `en.ts` / `zh-CN.ts` / `zh-TW.ts` 各自定义）。

---

## 6. 整改任务清单

> 勾选项按序执行；每条都给了"改哪个文件的哪一段 + 照抄 pi-web 的哪里"。
> 通用原则：**照抄 pi-web 的 DOM 结构与内联 style，把 `sq` / `hairline-b` / `bg-surface-*` / `text-fg-*` 换成 pi-web 类名与显式圆角。**
> **划掉（~~删除线~~）+ 标 ⛔ 的条目 = 排除域，不得实现。**

### 阶段 0：修 bug（先做，验证链路可用）
- [ ] **T0-1** `packages/ui/src/chat/message-list.tsx:186-209` —— 补 `is-visible`，按 pi-web `ChatWindow.tsx:1325-1349` 改定位 wrapper。〔BUG-1〕
- [ ] **T0-2** 【口径已定：**删死代码**，不要补 class】删 `apps/web/src/layout/mobile-gate.tsx`（整文件）+ `apps/web/src/pages/workspace-page.tsx:2,13` 的 import 与 `<MobileGate />` + `apps/web/src/index.css:45-56` 整段。**不要**给根 div 加 `className="app-shell"`，也不要实现移动布局。〔BUG-2 / §3.1 #1〕
- [ ] **T0-3** `apps/web/src/panes/files-pane.tsx:37-45` 补右栏「展开 / 隐藏」按钮；`workspace-layout.tsx:47` 的 `rightPanelFullWidth` 改为真实状态。〔BUG-3〕
- [ ] **T0-4** `packages/ui/src/settings/settings-panel.tsx:52-54` —— ESC 改为 `useEffect` + `document` 监听。〔G18〕

### 阶段 1：外壳与布局（P0）
~~- [ ] **T1-1** 新增 `use-is-mobile.ts` …〔S1〕~~
~~- [ ] **T1-2** 在 `chat-pane.tsx` 实现移动工具条分支 …〔S1〕~~
> ⛔ **T1-1 / T1-2 已作废**：移动端布局确认不做（§3.1 #1）。**不要**引入 `useIsMobile` / `matchMedia`，**不要**做移动工具条。另注：`workspace-layout.tsx:43` 的侧栏默认 `open=true` 属**桌面正确语义**，保持不动。
- [ ] **T1-3** 中栏工具条页签补齐为 `完整历史 / 生成标题 / 分支 / 系统 / 工具`，并把 `统计` 改为 `ml-auto` 统计按钮（照抄 `AppShell.tsx:1303-1760` 的图标 SVG 与激活态 `borderTop:2px solid var(--accent)`）。〔S8〕
- [ ] **T1-4** 工具条在"已选目录但无会话"时也要渲染（页签 disabled，`opacity:0.45`）。〔S10〕
- [ ] **T1-5** 工具条加 `height: calc(36px + env(safe-area-inset-top))` + `paddingTop`。〔S11〕
- [ ] **T1-6** 面板改为工具条下方 `position:fixed` 贴顶下拉（照抄 `AppShell.tsx:2061-2070`），删掉 `PanelShell` 的内联整宽形态。〔P1〕
- [ ] **T1-7** 移植 `useViewportHeight` 并接入。〔S12〕
- [ ] **T1-8** 全局快捷键改为 Esc 停止 + `Ctrl+Alt+N` 新建；修掉 `onToggleStats` 的空操作。〔S13〕

### 阶段 2：左侧栏（P0）
- [ ] **T2-1** 删掉"会话 / 文件"页签（`sidebar-pane.tsx:31,47,152-171`），把 `FileExplorerPane` 改为会话列表**下方的常驻区块**，中间插 `.sidebar-section-resize-handle`（照抄 `SessionSidebar.tsx:1769-1779, 1850-1867, 1870-2014` + `globals.css:1703-1719`）。〔L1/L2〕
- [ ] **T2-2** 头部加 32×32 搜索图标按钮，搜索框改为条件渲染（照抄 `SessionSidebar.tsx:1171-1186, 1395-1413`）；打开搜索时隐藏分支行。〔L3〕
- [ ] **T2-3** 新增独立 worktree/分支行 + 只读引导态（照抄 `SessionSidebar.tsx:1430-1473, 1730-1765`）。〔L5〕
~~- [ ] **T2-4** 移植 `lib/session-family.ts` 的 `listSessionFamilies()` …〔L6〕~~
> ⛔ **T2-4 已作废**：子代理与会话家族聚簇确认不做（§3.1 #3 / §3.3）。**不要**移植 `session-family.ts`，**不要**做缩进 / 机器人图标 / 折叠 chevron。会话平铺是终态。
- [ ] **T2-5** 会话行 meta 改为 `[时间/运行态/未读态] + [消息条数] + [仅 worktree 的分支，accent + 9×9 图标]`（照抄 `SessionSidebar.tsx:2366-2391`）。〔L7〕
- [ ] **T2-6** EXPLORER 头部图标行（折叠 / 变更文件 / 搜索文件 / 上传 / 刷新，26×26 `ToolbarIconButton`；终端按钮按排除域跳过）（照抄 `SessionSidebar.tsx:1882-1995`）。〔L10〕
- [ ] **T2-7** 新建 `SessionSearchResults`：三段式结果 + `<mark class="rounded-sm bg-accent/20 text-text">` 高亮 + `role="status"` 计数行（照抄 `SessionSearch.tsx:46-75`）。〔L4〕
- [ ] **T2-8** 新建 `packages/ui/src/settings/settings-ui.tsx`，逐字移植 pi-web `SettingsUi.tsx` 全族 22 个导出（`ConfigPanelShell / ConfigSplitView / ConfigSidebar* / ConfigDetail* / ConfigField / ConfigFooter / ConfigButton / ConfigSwitch / ConfigListAction / ConfigStatusDot / ConfigSectionTitle / ConfigEmptyState`）并从 `index.ts` 导出。〔G13 前置〕

### 阶段 3：中栏对话（P0）
- [ ] **T3-1** 空态重写：品牌行（32×32 app icon + `Pi Web` 22px/700 + 更新链接 + 右侧两行版本块）+ **直接复用 Composer**（不再用目录输入卡）；容器改"上 flex-1 / 内容 / 下 flex-1"居中；品牌行 `paddingRight: isMobile?16:52`（照抄 `ChatWindow.tsx:990, 1351-1373`、`empty-state.tsx:29-146`）。〔C1/C2〕
- [ ] **T3-2** Composer 补附件能力：32×32 附件按钮 + 56×56 缩略图 + 移除按钮 + 粘贴图片 + HTML 链接转 markdown + 客户端压缩（照抄 `ChatInput.tsx:1592-1603, 1735-1765, 1391-1431, 316-366`）。〔C3〕
- [ ] **T3-3** 整屏拖拽上传覆盖层（3 圈涟漪 + 中心图标；keyframes 已在 `pi-web.css:1099-1117`）（照抄 `ChatWindow.tsx:934-964`）。〔C3〕
- [ ] **T3-4** 移植 `ProviderIcon`（含 43 个 provider 映射）+ 把 `pi-web/public/provider-icons.svg` 拷到 `apps/web/public/`；移植 `ModelSelector`。〔C4〕
- [ ] **T3-5** 工具行移到输入卡**下方**，`<select>` 换成图标+文字按钮 + 向上弹出的选择面板，补"停止（红系）/ 声音（SVG）"（照抄 `ChatInput.tsx:2269-2737`）。〔C5〕
- [ ] **T3-6** 流式中输入卡内改 Steer（黄）+ Follow-up（靛蓝）双按钮（照抄 `ChatInput.tsx:2180-2230`）。〔C6〕
- [ ] **T3-7** 候选浮层重写为 `/` 与 `@` 双形态（header + 分组 + 网格 + 激活描边/ring + 文件图标 + 目录前缀）（照抄 `ChatInput.tsx:1856-2110`）。〔C7〕
- [ ] **T3-8** 新增 `history-menu.tsx` 输入历史浮层（照抄 `ChatInput.tsx:1769-1855`）。〔C8〕
- [ ] **T3-9** ChatMinimap 重写：新建 `chat-minimap.module.css` **逐字复制** `pi-web/components/ChatMinimap.module.css`（251 行），组件按 pi-web 结构实现 36px 栏 + 中轴 + 8×8 节点 + hover 320px 大纲预览面板（照抄 `ChatMinimap.tsx:618-772`）。〔C9〕
- [ ] **T3-10** 新建 `chat/image-preview.tsx` 灯箱（`<dialog class="image-preview-dialog">`，照抄 `ImagePreview.tsx:14-108`）；`markdown-view.tsx` 注册 `img` → 灯箱；用户气泡渲染 `images` + maxHeight 300；工具行结果图片。〔C10/C14/C13〕
- [ ] **T3-11** 用户气泡补 hover 操作行（复制 / 从此编辑 / 新会话）+ 时间戳；去掉多余的 `markdown-body` 嵌套。〔C10〕
- [ ] **T3-12** 助手底部补复制按钮 / 时间戳 / 用量（含 cache W 与 $cost）/ 截断告警块；`TurnWrittenFiles` 改为内联 chip 行并移入 `AssistantTurn`。〔C11/C12〕
- [ ] **T3-13** 运行态 phase 文案行（照抄 `ChatWindow.tsx:1203-1226`）。〔C16〕
- [ ] **T3-14** 新建 `notice-shelf.tsx`（右上角页内通知，替换中栏的底部 toast）（照抄 `ChatWindow.tsx:966-981, 1382-1476`）。〔C17〕
- [ ] **T3-15** markdown 补 katex（remark-math + rehype-katex）、mermaid、本地文件链接拦截、`MAX_MARKDOWN_CHARS=100_000` 保护；`pi-web.css` 补回 `.katex` / `.mermaid-block*` / `.mermaid-zoom-*` 共 23 条规则（从 `globals.css:873-881, 1035-1283` 复制）。〔C15 / §4.2〕

### 阶段 4：右栏文件（P0/P1）
- [ ] **T4-1** 移植 `MermaidBlock`（含 zoom dialog）+ 在 `markdown-view.tsx` 与文件预览加 mermaid 分支。〔F2〕
- [ ] **T4-2** FileViewer 补 `preview` 模式（md → MarkdownView，html → sandbox iframe）+ `displayModes` 与模式标签 `源码/预览/差异`。〔F3/F13〕
- [ ] **T4-3** 移植 `FrontmatterCard` 并在 md 预览顶部渲染。〔F4〕
- [ ] **T4-4** `CodeViewer` 接语法高亮 + 行号 + 大文件降级阈值；`code-block.tsx` 补"换行切换"按钮（`.is-active`）。〔F5/C21〕
- [ ] **T4-5** 补 live watch（EventSource `?type=watch`）+ `.file-viewer-live-indicator`。〔F6〕
- [ ] **T4-6** 补 `.file-viewer-load-more` 续拉。〔F7〕
- [ ] **T4-7** 上传交互升级：头部图标触发 + 进度条 + 冲突三选一 + 结果汇总 + 树内蓝点。〔F8〕
- [ ] **T4-8** 图片查看器按 `ImageViewer` 重写（原始尺寸 + live + 棋盘格）。〔F9〕
- [ ] **T4-9** 补音频 / 视频查看器，PDF 增强分页与 live。〔F10〕
- [ ] **T4-10** 建 `apps/web/public/icons/catppuccin/{latte,mocha}/`（从 `pi-web/public/icons/` 拷贝），`file-icon.tsx` 改用 `.catppuccin-file-icon`（14px，单色 `--text-dim`）。〔F11/L19〕
- [ ] **T4-11** 文件树行缩进改 `8 + depth*14` / `height:24` / `gap:4` / `borderRadius:4` / 文字 `var(--text)`；git 徽标改 14×14、11px、600、untracked 绿、hover 隐藏；补行内"提及 / 下载"。（照抄 `FileExplorer.tsx:293-332, 121-151, 366-432`）。〔L18/L20/L21〕
- [ ] **T4-12** 补 FileExplorer 的"变更文件"区块（`+a -d`）与文件搜索面板。（照抄 `FileExplorer.tsx:1062-1089, 995-1060`）。〔L11/L12〕
- [ ] **T4-13** `file-viewer.tsx:62-76` toolbar 内联值对齐（`gap:8` / `padding:'5px 12px'` / `background: var(--bg)`）+ meta 补语言与行数。〔F12〕
- [ ] **T4-14** TabBar 补中键关闭 + 方向键轮转。〔F14〕
- [ ] **T4-15** 移植 `AnsiText`（供扩展状态与工具输出用）。〔F15〕

### 阶段 5：设置中心（P0）
- [ ] **T5-1** `settings-panel.tsx` 外壳切 pi-web 结构：`className="settings-dialog-backdrop"` + `settings-dialog-surface` + `.settings-dialog-header` 内标题 `Settings` 与 `.settings-section-tabs`（横向 tab，`aria-current`）；删掉左 nav；关闭键改 `.config-close-button.settings-dialog-close` 且文案 `×`；内容区去 `padding:20`，改 `.settings-dialog-main` + `.settings-section-host`（`hidden` 切换，节常驻挂载）；补移动端 `.settings-mobile-section-picker`。（照抄 `SettingsPanel.tsx:402-436`、`settings.css:940-1054, 1082-1096, 1348-1365`）。〔G1/G3/G4/G16/G17/G15〕
- [ ] **T5-2** tab 内插 `SettingsSectionIcon`；文案走 i18n（见 T8-4），**节数保持 4 个**：常规 / 模型 / 技能 / 插件 —— **不加"子代理"**；`settings-navigation.ts:7` 的 `SETTINGS_SECTIONS` **保持 4 项不动**。〔G5/G2〕
- [ ] **T5-3** 通用节补"对话"节：思考块默认展开开关 + 内容宽 range（带重置与数值）+ 字号 range + 选中文字浮窗开关；新建 `packages/client` 的 `view-models/chat-appearance.ts`（常量照 `hooks/useChatAppearance.ts`）。〔G6〕
- [ ] **T5-4** 把"项目信任"从通用节移出，改由 `ProjectTrustDialog` 承担（见 T5-9）。〔G6〕
- [ ] **T5-5** 模型节重建为 `ConfigPanelShell + ConfigSplitView`（provider 树 / 详情 / `ConfigFooter` Save）；补 `AddProviderPicker`（820px / `rgba(0,0,0,0.4)` / 圆角 10）；新增 `EnabledModelsSection` + `EnabledModelsBanner` + `enabled-models-helpers.ts`。（照抄 `ModelsConfig.tsx:2111-2266, 1748-1841`、`EnabledModelsSection.tsx`）。〔G7/G8〕
- [ ] **T5-6** Skills 节套 `ConfigPanelShell + SplitView`，启用 `skill-*` 类。〔G9〕
- [ ] **T5-7** 扩展包节套 `ConfigPanelShell + SplitView`，extensions / packages 分组 + 详情。〔G10〕
~~- [ ] **T5-8**（需先推翻 ADR-0014 关于 agents 的排除）新建 `settings/agents-section.tsx` …〔G11〕~~
> ⛔ **T5-8 已作废**：子代理确认不做（§3.1 #3）。**不要**新建 agents-section，**不要**补那 12 条 `.agents-*` CSS，**不要**加 `SettingsSectionIcon` 的 `is-agent` 分支。
- [ ] **T5-9** 新建 `settings/project-trust-dialog.tsx` 逐字移植 `ProjectTrustDialog.tsx`；`chat-pane.tsx:357-366` 的按钮改为打开该弹窗，颜色对齐（`#d97706`、桌面 `borderRight:1px solid var(--border)`、移动端整宽横幅）。〔§5.8〕
- [ ] **T5-10** 控件层对齐：`Switch` → `.config-switch`（32×18 / knob 12×12 `var(--bg)`）；`Button` → `.config-button` 系列（圆角 5px、h32/h28、font 12/11、补 secondary/danger/`is-success`）；`Input` 默认 12px + `bg-panel`；`<select>` 统一风格；**删掉自造 `SettingsRow` / `SettingsSectionTitle`**，改用 `.settings-shell-option` / `.settings-chat-range-header` / `ConfigField`。〔G13/G14〕
- [ ] **T5-11** `DirectoryPicker` 改 portal 模态（`.directory-picker-backdrop/-panel/-list/-footer`，520×620 / 圆角 10），并接线到侧栏项目下拉的「自定义路径…」。〔G12/L9〕

### 阶段 6：浮层面板与扩展货架（P0/P1）
- [ ] **T6-1** `ToolDefinitionsPanel` 重写为两栏（sidebar + 参数详情），新增 `formatSchemaType` / `getToolParameterFields` helpers；把内联 `<style>` 落到 `styles/pi-web.css`。（照抄 `ToolDefinitionsPanel.tsx:115-375`）。〔P2〕
- [ ] **T6-2** `BranchNavigator` 换 `TreeNodeView`：连接线 + 7×7 圆点三态 + `U`/`A` 角色徽章 + `+N`；算法换 `buildActivePath` / `compressChain` / `selectTopLevelBranches` / `getLabel`；删掉 `▾/▸` 与 fork/navigate 图标按钮。（照抄 `BranchNavigator.tsx:31-117, 128-255`）。〔P3〕
~~- [ ] **T6-3**（若恢复子代理域）新建 `AgentSessionPanel` …〔P4〕~~
> ⛔ **T6-3 已作废**：子代理域不恢复（§3.1 #3）。工具条页签集合按 T1-3 补齐时**不要**包含子代理面板。
- [ ] **T6-4** `SystemPromptPanel` 去掉 `PanelShell`，改 `.system-prompt-panel/-scroll/-text/-empty` + `height:min(600px,75dvh); min-height:220px`。〔P5〕
- [ ] **T6-5** `ExtensionStatusBar` 改为单一 shelf 组合（widgets 在前、status 在后，带 `has-widgets`/`has-status`）+ `sanitizeExtensionStatusText` 排序 join + `AnsiText` + `role="status"`；`chat-pane.tsx:460-461` 合并为一次调用。〔X1/X2〕
- [ ] **T6-6** `ExtensionWidgets` 接上更新脉冲（快照 diff + `is-updating` + `.extension-widget-update-pulse`）+ `.extension-widget-placement` 三角；`.extension-widget-panels` 移到 trigger 之前；删掉 "N 行" 文本（移入 `aria-label`）。〔X3/X4/X5〕

### 阶段 7：收尾（P2，可批量）
- [ ] **T7-1** 侧栏品牌字标改 mono / 15px / 700 / letterSpacing -0.01em，去掉 emoji；合并头部双倍上边距。〔L16/L17〕
- [ ] **T7-2** 新建按钮移回标题行右侧 + 补 hover 与 disabled 态 + 图标换 pi-web 内联 SVG。〔L15〕
- [ ] **T7-3** 项目触发按钮：未选态 accent 底/描边 + 路径改 RTL 左省略（照抄 `PathLabel` `SessionSidebar.tsx:230-248`）+ 右侧改"其它项目有活动"的 8×8 accent 点。〔L8〕
- [ ] **T7-4** 会话行 hover 操作改两个 32×32 图标按钮 + 行内删除确认 + Shift 跳过；删掉"复制 id"；运行/未读指示器移到 meta 行第一格（照抄 `SessionSidebar.tsx:2019-2082, 2415-2473, 2273-2313`）。〔L13/L14〕
- [ ] **T7-5** 会话列表补 `focusedIndex` 传递、去掉 `pr-1`、标题截断改 50/12。〔L7 邻项〕
- [ ] **T7-6** ~~底栏 "Skills" → "技能"~~ → **改为归入 i18n**：底栏三按钮文案改为 `t("common.models")` / `t("common.skills")` / `t("common.settings")`，不要在组件里写死「技能」。〔L22 / T8-5〕
- [ ] **T7-7** "加载更早"改纯文字哨兵；排队条改胶囊徽标 + 描边撤回按钮，去掉自造分组头；发送按钮图标改右箭头+竖线；占位符文案对齐并按流式切换。〔C18/C19/C22/C23〕
- [ ] **T7-8** 思考行：折叠预览剥 markdown 记号、展开显示 `{duration}s`、正文色改 `--text-muted`。〔C20〕
- [ ] **T7-9** 过程组去掉耗时后缀（保持与 pi-web 一字不差）。〔C26〕
- [ ] **T7-10** 补 pi-web 的各类 banner（模型错误/作用域、重试、压缩结果、图片不支持模型、bash 模式）—— bash 相关按排除域跳过。〔C24〕
- [ ] **T7-11** 把 `styles/pi-web.css` 补回 `.katex*`、`.mermaid-block*`、`.mermaid-zoom-*`、`.system-prompt-*`、`.tool-definition-*`、`.markdown-frontmatter*`、`.markdown-compaction-message`、`.compaction-file-*` 等 pi-web 写在组件内联 `<style>` 里的规则。〔§4.2/§4.3〕
- [ ] **T7-12** 清理 `sq` / `hairline-b` / `bg-surface-*` / `text-fg-*` / `elev-panel` 等自造类名（改造后的区域）。〔§4.4〕
- [ ] **T7-13** ~~补 `@media(pointer:coarse)` 与 `@supports(-webkit-touch-callout:none)` iOS standalone 块~~ → ⛔ **作废**：两者分别是触屏与 iOS standalone（PWA）场景，均属排除域（§3.1 #1）。

---

### 阶段 8：i18n（**新增，建议最先开工**）

> 依据 §5.9。**建议在 T1–T7 之前做**：基建是纯新增、零冲突；且结构改造会重写 `composer` / `sidebar` / `settings` 等文案热点文件，先落 i18n 可避免同一批文案写两遍。

- [ ] **T8-1** 建 `packages/ui/src/i18n/`：从 pi-web 照抄 `types.ts`(15) / `registry.ts`(41) / `format.ts`(77) / `hooks/useI18n.tsx`(85)。`resolveBrowserLocale` **补 `ja` / `ja-*` → `ja` 分支**（pi-web 原版没有）。`localStorage` key 统一为 `pi-locale`。〔§5.9.3 / D2〕
- [ ] **T8-2** 建 `messages/en.ts`（从 pi-web 拷贝，**删掉 §5.9.4 列出的 89 个 key**）、`messages/zh-CN.ts`（同上）、`messages/ja.ts`（**全新撰写**，pi-web 无此语）。每个语言包的 `LocalePlugin.label` 给显示名：`English` / `简体中文` / `日本語`。〔§5.9.2 / §5.9.4〕
- [ ] **T8-3** 【**需拍板 D1**】确认繁中 `zh-TW` 去留：只要三语（放弃 zh-TW）／做 4 语（加 zh-TW，完全覆盖 pi-web）／不要拿 zh-TW 改写成 ja。若做 4 语，`registry.ts:6` 的 `localePlugins` 顺序为 `[en, zhCN, zhTW, ja]`。〔§5.9.2 D1〕
- [ ] **T8-4** `<I18nProvider>` 接入 `apps/web` 顶层（需覆盖设置浮层）；在「设置 → 通用」新增 **「语言」节**，照抄 `SettingsPanel.tsx:313-336` 的 `role="radiogroup"` 结构 + `.settings-language-options/-option/-radio/-radio-dot/-label/-code` 六个类（CSS 已在 `styles/settings.css`，§4.3）。〔G6 / §5.9.6〕
- [ ] **T8-5** 全仓替换硬编码文案为 `t()`：优先 `packages/ui/src`（约 60 个文件）+ `apps/web/src`（约 12 个文件）。热点按 §5.9.5 的密度表排序。同时删掉各文件里内联的中文常量（如 `workspace-layout.tsx:156-160`）。〔§5.9.1 / §5.9.5〕
- [ ] **T8-6** 时间格式化改走 i18n：会话行的相对时间用 `formatRelativeTime(date, locale)`、`formatUpdatedTime` 同理（`Intl.RelativeTimeFormat` / `toLocaleTimeString`）。**注意与 T2-5 联动**：会话行 meta 的时间格文案因此变成 locale-aware（`ja` 会渲染成「9 時間前」）。〔§5.9.3〕
- [ ] **T8-7** 移植 `format.test.mjs`(33) + `registry.test.mjs`(55) 到 Vitest，**并新增两条断言**：①三语 key 集合完全一致；②`resolveBrowserLocale` 对 `ja` / `ja-JP` / `zh-CN` / `zh-TW` / `en-US` 的解析结果。〔§5.9.4〕
- [ ] **T8-8** 补 `docs/08` §5-14 与 §6-1 的决策记录（原「zh-CN 单语、不引框架」已作废），避免后续 AI 按旧决策反向实现。

---

## 7. 验收方法（改完怎么确认对上了）

1. **CSS 差集归零**：把 `pi-web/app/globals.css` 与 `styles/pi-web.css`、`pi-web/app/settings.css` 与 `styles/settings.css` 的选择器集合做差集，剩余条目**只应**是 `.web-login-*` / `.terminal-*` / `.agents-*` / 移动端 `@media` / token 与基础版式。脚本已在 `piweb-audit/sel.mjs`。
2. **死 CSS 清零**：对 `styles/*.css` 里每个类名做一次 `grep`，确认在 `packages/ui/src` + `apps/web/src` 里有消费方（重点：`config-*` / `enabled-models-*` / `skill-*` / `extension-widget-*` / `.chat-scroll-to-bottom.is-visible` / **`.settings-language-*`（T8-4 落地后必须有消费方）**）。
3. **双实例同视口截图对照**：**1440 / 1024 × {light, dark, mist, rose, pine}**（~~640 / 390~~ 已排除，不做移动端），逐页对照：
   - 默认工作区（有会话 / 无会话 / 已选目录无会话 / 未信任项目）
   - 侧栏：搜索打开、项目下拉、worktree 下拉、EXPLORER 展开与折叠、文件搜索面板、变更文件区
   - 中栏：空态、流式中、工具行展开（含 diff）、思考行、过程组、排队条、候选浮层、输入历史、Minimap hover
   - 右栏：源码 / 预览 / 差异三模式、图片、音视频、PDF、大文件续拉
   - 设置：4 个节（~~移动端 `<select>`~~ 已排除）
   - 面板：分支（含 `U`/`A`/`+N`）、系统、工具（两栏）
   - 扩展货架：有 widget + 有 status
   - 截图脚本参考 `piweb-audit/shoot.mjs` / `shoot2.mjs`
4. **反向核对**：不要只对"整页像不像"，要对**每条 CSS 规则是否被消费**，这是本次最大的坑来源。
5. **i18n 验收**（§5.9）：
   - 三语 key 集合一致性测试通过；`ja` / `zh-CN` / `en` 各跑一遍全站截图，**不得出现任何 fallback 到 key 字符串**（如界面出现 `common.skills` 字样即为失败）；
   - `grep` 全仓不应再有硬编码界面文案（允许保留 `console.warn` / 注释 / `aria-label` 之外的开发信息）；
   - 切换语言后 `document.documentElement.lang` 同步、刷新后保持（`localStorage["pi-locale"]`）；
   - 会话行相对时间随语言变化（`ja` = 「9 時間前」）。
6. **排除项回归检查（交付前必做一次）**：确认以下**都没有被实现** —— 移动端媒体查询 / `useIsMobile` / `MobileGate`、`settings/agents-section.tsx`、`session-family` 聚簇、`AgentSessionPanel`、Provider 用量查询、终端页签、`/login`。
   检查方式：`grep -r "agents-section\|session-family\|AgentSessionPanel\|provider-usage\|xterm\|MobileGate" packages apps` 应为零命中。

---

## 8. 差异等级定义

| 等级 | 含义 | 典型例子 |
|---|---|---|
| **P0** | 结构或信息架构不同 / 整块缺失 → 一眼看出不像 | 设置导航轴（顶 tab vs 左 nav）、侧栏页签 vs 常驻 EXPLORER、空态换了一种东西、ChatMinimap 退化成细条 |
| **P1** | 布局或交互不同 → 并排看能看出 | 附件能力缺失、候选浮层形态、分支树缺连接线与徽章、图片预览不是灯箱 |
| **P2** | 视觉细节 → 单看不易察觉，对照能发现 | 间距、字号、圆角、hover 色、图标方向、文案 |

---

## 9. 实施进度（本仓执行记录）

> 本文档 §0–§8 是**审查快照**（不可变，作为基线保留）；本节只记「按报告改了哪些、还差哪些」。
> 勾选口径 = 报告 §6 的 T 编号；`⛔` 为报告标注的排除域，**未做且不得做**。

### 已完成

| T 编号 | 内容 | 落点 |
|---|---|---|
| T0-1 | `chat-scroll-to-bottom` 补 `is-visible`（BUG-1，按钮此前恒不可见）+ 改用 pi-web 外层 wrapper 定位 + `showJump` 改为滚动时同步的 state | `packages/ui/src/chat/message-list.tsx` |
| T0-2 | 删门禁死代码：`mobile-gate.tsx` 整文件 + import 挂载 + `index.css` 的 `.mobile-gate` / `@media(width<880px)`；窄屏仍渲染桌面壳 | `apps/web/src/layout/`、`apps/web/src/index.css`、`apps/web/e2e/smoke.spec.ts` |
| T0-3 | 右栏可关：`FilesPane` 顶行补 `.file-panel-expand-button`（展开）+ 隐藏按钮（BUG-3）；`rightPanelFullWidth` 硬编码 → 真实 `rightPanelExpanded` state | `apps/web/src/panes/files-pane.tsx`、`apps/web/src/layout/workspace-layout.tsx` |
| T0-4 / T5-1 | 设置壳换 pi-web 结构：`settings-dialog-backdrop/-surface/-header/-title` + **顶部横向 tab**（`settings-section-tabs/-tab`）+ `settings-dialog-main/-section-host`（节常驻挂载，`hidden` 切换）+ `.config-close-button.settings-dialog-close`（`×`）+ `settings-mobile-section-picker`；ESC 改 `document` 级监听（G18） | `packages/ui/src/settings/settings-panel.tsx` |
| T2-8 | 逐字移植 `SettingsUi.tsx` 全族 22 个导出（`ConfigPanelShell` / `ConfigSplitView` / `ConfigSidebar*` / `ConfigDetail*` / `ConfigField` / `ConfigFooter` / `ConfigButton` / `ConfigSwitch` / `ConfigListAction` / `ConfigStatusDot` / `ConfigSectionTitle` / `ConfigEmptyState`） | `packages/ui/src/settings/settings-ui.tsx` |
| T5-3 | 通用节补「对话」节：思考块默认展开开关 + 内容宽 range（带重置与数值）+ 字号 range；新增 client 侧 `view-models/chat-appearance.ts` + web 侧 `use-chat-appearance.ts` | `packages/ui/src/settings/general-section.tsx`、`packages/client/src/view-models/chat-appearance.ts` |
| T5-4 / T5-9 | 「项目信任」移出通用节，改 `ProjectTrustDialog`（逐字移植）；工具条按钮改为打开该弹窗 | `packages/ui/src/settings/project-trust-dialog.tsx`、`apps/web/src/layout/workspace-layout.tsx` |
| T8-1 | i18n 基建：`types.ts` / `registry.ts`（补 `ja` 分支）/ `format.ts` / `i18n-provider.tsx`；`localStorage` key `pi-locale`；写 `document.documentElement.lang` | `packages/ui/src/i18n/` |
| T8-2 / T8-3 | 语言包 **en / zh-CN / ja 各 612 key**（en、zh-CN 自 pi-web 拷贝并扣除排除域 89 key；**ja 全新撰写**）。D1 拍板结论：按用户确认的**三语**做，放弃 `zh-TW`（见 ADR-0021） | `packages/ui/src/i18n/messages/` |
| T8-4 | `<I18nProvider>` 接入 `apps/web` 顶层；「设置 → 通用 → 语言」节（`role="radiogroup"` + `.settings-language-*` 六类） | `apps/web/src/pages/workspace-page.tsx`、`general-section.tsx` |
| T8-6 | 会话行/更新时间格式化函数 `formatRelativeTime` / `formatUpdatedTime`（含 `ja` 断言）已就位；**消费方替换（T2-5 联动）未做** | `packages/ui/src/i18n/format.ts` |
| T8-7 | `packages/ui/test/i18n.test.ts`：三语 key 集合一致 + 插值占位符一致 + `resolveBrowserLocale`（`ja`/`zh-CN`/`en`）+ 相对时间（`ja`） | `packages/ui/test/i18n.test.ts` |
| T8-8 | 决策记录：新增 ADR-0021（推翻 ADR-0019 决策 1）；`docs/08` §5-14 / §5.1 / §6-1、`docs/06` §1（第 5 处 ui 容器例外）/ §9.1（改为桌面单形态）同步 | `docs/adr/0021-i18n-three-locales.md` |
| T1-3（部分） | 工具条补「完整历史」（开导出内联页）+「生成标题」（`autoName` + 旋转/成功态）；页签重排为 `完整历史 / 生成标题 / 分支 / 系统 / 工具`；右侧补 S4 统计按钮（tokens ↑↓ / cost / context %，>70% 琥珀、>90% 红） | `apps/web/src/panes/chat-pane.tsx` |
| T7-6（部分） | 侧栏底栏三按钮文案改 `t("common.models"/"common.skills"/"common.settings")` | `apps/web/src/layout/workspace-layout.tsx` |
| T7-1 | 侧栏品牌字标改 mono / 15px / 700 / letterSpacing -0.01em、去掉 emoji（L16）；合并头部双倍上边距（L17，品牌行承担 12px，`Sidebar` 头部不再叠加） | `apps/web/src/panes/sidebar-pane.tsx`、`packages/ui/src/sidebar/sidebar.tsx` |
| T6-1 | `ToolDefinitionsPanel` 重写为两栏（左侧 `tool-definitions-item` 列表 + 右侧参数/准则详情）；新增 `formatSchemaType` / `getToolParameterFields`；内联 CSS 落到 `styles/pi-web.css` | `packages/ui/src/panels/tool-definitions-panel.tsx` |
| T7-11（部分） | `styles/pi-web.css` 补回 `.markdown-body .katex(-display)`、`.mermaid-block*`、`.mermaid-preview-button`、`.mermaid-zoom-*`（共 27 条规则，从 pi-web `globals.css` 逐字搬运） | `packages/ui/src/styles/pi-web.css` |

### 未做（按报告优先级排序）

| T 编号 | 内容 | 备注 |
|---|---|---|
| T1-4 | 空态也渲染工具条（页签 disabled、`opacity:0.45`） | 与 T3-1 空态重写一起做 |
| T1-5 / T1-6 | 工具条 `env(safe-area-inset-top)`；面板改工具条下方 `position:fixed` 贴顶下拉（删 `PanelShell` 内联整宽形态） | T1-6 是 P0（S9/P1） |
| T1-8 | 全局快捷键改 Esc 停止 + `Ctrl+Alt+N` 新建；修 `onToggleStats` 空操作 | |
| T2-1…T2-3、T2-5…T2-7 | 侧栏：删「会话/文件」页签 → EXPLORER 常驻 + `sidebar-section-resize-handle`；搜索改图标按钮条件渲染；独立 worktree 行；会话行 meta 三段式；EXPLORER 头部 26×26 图标行；`SessionSearchResults` 三段式 + `<mark>` 高亮 | 全部 P0/P1，**侧栏是最显眼的缺口** |
| T3-1…T3-15 | 中栏：空态重写（品牌行 + 复用 Composer）、附件能力、`ProviderIcon`/`ModelSelector`、工具行移到输入卡下方、Steer/Follow-up 双按钮、候选浮层双形态、输入历史浮层、**ChatMinimap 重写**（251 行 CSS module）、图片灯箱、用户气泡 hover 行、助手底部用量/复制、运行态 phase 文案、`NoticeShelf`、markdown 接 katex/mermaid（CSS 已备）/本地链接/超大消息保护 | T3-9 与 T3-1 视觉权重最高 |
| T4-1…T4-15 | 右栏：`MermaidBlock` + zoom dialog、preview 模式（md/HTML sandbox）、`FrontmatterCard`、语法高亮 + 行号、live watch、load-more、上传交互升级、图片/音视频查看器、`apps/web/public/icons/catppuccin/`、文件树行几何、变更文件区/文件搜索、toolbar 内联值、`AnsiText` | |
| T5-5…T5-8、T5-10、T5-11 | 设置：模型节 `ModelsConfig`（`EnabledModelsSection` + `AddProviderPicker`）、Skills / 扩展包节 `ConfigSplitView`、控件层（`Switch`→`.config-switch`、`Button`→`.config-button`、删自造 `SettingsRow`）、`DirectoryPicker` portal 模态 + 接侧栏「自定义路径…」 | |
| T6-2、T6-4…T6-6 | `BranchNavigator` 换 `TreeNodeView`（连接线/圆点三态/`U`/`A`/`+N`）、`SystemPromptPanel` 去 `PanelShell`、扩展货架单一 shelf + `AnsiText` + 更新脉冲 + 位置三角 | T6-2 需先确认 protocol 的 `SessionTreeNode` 是否带 `compressedEntryIds`/`branchPreview` |
| T7-2…T7-5、T7-7…T7-10、T7-12 | 收尾：新建按钮归位、项目触发按钮、会话行 hover 图标按钮 + 行内确认、`focusedIndex`、加载更早哨兵、排队条胶囊、发送图标、思考行、过程组耗时后缀、各类 banner、自造类名清理 | |
| **T8-5** | **全仓硬编码文案替换为 `t()`（~70 个文件）** | 当前只有语言选择器与侧栏底栏消费了 i18n；其余界面切换语言仍是中文——**这是 i18n 唯一的未闭环项** |

### 排除域回归（交付前须复核，当前结论：均未实现）

移动端媒体查询 / `useIsMobile` / `MobileGate`（已删）、`settings/agents-section.tsx`、`session-family` 聚簇、
`AgentSessionPanel`、Provider 用量查询、终端页签、`/login` —— 全仓 grep 应为零命中。

### 质量门

`pnpm turbo run build lint test typecheck --force` → **24/24 通过**（2026-09-26）。
