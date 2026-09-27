# 前端一致性清单（第四轮 · 参考实现 逐屏对拍）

- 日期：2026-09-26
- 基准 A（唯一视觉真相）：**参考实现** —— 即本仓历史文档所称「统一 Web 设计规范」
- 受审 B：本仓 Web 前端（`apps/web`，`localhost:9528`；agent server `localhost:9527`）
- 依据：ADR-0020（视觉基准 = 设计规范，组件层结构与样式逐条对齐）、ADR-0021（三语 i18n）、ADR-0022（品牌 PiBoat）
- 方法：先划排除域 → CSS 选择器差集 → 死 CSS / 运行时可达性 → **双实例同视口截图（1440×900 亮色，含设置全 Tab 与真实会话对话框）** → 三个区域并行读源码逐条核对
- 取证产物：`audit/sel.mjs`、`audit/dead.mjs`、`audit/shoot.mjs`、`audit/shoot-session.mjs`、`audit/shots/*.png`（19 张）

---

> **⚠️ 基线版本漂移（本轮新发现，影响所有结论的口径）**
> 本仓 `docs/09` 与 ADR-0019/0020 记的基准是**设计规范 npm 快照**，而 A（参考实现）此后仍有演进。
> 实测到的漂移：A 的设置节已是 **5 个**（常规/模型/技能/**子代理**/插件），B 保持 4 个 ——
> **这一条 B 是对的**（子代理为排除域，ADR-0014 §4 延后），**不属于缺口**。
> 但凡引用旧快照做出的"已对齐"结论，均应在最新基准上复核后再采信。

> **范围边界（先看这条）**：本仓有意不做 6 类能力，标 ⛔ 的行**不得实现**。
> 移动端布局 / 终端 PTY / 登录鉴权 / Provider 用量面板 / 子代理（含会话家族聚簇）/ PWA 与推送。
> 另加：`app-update` 更新检查、LAN/TLS、DOCX 预览（需后端前置）。依据：`docs/adr/0014`、`0019`、`0020`、`0021`。

---

## 0. 一句话结论

**样式层已经做完，一行 CSS 都不用再改；卡点 100% 在「组件不消费这些 CSS」。**
本轮把上一轮自报「已做」的项逐条实测复核，发现**两处 P0 与文档记载相反**（auto-name 运行时 100% 失败；有项目无会话时中栏退化），并确认**用户点名的三个重点全部是真实缺口**。

| 维度 | 状态 | 量化 |
|---|---|---|
| 颜色 / 字体 / 圆角 token | ✅ 已逐条对齐 | 5 套调色板与 A 一致；`@theme inline` 已暴露规范类名 |
| **CSS 规则层（选择器差集）** | ✅ **等价移植，零真缺口** | `settings.css` 190→178，**缺 12 条全是 `.agents-*` + iOS `@supports`（排除域）**；`globals.css` 288→271，缺 47 = 19 terminal + 17 web-login + 10 token/html + `*`（**全部排除域或已落在 `theme.css`/`index.css`**）。**A 有而 B 无的"真缺口"= 0** |
| 死 CSS（零消费方） | ❌ **主战场** | 3 个样式文件 **266 类中 101 个零消费（38.0%）**；`settings.css` **58 个（与上轮完全一致，一动没动）** |
| ↳ 升级口径：**运行时死类** | ❌ **更严重** | 另有 **36 条 `config-*` 规则**因唯一产生者是"从未渲染的 Config 原语"，运行时永不出现 → **合计 ≈137/266（51.5%）在本仓界面里不可能出现** |
| 组件 DOM 结构 | ❌ **主战场** | 设置：3/4 节结构完全不同（P0×3）；对话框：工具行 7 处不符（P0×4）；外壳：空态分支退化（P0） |
| i18n | 🟡 基建完成、未铺开 | 三语 616 key（文档记 612，需更正）；设置节标签仍**硬编码英文** |
| 硬 bug | ⚠️ 2 个 P0 + 2 个 P1 | 见 §1 |

---

## 1. 必须先修的硬 bug（与"像不像"无关，是功能坏了）

### BUG-1【P0·本轮新发现·用户点名】auto-name 运行时 100% 失败

**现象**：点「自动命名」，弹红色 toast，永久停留在错误态。

**实测证据（无需读代码，两条 curl 自证）**

```
$ curl -s ".../api/models?cwd=<repo>" | ...
defaultModel = {'provider': 'deepseek', 'modelId': 'deepseek-v4-flash'}
可用 ids     = ['deepseek-v4-pro', 'deepseek-flash', 'glm-4.6v', 'glm-5.3', ...]
默认模型是否在清单里 = False          ← 断点

$ curl -s -X POST ".../api/sessions/<id>/auto-name" -d '{"dryRun":true}'
{"error":"No model available to generate a session name"}      HTTP=400
```

**根因**：`packages/core/src/read/session-read-service.ts:444-450`

```ts
442  const provider = services.settingsManager.getDefaultProvider();
443  const modelId  = services.settingsManager.getDefaultModel();   // 'deepseek-v4-flash'（陈旧）
444  const model =
445    provider !== undefined && modelId !== undefined
446      ? services.modelRuntime.getModel(provider, modelId)        // → undefined
447      : (await services.modelRuntime.getAvailable())[0];         // ← 回退分支永远进不来
448  if (model === undefined) {
449    throw new UserInputError('No model available to generate a session name');
```

`~/.pi/agent/settings.json` 里 `defaultModel = "deepseek-v4-flash"` 是 A 时代（pi-ai 0.85.1）写下的；B 的 pi-ai **0.87.1 已把它改名为 `deepseek-flash`**，于是 `getModel()` 返回 `undefined`，而 `444-447` 的写法**只在 provider/modelId 缺失时才回退，不会在"查不到"时回退**。

**为什么"聊天正常、只有自动命名坏"**：SDK 建会话走 `findInitialModel`，第 3 步查默认模型失败后会继续落到第 4 步 `getAvailableSnapshot()`；恢复既有会话更是直接用会话自己记录的模型。B 只抄了第 3 步，**没抄回退**。

**A 为什么不会坏**：A 用**会话运行时自己的模型**，从不读 settings 默认值 —— `参考实现/lib/session-title.ts:89` `const model = source.state.model;`。

**修法**（补回退链，照抄 A 与 SDK 的语义）：

```ts
const configured =
  provider !== undefined && modelId !== undefined
    ? services.modelRuntime.getModel(provider, modelId)
    : undefined;
const model = configured ?? (await services.modelRuntime.getAvailable())[0];
if (model === undefined) throw new UserInputError('No model available to generate a session name');
```

> ⚠️ **不要**改 `~/.pi/agent/settings.json` 的 `defaultModel` 当修复 —— 该文件与 A 共享，A 的 0.85.1 目录里没有 `deepseek-flash`。真修复在 core。
> ⚠️ core 改动需重启 9527 才生效。

**配套次级缺陷（同批修，否则修完仍不完整）**

| # | 缺陷 | 证据 | 修法 |
|---|---|---|---|
| BUG-1b【P1】 | 三态**永不复位**：只 set 不回 idle | `apps/web/src/panes/chat-pane.tsx:462,465,468`（全仓仅此 3 处 `setAutoNameStatus`，无 `setTimeout`） | 照抄 A `AppShell.tsx:958`（成功 1800ms）/`:963`（失败 5000ms）/`:967-970`（切会话复位） |
| BUG-1c【P2】 | composer 工具行的按钮只有**两态**、且不接 `hasMessages` | `packages/ui/src/chat/composer-toolbar.tsx:121-129`（`autoNaming ? '命名中…' : '自动命名'`，`disabled={autoNaming \|\| busy}`）；`chat-pane.tsx:673` 只传 `autoNaming` | 传完整 `autoNameStatus`，与顶栏那份按钮（`chat-pane.tsx:807-910` 三态完整）统一 |
| BUG-1d【P2】 | 双重落盘 + 运行中会话写盘竞争 | core `:485` `manager.appendSessionInfo()` + client `use-agent-session.ts:352` `setAgentSessionName()`，且 `.catch(() => null)` 吞错 | A 只在路由落一次（`app/api/sessions/[id]/auto-name/route.ts:36`）。建议 core 不落盘，交给命令通道 |
| BUG-1e【P2】 | 测试永远绿，证明不了 core 能取到模型 | `packages/server/test/server.test.ts:167` 把 readService stub 掉；`:802-818` 只验 dryRun 透传与 404 | core 加一条「settings 默认模型不在目录中时仍能回退」的单测 |

### BUG-2【P0·本轮新发现】有项目但未选会话时，中栏退化成占位文案

**现象（截图直接可见）**：

| | 有项目、无会话选中 |
|---|---|
| **A** | 品牌行 + 右侧版本块 + **完整 Composer** + 顶部工具条（完整历史/生成标题/系统/工具） |
| **B** | 只有居中一行灰字**「从侧边栏选择一个会话」**；**无工具条、无品牌行、无 Composer** |

**根因**：`showChat` 的 cwd 回退缺失。

```
A  参考实现/components/AppShell.tsx:1104
   const effectiveNewSessionCwd = newSessionCwd ?? (selectedSession === null && activeCwd ? activeCwd : null);
   → 有激活项目即回退，showChat = true

B  apps/web/src/panes/chat-pane.tsx:302
   const showChat = sessionId !== null || preferredCwd !== null;
   → preferredCwd 无 activeCwd 回退

B  apps/web/src/layout/workspace-layout.tsx:46
   const [preferredCwd, setPreferredCwd] = useState<string | null>(null);   ← 初值 null，与 projectRoot 无联动
   :348  preferredCwd={preferredCwd}   projectSelected={projectRoot !== null}
```

**后果**：这是**打开首页的第一眼**。B 的落地观感与 A 完全不同，且把 `T1-2`（空态渲染工具条）与 `T3-1`（空态重写）的成果全部遮住了。

**修法**：`chat-pane.tsx:302` 改为
```ts
const showChat = sessionId !== null || preferredCwd !== null || projectRoot !== null;
```
（或给 `preferredCwd` 加 `?? projectRoot` 回退，与 A `AppShell.tsx:1104` 同构。）
需同步确认 `chat-pane.tsx:1243` `<WorkspacePlaceholder hasCwd={projectSelected} />` 的守卫 —— 修好后它只在**真正什么都未选**时才出现。

### BUG-3【P1·用户点名】设置节的 Tab 标签硬编码英文

**现象（截图直接可见）**：locale = `zh-CN`，A 的 5 个标签是「常规 / 模型 / 技能 / 子代理 / 插件」，B 的 4 个是 **`General / Models / Skills / Plugins`** —— 中文界面里出现英文。

**证据**：`apps/web/src/panes/settings-host.tsx:163-166`

```ts
const sections: SettingsSectionItem[] = [
  { id: 'general', label: 'General' },
  { id: 'models',  label: 'Models' },
  { id: 'skills',  label: 'Skills',  disabled: resourceCwd === null },
  { id: 'plugins', label: 'Plugins', disabled: resourceCwd === null },
];
```

而 A 是 `t("settings.general")` / `t("common.models")` / `t("common.skills")` / `t("common.plugins")`（`参考实现/components/SettingsPanel.tsx:360-364`）。**三语文案早已在库**（`packages/ui/src/i18n/messages/zh-CN.ts:10,11,13,15,16`），只是没接线。

**修法**：4 处 `label` 改 `t('...')`；`:391` 的 `title="Settings"` 改 `t('settings.title')`；`settings-panel.tsx:37` 默认值同改；`settings-panel.tsx:123-124` 的 `title/aria-label="Close"` 改 `t('i18n.close')`。

### BUG-4【P2】设置面板多出一个不可达的提示节点

`settings-panel.tsx:41,63,104-109,131-135` 渲染 `<p className="settings-general-error">`，但赋值路径依赖 `disabled` 按钮的 `onClick`（disabled 不触发）→ `hintFor` 恒为 `null`。且该 `<p>` 是 `display:flex` 容器的直接子节点，一旦渲染会挤成第三个 flex 列。A 的做法是只给 `title`（`参考实现/components/SettingsPanel.tsx:420,428,434-435`）。**建议删掉该分支**。

---

## 2. 页面 / 路由层对照

| 设计规范（A） | pi-boat（B） | 判定 |
|---|---|---|
| `/` → `<AppShell/>` | `/` → `router.tsx` 单路由 → `<WorkspacePage/>` → `<WorkspaceLayout/>` | ✅ 结构等价 |
| `/login` | — | ✅ 有意删除 |
| `/api/*` 53 个 route handler | `packages/server` Hono 55 端点 | ✅ 后端形态不同（ADR-0004），前端不关心 |

**页面层没有缺口。差异 100% 在组件层。**

---

## 3. 范围边界（已定案，标 ⛔ 不得实现）

| # | 项 | 结论 | 连带项 |
|---|---|---|---|
| 1 | 移动端布局 / `useIsMobile` / 移动工具条 / `MobileGate` | ⛔ **不做** | `useViewportHeight`、`@media(pointer:coarse)`、iOS standalone 块 |
| 2 | 终端 PTY / xterm / `TerminalPanel` | ⛔ **不做** | 侧栏 EXPLORER 终端按钮、TabBar terminal 图标、`!`/`!!` bash 提示条、`bash-output`。**但保留 `BashExecutionMessage` 历史渲染** |
| 3 | 登录 / 鉴权 / `/login` / `web-login-*` / provider 身份认证入口 | ⛔ **不做**（OAuth 登录流；API Key 管理**已恢复**，见 ADR-0025） | 设置「登出」项、「Shell(Windows)」PowerShell 节；~~模型节的 `activeOAuth`/`activeApiKey`/`AddProviderPicker`~~ → API Key 清单 + 选择器已落地（不走 `/api/auth/*`） |
| 4 | Provider 用量（余额）面板 | ✅ **已做**（原「⛔ 不做」被 ADR-0025 推翻） | `.providerUsage.*` 7 个 i18n key（已补回三语包）；白名单 provider + 官方 origin 校验 |
| 5 | 子代理：`AgentsConfig` / `session-family` / `AgentSessionPanel` | ⛔ **不做** | 设置节数**保持 4 个**、会话**平铺即终态**、工具条**不加子代理页签**、不补 12 条 `.agents-*` CSS、`SettingsSectionIcon` 不加 `is-agent` 分支 |
| 6 | PWA / web push / 设置「后台推送」节 | ⛔ **不做** | `PwaRegistration`；A 的 `.settings-general-description` / `.settings-shell-option` 两条"零消费" CSS 也只服务该节 → **不算缺口** |
| 7 | `app-update` 更新检查 | ⛔ **不做** | A 品牌行右侧的「更新链接」 |

**回归检查（交付前必跑，当前结论：均未实现 ✅）**

```bash
cd /Users/gatesma/project/WebstormProjects/pi-boat
grep -rIl "MobileGate|agents-section|session-family|AgentSessionPanel|provider-usage|node-pty" packages/*/src apps/web/src
# 应为零命中
```

---

## 4. 样式层对照（三层）

### 4.1 Token 层 ✅ 无需改动
`packages/ui/src/theme.css` 与 A 逐条一致（`--bg/-bg-panel/-bg-hover/-bg-selected/-border/-text/-text-muted/-text-dim/-accent/-accent-hover/-accent-contrast/-user-bg/-assistant-bg/-tool-bg/-bg-subtle/-chat-content-max-width/-chat-content-font-size` × 5 套调色板 light/dark/mist/rose/pine）；`apps/web/src/index.css` 的 `*` / `html,body` / `pre,code` 与 A 一致；字体同源。

### 4.2 CSS 规则层 ✅ 等价移植，**真缺口 = 0**

```
settings.css   A=190  B=178  仅 A 有 12：全部 .agents-*（11）+ iOS @supports（1）  → ⛔ 排除域
globals.css    A=288  B=271  仅 A 有 47：
                .terminal-* 19  .web-login-* 17   :root/html/*/[data-theme=*]/html.dark 10   * 1
                → 全部属排除域，或已落在 theme.css + index.css
```
**结论：`styles/` 与 A 的 CSS 是规则级等价移植，零漂移。本类审查的样式层结论是「不要动 CSS」。**

### 4.3 死 CSS（零消费方）—— 本文最重要的发现 ⚠️

`node audit/dead.mjs <repo>/packages/ui/src/styles <repo>/packages/ui/src <repo>/apps/web/src`
→ **266 类，101 个零消费（38.0%）**

| 文件 | 类数 | 零消费 | 与上轮对比 |
|---|---|---|---|
| `settings.css` | 126 | **58** | 上轮 58 → **一动没动** |
| `web-ui.css` | 128 | **38** | 上轮 52 → 有改善 |
| `utilities.css` | 12 | 5 | 持平 |

**（a）`settings.css` 的 58 条 —— 全部源于「三个节没套 Config 壳」**

| 死 CSS | 条数 | 本应消费它的组件 | 对应任务 |
|---|---|---|---|
| `.enabled-models-*`（banner/-text/-key/-facts/count/empty/error/filter/header/list/note/pin/row/-id/-name/-text/section/switch-error/title） | 19 | `EnabledModelsSection` + `EnabledModelsBanner`（**整块缺失**） | T2 |
| `.config-button-primary/-secondary/-danger/-default/-ghost/-small/-success-icon` | 7 | `ConfigButton` 的完整变体 | T2 |
| `.skill-detail-heading` / `-version-row` / `-source-link(-text)` / `-update-status` / `-update-indicator` / `-name-value` / `-version-value` / `-description` / `-detail-status-row` | 10 | Skills 详情面板 | T4 |
| `.models-sidebar-add-item/-badge/-indented-item` | 3 | provider 树 | T2 |
| `.config-scope-tag` / `.config-detail-path` / `.config-sidebar-message` / `.config-trust-notice` | 4 | `ConfigPanelShell` 槽位 | T2/T4/T5 |
| `.settings-shell-option` / `.settings-general-description` | 2 | ⛔ **A 侧只服务已排除的 Shell/推送节 → 不算缺口** | — |
| `.is-*` 状态修饰（checking/empty/error/fill/full-height/grow/muted/project/pushed-right/success/top-aligned/update） | 12 | 各 SplitView 组件，随套壳自然接线 | 随 T2-T5 |
| `.is-agent` | 1 | ⛔ 排除域，**不补** | — |
| **上轮清单漏项**：`.config-sidebar-group` | 1 | A 侧被 `SkillsConfig.tsx:840`、`PluginsConfig.tsx:939,965` 消费 | T4/T5 |

> 📌 **上轮清单需要更正的性质说明**：`.config-button-*` 中 **`-ghost`/`-small` 是活的**（由 `settings-ui.tsx:207` 的 `` `config-button-${variant}` `` 模板串运行时拼出，`general-section.tsx:83,123` 在用），只有 `-primary/-secondary/-danger/-default` 不会出现。写成"零引用"会误导。

**（b）`web-ui.css` 的 38 条 —— 对应组件整块缺失**

| 死 CSS | 条数 | 本应消费它的组件 | 对应任务 |
|---|---|---|---|
| `.mermaid-block` / `-loading` / `-error` / `.mermaid-preview-button` / `.mermaid-zoom-*`(11) | 14 | `MermaidBlock`（**文件不存在**） | T6 |
| `.image-preview-dialog` / `-image` / `-close` | 3 | 灯箱（本仓同名件是右栏风格，**不是 dialog**） | T7 |
| `.notice-shelf-item`（+2 个 `@keyframes`） | 1 | `NoticeShelf`（**不存在**，仍是底部 toast） | T7 |
| `.markdown-frontmatter*` | 6 | `FrontmatterCard`（**不存在**） | T6 |
| `.compaction-file-*` / `.markdown-compaction-message` / `.markdown-custom-message` | 6 | 压缩结果卡片（**不存在**） | T8 |
| `.file-viewer-load-more` | 1 | 大文件续拉（⛔ 阻塞：协议 `type=read` 无 offset） | 阻塞 |
| `.katex` / `.katex-display` | 2 | markdown 公式（无 `remark-math`） | T7 |
| `.contains-task-list` / `.task-list-item` | 2 | markdown 任务列表 | T7 |
| `.linenumber` | 1 | 源码行号 | T6 |
| `.chat-stats-center` / `.markdown-file-preview` | 2 | 统计区 / 文件预览 md 容器 | T6 |

**（c）`utilities.css` 5 条自造类零消费**：`.hairline-l/-r/-t`、`.elev-soft`、`.elev-soft-sm`（`.hairline-b` 仍在广泛使用 → 自造类名污染，见 4.4）

### 4.4 自造类名污染（不在 A 的词汇表内）

| 自造类 | 出现处（示例） | 整改口径 |
|---|---|---|
| `hairline-b` / `border-line-1` | `settings-panel.tsx`、`panel-shell.tsx`、`chat-pane.tsx` | 换内联 `borderBottom: '1px solid var(--border)'` |
| `text-fg` / `text-fg-muted` / `text-fg-faint` / `text-fg-dim` | `settings-panel.tsx`、`session-row.tsx` 等 | 统一 A 的 `text-text` / `text-text-muted` / `text-text-dim` |
| `bg-surface-side` / `bg-surface-raised` / `bg-line-2` / `bg-line-3` / `bg-warn-soft` / `bg-danger-soft` / `bg-success-soft` / `bg-accent-weak` | 多处 | 换 `--bg` / `--bg-panel` / `--bg-hover` / `--bg-selected` / `--border` |
| `sq`（`border-radius:6px`） | 多处 | 换显式 5px / 6px |
| `elev-panel` / `elev-soft` | `primitives/toast.tsx` 等 | 换内联 `boxShadow` |
| 自造复合组件 `SettingsRow` / `SettingsSectionTitle` / `SettingsNotice` | `settings-panel.tsx:248-299`，被 3 个 section 消费 | 删掉；对应物是 `ConfigField` / `ConfigSectionTitle`（**注意：不是 `.settings-shell-option`**，那条只服务已排除的推送节） |

---

## 5. 组件层差异矩阵

> 等级：**P0** = 结构或信息架构不同 / 整块缺失（一眼不像）｜**P1** = 布局或交互不同（并排看得出）｜**P2** = 视觉细节（间距/字号/圆角/颜色/hover）

### 5.1 设置中心 —— 用户点名区域，**三节结构完全不同**

**四 Tab 总览**

| Tab | A 结构 | B 结构 | 判定 | 等级 |
|---|---|---|---|---|
| **通用** | 单列 4 段：外观 / 对话(4 项) / 后台推送⛔ / 语言 | 单列 3 段：外观 / 对话(**3 项**) / 语言 | ⚠️ 壳一致，对话节缺 1 项 | **P1** |
| **模型** | `ConfigPanelShell(embedded)` + `EnabledModelsBanner` + `ConfigSplitView`（240px provider 树 → 详情 → `ConfigFooter` 保存） | **单列 3 块** `flex flex-col gap-8`（可见模型 checkbox 列表 / models.json textarea / 目录刷新） | ❌ **完全不同** | **P0** |
| **技能** | `ConfigPanelShell` + `config-trust-notice` + `ConfigSplitView`（分组列表 + `ConfigStatusDot` → `SkillDetail` → `ConfigFooter`） | **单列 3 块**（列表+checkbox / 安装搜索 / 更新） | ❌ **完全不同** | **P0** |
| **扩展包** | `ConfigPanelShell` + `ConfigSplitView`（extensions/packages 分组 → 详情 → `ConfigFooter`） | **单列 3 块**（列表+按钮 / 安装 / 更新检查） | ❌ **完全不同** | **P0** |

**截图取证（`audit/shots/`）**
- `A-set-1-模型.png`：左 240px 侧栏「◎ DeepSeek / Z Z.AI Coding CN」+ 底「+ Add Provider」；右侧空态「选择 Provider 或模型」；右下「保存」
- `B-set-1-Models.png`：一整列「可见模型」(裸 checkbox × 6 + `prune`/`resync` 文字按钮) → 「models.json」textarea → 无侧栏、无详情、无 Footer
- `A-set-2-技能.png`：左「项目」分组 + 2 项带状态点 + 底「+ 添加技能」；右侧 scope 标签 + 路径 + 开关 + Name/Description
- `B-set-2-Skills.png`：一整列「已安装 skills」(checkbox + 描述段落) → 「安装 skill」(输入框) → 「更新」
- `A-set-4-插件.png`：左「GLOBAL / npm:示例插件」+ 底「+ 添加插件」；右侧 检查/重新加载会话/**移除(红)** + 开关 + 6 行 key-value + 「已解析资源」；底部左 `1 ext · 0 skills · 0 prompts · 0 themes` + 右「检查更新 / 刷新」
- `B-set-3-Plugins.png`：一整列「扩展包 / 安装扩展包 / 更新检查」

**差异表**

| # | 差异 | 原版(A) | 现状(B) | 等级 | 整改动作 |
|---|---|---|---|---|---|
| **G1** | 模型节没套壳 | `ModelsConfig.tsx:2113-2260`（`ConfigPanelShell` → `ConfigSplitView` → `ConfigSidebar/List` → `ConfigDetail/Stack/EmptyState` → `ConfigFooter`；`models-sidebar-badge` 作用域徽章 `:2062`；`models-sidebar-indented-item` `:2187-2204`；`models-sidebar-add-item` `:2207-2212`） | `models-section.tsx:62-220`，根节点 `:64` `flex flex-col gap-8`，**零 `config-*` 类** | **P0** | 重写为 `ConfigPanelShell(embedded, subtitle='~/.pi/agent/models.json')` + `ConfigSplitView` + `ConfigFooter`；新建 `settings/models/{provider-tree,model-detail}.tsx`。⛔ A 的 `activeOAuth`(`:2124-2137`)/`activeApiKey`(`:2140-2153`)/`AddProviderPicker`(`:1706-1820`) 属**排除域**（ADR-0014 §2），不做；只做 `models.json` 自定义 provider 树 + 模型详情 |
| **G2** | `EnabledModelsBanner` 整块缺失；行形态缺失（B 用裸 checkbox 代替"行 + `ConfigSwitch` + pin"） | `EnabledModelsSection.tsx:185-232`（banner）+ `:330-447`（section，15 个 `enabled-models-*` 类 + `ConfigSwitch`）；接线 `ModelsConfig.tsx:1563,1698` | 无。**19 条 CSS 零消费**；`models-section.tsx:88-111` 是裸 `<input type="checkbox" className="size-3.5 accent-[var(--accent)]">` | **P0** | 新建 `settings/models/{enabled-models-banner,enabled-models-section}.tsx`，移植 15 个类名；i18n `models.enabled*` 24 个 key **已在库**；banner 挂 `ConfigPanelShell` 与 `ConfigSplitView` **之间**（A `ModelsConfig.tsx:2115`） |
| **G3** | 技能节没套壳 | `SkillsConfig.tsx:739-941`：`:741-745` `config-trust-notice`、`:840-846` `config-sidebar-group`+`GroupLabel`（5 组）、`:812-834` `ConfigSidebarItem`+`ConfigStatusDot`+`skill-update-indicator`、`:853-858` `ConfigListAction`、`:862-911` `SkillDetail`、`:915-939` `ConfigFooter` | `skills-section.tsx:82-250`，根节点 `:83` `flex flex-col gap-8` | **P0** | 重写为 `ConfigPanelShell` + trust notice + `ConfigSplitView` + `ConfigFooter`；新建 `skills/skill-sidebar.tsx`（分组 + `ConfigStatusDot`）与 `skills/skill-detail.tsx`（搬 10 条 `skill-*` 类）。trust 文案 `t('trust.skillsNotLoaded')` 已在 `zh-CN.ts:415` |
| **G4** | 扩展包节没套壳 | `PluginsConfig.tsx:913-1092`：`:940-959` 「扩展」分组 + `ConfigStatusDot`、`:965-993` packages 分组、`:1001-1010` `ConfigListAction`、`:1013-1049` `ConfigDetail`、`:1052-1091` `ConfigFooter`；详情 `:451-535` `ConfigDetailHeader(.is-top-aligned)`+`ConfigDetailActions`、`:558-567` `skill-version-row`+`skill-update-status` | `plugins-section.tsx:54-203`，根节点 `:55` `flex flex-col gap-8` | **P0** | 重写为 `ConfigPanelShell` + trust notice + `ConfigSplitView`（两分组 + 详情）+ `ConfigFooter`；新建 `plugins/{plugin-sidebar,plugin-detail}.tsx` |
| **G6** | 通用节对话块缺「选中文字时显示提问浮窗」 | `SettingsPanel.tsx:260-267`（`.settings-chat-option.settings-chat-switch-option` + `ConfigSwitch`，值来自 props `quoteSelectionEnabled/onQuoteSelectionChange` `:40-41`） | `general-section.tsx:68-158` 只有 3 项；`GeneralSectionProps`(`:28-36`) 无该字段；`settings-host.tsx:177-187` 未传 | **P1** | ①加 `quoteSelection: {enabled, onChange}`；②`:156` 后照抄 A 6 行 JSX（`.settings-chat-switch-option` 已在 `settings.css:1108`）；③`settings-host.tsx` 接持久化；④i18n `settings.quoteSelection` 已在 `zh-CN.ts:35` |
| **G7** | 同一份 UI 里**两套按钮** | `ConfigButton`：`.config-button` `border-radius:5px`；`-default` h32/font12；`-small` h28/font11；有 primary/secondary/danger/ghost + hover/focus/disabled + `is-success` | 三节用 `primitives/button.tsx:13-33`（`primary: rounded-[8px]`、`ghost/chip: rounded-[7px]`、`sm: h-7 text-[12px]`），无 secondary/danger/成功态；通用节用 `ConfigButton` | **P1** | **推荐**：三节改回 `ConfigButton`（与 A 完全一致、零 CSS 改动）。备选：给 `Button` 补齐变体并把圆角统一 5px |
| **G8** | 自造 `SettingsRow/SectionTitle/Notice` 仍在用 | A **无**这三个组件（全仓 0 命中） | `settings-panel.tsx:248-267`（`SettingsRow`，注释自标 `@deprecated`）、`:269-277`、`:279-299`；被 `models-section.tsx:3`、`skills-section.tsx:4`、`plugins-section.tsx:4` 消费 | **P1** | 套壳后全删；对应物 `ConfigField` / `ConfigSectionTitle` |
| **G9** | 三节内容贴边（无 20px 内边距） | `.config-detail{padding:20px}`（A `settings.css:455-464`），由壳提供 | 三节根节点裸 `flex flex-col gap-8`；父 `.settings-section-host`（B `settings.css:1002-1008`）无 padding | **P1** | 套壳即解决（`ConfigDetail` 自带 padding:20px）。**不要**给三节手工加 padding |
| **G10** | `ProjectTrustDialog` 盾牌色 | `stroke="#f59e0b"`（`ProjectTrustDialog.tsx:57`） | `stroke="#d97706"`（`project-trust-dialog.tsx:63`） | P2 | 改 1 个色值。其余完全一致 |
| **G11** | `settings-navigation` 无详情选中记忆 | `lib/settings-navigation.ts:14-18`（`selections`）、`:78-95`、`:97-118`、`:52-56` | `services/settings-navigation.ts:1-27` 只存 `section` | P2 | **依赖 G1/G3/G4**，套壳后再做；先做是无消费方的死代码 |
| **G12** | 输入框字号 | `.enabled-models-filter` font-size **12px**（A `settings.css:288-301`） | `primitives/input.tsx:11-14` `text-[11px]` | P2 | 改 `text-[12px]` + `h-[30px] px-[9px]` |
| **K4** | 无「无项目时自动回退到通用节」 | `SettingsPanel.tsx:379-384`：cwd 为空且当前节属项目域 → `setSection("general")`；`lib/settings-navigation.ts:64-75` 读取时也按 cwd 过滤 | B 无此 effect；`getLastSettingsSection()` 不接收 cwd（`settings-navigation.ts:15-22`） | **P1** | `settings-panel.tsx:46-48` 加：`activeSection` 对应节 `disabled` 时 `onSelectSection('general')` |
| **K5** | 项目域判定口径不同 | A 需真实 project cwd（`SettingsPanel.tsx:362-364,380,420,451-453`，靠 `projectTrustCwd`） | B `settings-host.tsx:68` `resourceCwd = projectRoot ?? home.data?.home ?? null` → **无项目时 skills/plugins 仍可点** | P2·**待拍板** | 若按 A：`settings-host.tsx:164-165` 改用 `projectRoot === null` |

**✅ B 已正确对齐，不要重做**
- `styles/settings.css` 与 A `app/settings.css` **规则级等价**（0 处声明差异）
- `settings-ui.tsx` 的 **21 个 Config 原语定义 100% 对齐**（名称/顺序/签名/className 拼装，只去掉 `"use client"`）—— **缺的不是代码，是调用方**。实测：19 个原语「定义了 + `index.ts` 导出了 + 全仓零渲染」
- 设置外壳：`.settings-dialog-backdrop/-surface/-header/-title/-main`、`.settings-section-tops`、`.settings-section-tab`（96px、`::after` 下划线、`aria-current`）、`SettingsSectionIcon`（4 图标路径逐一一致）、`.settings-mobile-section-picker`、`.settings-dialog-close`、`settings-section-host` + `hidden` 常驻挂载、ESC（document 级）、遮罩点击关闭
- 通用节：`.settings-general-*` 容器族、`.settings-theme-options/-option*`（含 `:has(input:checked)` / `:has(input:focus-visible)`）、6 个调色板主题（light/dark/mist/rose/pine/auto，顺序一致）、两条 range 滑块（min/max/step/default 常量一致：宽 820→2000 step10、字号 12→24 step1）、重置 svg 路径、`.settings-language-options/-option/-radio/-radio-dot/-label/-code` 六类
- **`DirectoryPicker` 整文件逐行等价 + 已接线** —— `createPortal`(`:119`)、`document.body`(`:104`)、`width:520`(`:144`)、`borderRadius:10`(`:153`)；调用方 `packages/ui/src/sidebar/sidebar.tsx:1174`（由 `handleCustomPathClick:1109-1113` 触发，菜单项 `t('sidebar.customPath'):1540`）。**上轮清单 G5/T5-7 记为"内嵌行 + 全仓无调用方"已过期，应更正**
- `ProjectTrustDialog`（除盾牌色）、`ThemeIcon`（6 条 SVG 路径逐字节一致）
- **节数 = 4**（未回流第 5 个 Sub-agents 节）✅ —— 即使 A 已是 5 节

### 5.2 对话框 / Composer —— 用户点名"完全不一样"，**主要战场**

**先纠正两条上轮过时结论**：
- C4「B 工具行在输入卡**上方**」❌ **已过时** —— B 已在下方（`composer.tsx:269` `marginTop:8` + `chat-pane.tsx:646`）
- C1「B 空态是**目录输入卡**」❌ **已过时** —— 空态已复用完整 Composer（`chat-pane.tsx:1230-1241`）。但目前被 BUG-2 遮住，只有"有会话/已选目录"时才看得到
- C3「A 的 composer 左侧有**供应商图标**（43 条映射）」❌ **不成立** —— `ProviderIcon` **只在设置页** `ModelsConfig.tsx:1815` 使用；composer 的 `ModelSelector` 用的是"芯片网格"SVG（`ModelSelector.tsx:200-207`）。→ **composer 不应引入 43 条映射**

**输入卡本体（那一圈 14px 圆角卡）A/B 是严格一致的**：`borderRadius:14`、`padding:"10px 10px 10px 14px"`、双层 `boxShadow`、`gap:8`、`background:var(--bg)`、内容宽度锚 `--chat-content-max-width,820px`、`textarea` 类名与 `minH24/maxH200/lineHeight1.6`、发送按钮几何 `padding7px 14px/radius8`、Enter 发送 + IME 守卫、`↑` 首行接管历史 —— **全部逐字相同**。

**差异 100% 集中在「输入卡下方那条工具行」**。A 的工具行是 **`左区 ── 弹性 spacer ── 右区`** 三段式（`ChatInput.tsx:2270-2735`）：

```
┌────────────────────────────────────────────────────────────────────┐
│ [🖼附件] [▦ 模型名 ▾]    (flex:1 spacer)   [💡 high][🔧 预设][⇲压缩][🔊] │ ← idle
│ [🖼附件] [▦ 模型名 ▾](禁用)(flex:1 spacer) [■ 停止 红#ef4444][🔊]      │ ← streaming
└────────────────────────────────────────────────────────────────────┘
```

**工具行逐元素对照**

| 位置槽 | A 渲染什么 | B 渲染什么 | 判定 |
|---|---|---|---|
| 左-1 | **附件按钮** 32×32 / radius 9 / 15×15 图片 SVG（`ChatInput.tsx:2280-2307`） | **无** | **缺失 P0** |
| 左-2 | **`ModelSelector`** 芯片 SVG + 友好名 + 上弹面板，`maxWidth:220`，按 provider 分组，>8 出筛选（`ChatInput.tsx:2309-2318` → `ModelSelector.tsx:163-215`） | **只读 `<span>`**：`deepseek-v4-pro`，mono + `var(--accent)` 蓝字，**不可点、无下拉**（`composer-toolbar.tsx:63-74`） | **形态错 P0** |
| 中 | `<div style={{flex:1}} />`（`:2322`） | 无 spacer，靠右区 `ml-auto`（`chat-pane.tsx:683`） | 形态错 P2 |
| 右-1 | **思考档位**：灯泡 SVG 11×11 + 档位文字 + 自定义面板（8 档 + 描述）（`:2397-2495`） | **原生 `<select>`** `high ⌄`（`composer-toolbar.tsx:75-90`） | **形态错 P1** |
| 右-2 | **工具预设**：扳手 SVG + 预设名 + 自定义面板（`:2496-2579`） | **原生 `<select>`** `工具预设 ⌄`（`composer-toolbar.tsx:91-104`） | **形态错 P1** |
| 右-3 | **压缩**：图标 SVG + 「压缩」（`:2581-2621`） | 「压缩」纯文字，**无图标**（`composer-toolbar.tsx:105-120`） | 形态错 P2 |
| 右-4 | —— | **`自动命名`**（`composer-toolbar.tsx:121-129`） | **多余 P0** |
| 右-5 | —— | **`导出`**（`:130-132`） | **多余 P0** |
| 右-6 | —— | **`统计`**（`:133-135`） | **多余 P0** |
| 右-7 | **停止**（**仅 streaming**）：红 `#ef4444` + 方块 SVG（`:2623-2648`） | **无**（B 的停止跑进输入卡内，黄色） | **缺失 P1** |
| 右-8 | **声音**：32×32 **SVG 喇叭两态**（`:2650-2693`） | **emoji** `🔔`/`🔕`（`chat-pane.tsx:697-705`） | 形态错 P1 |
| 最右 | —— | **`插队`** 常驻 toggle（`chat-pane.tsx:684-696`） | **多余 + 语义错 P0** |
| — | A streaming 时隐藏 思考/预设/压缩，只留 停止+声音（`!isStreaming` 守卫） | B 无条件全显 | P1 |

**其余差异表**

| # | 差异 | 原版(A) | 现状(B) | 等级 | 整改动作 |
|---|---|---|---|---|---|
| **D1** | 附件能力全缺 | 32×32 按钮 + 56×56 缩略图（`ChatInput.tsx:1735-1765`）+ 隐藏 file input（`:1592-1603`）+ 粘贴图片 + HTML→md + 客户端压缩 + **整屏拖拽覆盖层（3 圈涟漪）** | 全仓 `attachImage/AttachedImage/clipboard/paste/image/*` **零命中** | **P0** | 补按钮 + 缩略图 + 隐藏 input + 粘贴/拖拽 |
| **D3** | `ModelSelector` / `ProviderIcon` **不存在** | `ModelSelector.tsx:48-312`（331 行） | `find -iname "*model-select*"` **零命中** | **P0** | 新建 `chat/model-selector.tsx` 整体搬 A；⚠️ `ProviderIcon` 只在设置页用，**composer 不搬**（见 Q2） |
| **D4** | 流式双按钮 Steer/FollowUp 缺失，改用工具行常驻「插队」 | `ChatInput.tsx:2180-2230`：卡内 **Steer 黄**（`rgba(234,179,8,.12)`/`rgba(180,130,0,1)`）+ **Follow-up 靛蓝**（`rgba(129,140,248,.12)`/`rgba(99,102,241,1)`），`radius8 padding7px 12px` | `chat-pane.tsx:684-696` 一个 `插队` toggle；`packages/ui/src/chat/*.tsx` 内 **零** steer/followUp | **P0** | `composer.tsx:206` streaming 分支改 A 双按钮；删「插队」 |
| **D5** | B 的「停止」在卡内（黄），A 在工具行（红） | 工具行红 `#ef4444` + 方块 SVG | `composer.tsx:206-230`：`rgba(234,179,8,.12)` / `rgba(180,130,0,1)` | P1 | 删卡内停止；工具行末端加红停止（依赖 D4） |
| **D6** | 工具行多出 3 个文字按钮 | A 无 `自动命名/导出/统计` | `composer-toolbar.tsx:121-135` | **P0** | 删除（功能先落到顶栏再删，见 Q3） |
| **D7** | 思考档位/工具预设用原生 `<select>` | 自定义 button + 自定义面板（勾选 SVG + 档位描述） | `composer-toolbar.tsx:75-104` 原生 `<select>` | P1 | 新建 `chat/composer-menus.tsx`，搬 A 的 `thinkingDropdownRef`/`toolDropdownRef` 两段 |
| **D9** | 声音用 emoji | SVG 两态（`ChatInput.tsx:2650-2693`） | `chat-pane.tsx:697-705` `🔔`/`🔕` | P1 | 换 A 的 SVG path（`:2680-2690`） |
| **D10** | 占位符硬编码，三态丢失 | `ChatInput.tsx:2155-2160` 三态（`chat.steerPlaceholder`/`agentPlaceholder`/`messagePlaceholder`） | `composer.tsx:46` 硬编码 `'给 PiBoat 发消息…（Enter 发送，Shift+Enter 换行）'`；**i18n key 已在库未接**（`zh-CN.ts:295-297`） | P1 | 加三态推导 + `useI18n()` |
| **D11** | 输入历史浮层缺失 | `ChatInput.tsx:1769-1855`：30px 头 + 时钟 SVG + 序号 + `--bg-selected` active | `chat-pane.tsx:638-645` 只改 draft，**无浮层**；`chat.inputHistory` key 零引用（`zh-CN.ts:302`） | P1 | `composer.tsx` 加 `historyItems`/`historyActiveIndex` + 浮层（`bottom: calc(100%+8px)`） |
| **D12** | 发送图标不同 | `line 2 7 11 7` + `polyline 7.5 3 12 7 7.5 11`（右箭头带起点竖线） | lucide `<ArrowUp size={14}/>`（`composer.tsx:263`） | P2 | 换 A 内联 SVG |
| **D13** | 候选浮层双形态退化为单形态 | `/` 浮层 `ChatInput.tsx:1878-2005`（头部计数 + 分组 + `grid repeat(auto-fit,minmax(220px,1fr))` + active `border:var(--accent)`）；`@` 浮层 `:2037-2107`（计数 + `getFileIcon`） | `suggestion-menu.tsx:36-101` 单一平铺列表，无分组/网格/描边/图标 | P1 | 拆 `/` 与 `@` 两分支，或加 `variant="slash"\|"file"` |
| **D14** | 排队条形态与文案 | `ChatInput.tsx:1619-1685`：头 `chat.queued`（"已排队 · {count}"）+ **移回按钮带 SVG**；行 `QueuedMessageRow`(`:424-454`)：**胶囊标签** `radius:999` + accent 描边 45% + 小写 `steer`/`follow-up` | `queue-bar.tsx:12-66`：头硬编码 **"排队消息"** + **"清空队列" 纯文字无图标**；分组标签"插队 · N"/"追问 · N"；行 `· {item}` | P1 | 头改 `t('chat.queued',{count})`；按钮换 SVG + `chat.recall`；行改胶囊 |
| **D8** | 模型名显示口径 | 友好显示名（`DeepSeek V4 Flash`） | 原始 `modelId`（`deepseek-v4-pro`） | P1 | 随 D3 一并解决 |
| **D15** | 排队条外层**双重 16px** 内边距 | A `fieldset` padding `0 16px 8px` → 排队条 16px | `composer.tsx:136` 已有 `0 16px 8px`，`chat-pane.tsx:613` 又包 `padding:'0 16px'` → **32px** | P2 | 删 `chat-pane.tsx:613` 的包装 div |
| **D16** | 底部总下边距 | 8px | `pb-4`(16) + 8 = **24px**（`chat-pane.tsx:611` + `composer.tsx:136`） | P2 | 删 `pb-4` |
| **D17** | 外层缺 desktop **52px 右内边距**（避让 minimap） | `ChatInput.tsx:1586` `paddingRight: isMobile ? 16 : 52` | `composer.tsx:136` 只有 `0 16px 8px`。空态 `empty-state.tsx:23` 已有 52 ✅ | P2 | 外层加 `paddingRight:52px` |
| **D18** | 输入卡缺流式黄色描边 | `ChatInput.tsx:2119-2121` streaming → `border: rgba(234,179,8,0.4)` | `composer.tsx:167` 恒为 `color-mix(border 70%)` | P2 | 加 streaming 分支（依赖 D4） |
| **D19** | 右区 gap | `gap: 2`（`ChatInput.tsx:2379`） | `gap-1` = 4px（`chat-pane.tsx:683`） | P2 | 改 `style={{gap:2}}` |
| **D20** | 过程组多耗时后缀 | `ChatWindow.tsx:203-204`：`[处理详情, "{n} 条消息", "{n} 次工具调用"]` | `process-group.tsx:27-32` 多一个 `formatDuration(duration)` | P2 | 删 `process-group.tsx:26,31` |
| **D21** | 用量行语序反 + 缺 cache W/cost + 无流式徽标 | 静态 `MessageView.tsx:1849-1853`：`"{n} in" · "{n} out" · "{n} cache R" · "{n} cache W" · "$x"`；流式 `:781-798` `↓ {est}` + 彩色 `t/s`（≥50 `#53b3cb` / ≥30 `#9bc53d` / ≥15 `#f9c22e` / else `#e01a4f`） | `assistant-turn.tsx:21-28`：`"in {n}"·"out {n}"·"cache R {n}"`（语序反、缺 cacheW/cost）；流式徽标**完全没有** | P1 | 改 A 语序 + 补 cacheW/cost；`AssistantTurn` 加流式估算 + `t/s` |
| **D22** | 空态品牌名 参考实现品牌名（`ChatWindow.tsx:1356`） | `PiBoat`（`empty-state.tsx:62`） | P2 | **见 Q1**，属产品名口径 |

**✅ B 已正确对齐，不要重做**：工具行在输入卡下方（`marginTop:8`）／输入卡 14px 圆角 + `10px 10px 10px 14px` 内边距／双层 boxShadow／`color-mix(border 70%)` 描边／内容宽度锚 820px／`chat-input-textarea` 几何与移动端 16px 覆写／发送按钮几何／Enter+IME 守卫／`↑` 首行接管／空态品牌行结构（32×32 图标 + 22px/700 + 右侧两行 `web v…`/`pi v…` + `paddingRight:52`）／空态容器上 `flex-1` 内容 下 `flex-1`／`@`·`/` 键盘语义／候选浮层定位与上向落影／i18n key 已备齐（`zh-CN.ts:295-302,314,277-279`）

### 5.3 中栏消息区 / 面板 / 扩展货架

| # | 差异 | 原版(A) | 现状(B) | 等级 |
|---|---|---|---|---|
| C5 | **`ChatMinimap` 退化成细条** | 36px 右缘栏 + 中轴线 + 8×8 圆角节点 + hover 展开 **320px 大纲预览面板** + 251 行 CSS module | 36 行的桩 `absolute right-2 w-3.5`；全仓**无任何 `*.module.css`** | **P0** |
| C6 | 统计浮层内容未落地 | `session-info-popover` 三列 key-value（会话信息/项目信息/消息计数/token 表含 cacheWrite·cost·**cacheHitRate**）+ 复制 + 入场动画 | 自造 StatCard 网格 + 进度条 | — | 上轮已修（见 §7 复核） |
| C7 | **`BranchNavigator` 树行完全不同** | `TreeNodeView`：`height:24` + 16px 缩进导引线 + 连接横线 + **7×7 三态节点圆点** + `U`/`A` 角色徽章 + `+N` 链压缩 | `hairline-b` 行 + `▾/▸` + lucide 图标；无连接线/圆点/徽章/`+N` | **P0** |
| C2/C17 | markdown 能力 | katex 公式 + mermaid + `img`→灯箱 + 本地文件链接拦截 + `MAX_MARKDOWN_CHARS=100_000` 保护 | 只有 `remark-gfm`；**公式/mermaid/灯箱/本地链接/超大保护全缺**（`.katex*`/`.mermaid-*` 23 条 CSS 零消费） | P1 |
| C12/C15 | 用户气泡 / 工具行 | 用户气泡 `maxHeight:300` 内滚 + 渲染 `images`（240×240 + 点击放大）+ hover「复制/从此编辑/新会话」+ 时间戳；工具行入参/结果**分开** + `maxHeight:400` + 空结果 `(no output)` 斜体 + **split diff** + 结果图片 | 气泡无 maxHeight、**不渲染图片**、无 hover 行、无时间戳、`markdown-body` 嵌套两层；工具行入参输出拼在同一 `<pre>`，无 diff/结果图片 | P1 |
| C13 | 助手底部 | 用量含 **cache W** 与 **$cost** + 复制 + 时间戳 + 截断告警块 | 只有 `in/out/cache R`（见 D21） | P1 |
| C18 | 运行态 phase 文案 | 「正在运行 xxx 工具 / 等待模型…」+ `animate-pulse` | 只有「生成中…」 | P1 |
| C19 | 页内通知位置 | 聊天区**右上角** `NoticeShelf` | 全局**底部居中** fixed toast（`.notice-shelf-item` 零消费） | P1 |
| C23 | 代码块 | 复制 + **mermaid 预览切换**（`.markdown-code-action.is-active` 唯一消费方） + 行号 | 只有复制；`.is-active` 未被使用 | P2 |
| C26 | 各类 banner | 模型错误/作用域/图片不支持/重试/压缩结果 | 全无（降级为底部 toast） | P2 |
| P1/P3/P4 | 面板挂载形态 / 扩展货架 | `position:fixed` 贴顶下拉、`zIndex:500`；**单一** `.extension-status-shelf`（`has-widgets`/`has-status`），widgets 在前 | 上轮已修 T1-3/T6-2/T6-3/T6-4 —— 待复核 | 复核 |

### 5.4 左侧栏

| # | 差异 | 原版(A) | 现状(B) | 等级 |
|---|---|---|---|---|
| L15/T2-8 | **会话行右键上下文菜单** | `onContextMenu` + 菜单 | 全仓 `onContextMenu` **零命中** | P1 |
| L16/T2-12 | **侧栏上传交互被简化** | 头部图标触发 + 进度条 + 同名冲突三选一 + 结果汇总 + 树内蓝点 | 一次 `uploadFiles('rename')` + toast | P1 |
| L23 | 会话 `transient` 守卫 + `detailsPending` 的 `…` | | 上轮声称已修 T2-17 —— 待复核 | P2 |
| L24 | 列表 `pr-1` + `focusedIndex` 透传 | | 同上 | P2 |

> ⚠️ **文档自相矛盾**：`docs/09` §0.1 声称 **T2-1 已完成**（删「会话/文件」页签、文件树常驻），但 §6 的任务清单第 483 行仍标 `[ ]`。实测**代码是已完成**（截图可见文件树常驻、无页签）→ **§6 的勾选状态需更正**。

### 5.5 i18n 覆盖度 🟡 基建完成、未铺开

| 检查项 | 结果 |
|---|---|
| 语言包 | ✅ 三语，**实测 zh-CN = 616 key**（文档记 612，需更正）；三语 key 集合一致（有 Vitest 断言） |
| 与 A 的 key 差集 | ✅ 仅 A 有 88 条 = `agents.*`42 + `agentSwitcher.*`14 + `subagent.open`1 + `sidebar.expand/collapseSubagents`2 + `terminal.*`11 + `auth.*`10 + `providerUsage.*`7 + `appUpdate.*`1（**原全部排除域**；`providerUsage.*` 7 条已于 ADR-0025 补回，其余仍为排除域）；仅 B 有 3 条 `files.*`。**设置域差集 = 0** |
| 基建 | ✅ `types/registry/format/i18n-provider`；`localStorage` key = `pi-locale`；同步 `document.documentElement.lang`；已补 `ja`/`ja-*` 分支 |
| 设置域消费 | 🟡 `settings-panel.tsx` / `general-section.tsx` / `project-trust-dialog.tsx` / `tool-definitions-panel.tsx` 已走 `t()`；但**节标签与面板标题仍硬编码英文**（BUG-3） |
| 未 i18n 热点 | ❌ `models-section.tsx`(~11) / `skills-section.tsx`(~14) / `plugins-section.tsx`(~9) / `composer.tsx` / `empty-state.tsx` / `suggestion-menu.tsx` / `queue-bar.tsx` / `file-viewer.tsx` 等 |

---

## 6. 整改任务清单

> 勾选口径沿用既有 T 编号；`N*/O*/M*` 为新增。**~~删除线~~ + ⛔ = 排除域，不得实现。**
> 每条按「改哪个文件哪一段 + 照抄 A 的哪里」书写。

### 阶段 0：修硬 bug（**先做，与"像不像"无关**）
- [x] **T0-1（新·R4-1）** `packages/core/src/read/session-read-service.ts:444-447` 补模型回退链（`configured ?? (await getAvailable())[0]`）。照抄 A `lib/session-title.ts:89` 的口径 + SDK `findInitialModel` 第 3→4 步。**加 core 单测：settings 默认模型不在目录中时仍能回退**。〔BUG-1〕
- [x] **T0-2（新·R4-2）** `apps/web/src/panes/chat-pane.tsx:302` `showChat` 补 `|| projectRoot !== null`（或给 `preferredCwd` 加 `?? projectRoot`）。照抄 A `AppShell.tsx:1104`。〔BUG-2〕
- [x] **T0-3（新·R4-3）** `apps/web/src/panes/settings-host.tsx:163-166` 4 个 `label` 改 `t('settings.general')/t('common.models')/t('common.skills')/t('common.plugins')`；`:391` 与 `settings-panel.tsx:37` 的 `title` 改 `t('settings.title')`；`settings-panel.tsx:123-124` 改 `t('i18n.close')`。〔BUG-3〕
- [x] **T0-4（新·R4-4）** auto-name 三态复位：`chat-pane.tsx` 加 1800ms/5000ms 定时器 + 切会话复位，照抄 A `AppShell.tsx:958,963,967-970`；`composer-toolbar.tsx:121-129` 改三态并接 `hasMessages`。〔BUG-1b/1c〕
- [x] **T0-5（新·R4-5）** 删 `settings-panel.tsx:41,63,104-109,131-135` 的不可达 `settings-general-error` 分支。照抄 A `SettingsPanel.tsx:420,428,434-435`。〔BUG-4〕
- [x] **T0-6** core/客户端双重落盘去一：core `:485` 不落盘，交给命令通道（A 只在路由落一次）。〔BUG-1d〕

### 阶段 1：设置中心（**用户点名，一次做完可让「一眼不像」归零大半**）
- [x] **T1-1** 决策控件层（见 §9-Q3）：三节改用 `ConfigButton`，**删** `packages/ui/src/primitives/switch.tsx`（36×20 死代码、未导出、零消费）；`primitives/input.tsx` 字号 11→12px。〔G7/G12〕
- [ ] **T1-2** 模型节重建为 `ConfigPanelShell + ConfigSplitView + ConfigFooter`；新建 `settings/models/provider-tree.tsx` + `model-detail.tsx`；⛔ 不搬 `activeOAuth`/`activeApiKey`/`AddProviderPicker`。〔G1〕
- [ ] **T1-3** 新建 `settings/models/enabled-models-banner.tsx` + `enabled-models-section.tsx`，移植 15 个 `enabled-models-*` 类 + `ConfigSwitch`；banner 挂 `ConfigPanelShell` 与 `ConfigSplitView` **之间**。〔G2〕
- [ ] **T1-4** Skills 节重建：`ConfigPanelShell` + `config-trust-notice` + `ConfigSplitView` + `ConfigFooter`；新建 `skills/skill-sidebar.tsx`（`config-sidebar-group` + `ConfigStatusDot`）与 `skills/skill-detail.tsx`（10 条 `skill-*` 类）。照抄 A `SkillsConfig.tsx:739-941`。〔G3〕
- [ ] **T1-5** 扩展包节重建：同上新壳；新建 `plugins/plugin-sidebar.tsx` + `plugin-detail.tsx`（`ConfigDetailHeader.is-top-aligned` + `ConfigDetailActions` + `config-button-danger`）。照抄 A `PluginsConfig.tsx:913-1092`。〔G4〕
- [ ] **T1-6** 通用节补「选中文字时显示提问浮窗」开关。照抄 A `SettingsPanel.tsx:260-267`。〔G6〕
- [ ] **T1-7** 删自造 `SettingsRow`/`SettingsSectionTitle`/`SettingsNotice`（`settings-panel.tsx:248-299`），改 `ConfigField`/`ConfigSectionTitle`；三节内容贴边随之解决（**不要手工加 padding**）。〔G8/G9〕
- [x] **T1-8** `settings-panel.tsx:46-48` 补「当前节 disabled → 回退 general」；`settings-host.tsx:164-165` 禁用口径改 `projectRoot === null`（见 Q4）。〔K4/K5〕
- [ ] **T1-9** 盾牌色 `#d97706` → `#f59e0b` ✅（本次已改）；`settings-navigation` 补 `selections`（**必须在 T1-2/4/5 之后**，未做）。〔G10/G11〕
- [ ] **T1-10** 三节文案改 `t()`（与本批**同批**做，避免写两遍——ADR-0021）。〔T7-2〕
- [x] **T1-11** 三节内的行内小标题改大写小字（`.config-section-title` 11px/600/uppercase/`--text-dim`）。〔M3〕
- [ ] ~~T1-12 Agents 设置节 / `.agents-*` CSS / `is-agent` 分支~~ ⛔ **排除域（节数保持 4 个；A 已是 5 节也不跟）**

### 阶段 2：对话框（**用户点名**）
- [x] **T2-1** 新建 `chat/model-selector.tsx`（整体搬 A `ModelSelector.tsx:48-312`），替换 `composer-toolbar.tsx:63-74` 的只读 span。⛔ **composer 不引入 `ProviderIcon`**（见 Q2）。〔D3/D8〕
- [x] **T2-2** 补附件能力：32×32 按钮 + 56×56 缩略图 + 隐藏 file input + 粘贴 + 拖拽覆盖层。照抄 A `ChatInput.tsx:1592-1603,1735-1765,2280-2307`。〔D1〕
  - ⚠️ **有意保留的偏差**：本仓 protocol 的 `prompt`/`steer`/`follow_up` 都是 `message: z.string().min(1)`
    （`packages/protocol/test/commands.test.ts` 有「rejects empty prompt messages」钉住），而设计规范允许
    「只附图不写字」。在放宽该契约（需单独决策 + 改协议单测）之前，发送/排队仍以**文本非空**为准，
    图片只能随文本一起发。
- [x] **T2-3** 流式改 Steer（黄）+ Follow-up（靛蓝）双按钮，删「插队」toggle。照抄 A `ChatInput.tsx:2180-2230`。〔D4〕
- [x] **T2-4** 删卡内黄色停止，工具行末端加红 `#ef4444` 停止 + 流式黄色卡描边。照抄 A `ChatInput.tsx:2623-2648,2119-2121`。〔D5/D18〕
- [x] **T2-5** 删工具行 `自动命名/导出/统计`（功能先落顶栏）。〔D6〕
- [x] **T2-6** 新建 `chat/composer-menus.tsx`，思考档位/工具预设改自定义按钮 + 上弹面板。〔D7〕
- [x] **T2-7** 声音改 SVG 两态。照抄 A `ChatInput.tsx:2650-2693`。〔D9〕
- [x] **T2-8** 占位符三态 + `useI18n()`（key 已在 `zh-CN.ts:295-297`）。〔D10〕
- [x] **T2-9** 新建输入历史浮层。照抄 A `ChatInput.tsx:1769-1855`。〔D11〕
- [x] **T2-10** 发送图标换 A 内联 SVG；右区 `gap:2`；工具行加 `flex:1` spacer。〔D12/D19〕
- [ ] **T2-11**（**部分完成**）候选浮层拆 `/` 与 `@` 双形态：已补头部计数 + `Tab / Enter` 提示 + `@` 行的文件/目录图标；仍缺 `/` 的**按来源分组 + `repeat(auto-fit,minmax(220px,1fr))` 网格**。照抄 A `ChatInput.tsx:1878-2005,2037-2107`。〔D13〕
- [x] **T2-12** 排队条：头改 `t('chat.queued',{count})` + 移回按钮带 SVG + 行改胶囊标签。照抄 A `ChatInput.tsx:1619-1685,424-454`。〔D14〕
- [x] **T2-13** 收间距：删 `chat-pane.tsx:611` 的 `pb-4`、`:613` 的包装 div；外层加 `paddingRight:52px`。〔D15/D16/D17〕

### 阶段 3：中栏消息区 / 面板
- [ ] **T3-1** `ChatMinimap` 全量重写（36px 栏 + 中轴 + 8×8 节点 + 320px 预览面板；搬 251 行 CSS module）。〔C5〕
- [ ] **T3-2** `BranchNavigator` 换 `TreeNodeView`（连接线 + 7×7 三态圆点 + `U`/`A` 徽章 + `+N`）。〔C7〕
- [ ] **T3-3** markdown 补 katex（`remark-math`+`rehype-katex`）/ mermaid / 本地链接拦截 / `MAX_MARKDOWN_CHARS`。〔C2/C17〕
- [ ] **T3-4** 新建 `chat/image-preview.tsx` 灯箱（`<dialog class="image-preview-dialog">`）；markdown `img` 注册；用户气泡渲染 `images`；工具行结果图片。〔C12/C15〕
- [ ] **T3-5** 用户气泡 `maxHeight:300` + hover 行 + 时间戳 + 去多余 `markdown-body` 嵌套；工具行入参/结果分开 + `maxHeight:400` + `(no output)` + split diff。〔C12/C15〕
- [ ] **T3-6** 助手底部补 cache W + `$cost` + 复制 + 时间戳 + 截断告警；`TurnWrittenFiles` 内联 chip。〔C13〕
- [ ] **T3-7** 运行态 phase 文案 + `animate-pulse`；新建 `notice-shelf.tsx`（右上角页内通知）替换底部 toast。〔C18/C19〕
- [ ] **T3-8** 过程组去耗时后缀；用量行改 A 语序；补流式 `↓ est` + 彩色 `t/s` 徽标。〔D20/D21〕
- [ ] **T3-9** 收尾：加载更早纯文字哨兵 / 排队条（已并入 T2-12）/ 代码块 mermaid 切换 / 思考行 / 各类 banner / `data-message-role` 锚点。〔C20-C33〕

### 阶段 4：右栏文件
- [ ] **T4-1** 落地 `MermaidBlock`（A `MermaidBlock.tsx` 329 行 + zoom dialog + SVG 下载），md 预览与聊天都接。〔F2〕
- [ ] **T4-2** `FileViewer` 补 `displayModes = ['source','preview','diff']` + md/HTML preview（iframe sandbox）+ md/html **默认进 preview**。〔F3〕
- [ ] **T4-3** 落地 `FrontmatterCard`（`remark-frontmatter`）。〔F4〕
- [ ] **T4-4** `CodeViewer` 接语法高亮（**见 Q3**）+ 1000 行降级 + 行号列固定 `width:48` + `data-line-number`。〔F5/F21〕
- [ ] **T4-5** 上传交互升级（头部图标 + 进度条 + 冲突三选一 + 汇总 + 树内蓝点）。后端已就绪。〔F8〕
- [ ] **T4-6** 图片查看器按 A `ImageViewer` 重写（path + `W×H` + 大小 + live + 棋盘格），删自造缩放栏。〔F9〕
- [ ] **T4-7** 补 `AudioViewer`/`VideoViewer`；PDF 增强 toolbar + 分页。〔F10〕
- [ ] **T4-8** 查看器「@ 提及」按钮 + 选中行提及（Cmd/Ctrl+I）+ 选区→行范围算法。〔F16〕
- [ ] **T4-9** 每页签查看器状态持久化（`viewerState` + `viewerRevision` + `<FileViewer key>`）。〔F17〕
- [ ] **T4-10** `DiffView` 改 3 行上下文折叠 + `... N unchanged lines ...` + **单列**行号，删自造 `+N/-N` 汇总条。〔F18〕
- [ ] **T4-11** toolbar 内联值（`gap:8`/`padding:'5px 12px'`/`var(--bg)`/fontSize 11）+ meta 三段（语言·行数·大小）；删自造「在新标签页打开」、删「二进制文件」分支、空态改单行居中。〔F11/F20/F22〕
- [ ] **T4-12** TabBar 补中键关闭 + `←/→/Home/End` 轮转。〔F13〕
- [ ] **T4-13** ~~live watch~~ ⛔ **阻塞：本仓协议无 `type=watch`**
- [ ] **T4-14** ~~load-more 续拉~~ ⛔ **阻塞：`type=read` 回裸字节、无 offset**
- [ ] **T4-15** ~~DOCX 预览~~ ⛔ **受后端限制**

### 阶段 5：左侧栏
- [ ] **T5-1** 会话行右键上下文菜单（`onContextMenu`）。〔L15〕
- [ ] **T5-2** 侧栏上传交互升级（同 T4-5）。〔L16〕
- [ ] **T5-3** 复核 `transient` 守卫 / `detailsPending` 的 `…` / `pr-1` / `focusedIndex` 透传（上轮自报已修）。〔L23/L24〕

### 阶段 6：i18n 铺开（**建议与结构改造同批**）
- [ ] **T6-1** 侧栏域 `t()`：`sidebar-pane.tsx`、`sidebar.tsx`、`session-row.tsx`、`session-search.tsx`、`file-tree.tsx`、`file-explorer-pane.tsx`
- [ ] **T6-2** 中栏域 `t()`：`composer.tsx`、`empty-state.tsx`、`suggestion-menu.tsx`、`queue-bar.tsx`、`thinking-row.tsx`、`tool-row.tsx`、`process-group.tsx`、`assistant-turn.tsx`
- [ ] **T6-3** 右栏域 `t()`：`file-viewer.tsx`、`file-tabs.tsx`、`code-viewer.tsx`、`diff-view.tsx`、`files-pane.tsx`
- [ ] **T6-4** 清自造类名 `sq` / `hairline-b` / `bg-surface-*` / `text-fg-*` / `elev-panel`（改造后的区域）。〔§4.4〕

### 阶段 7：文档更正
- [x] **T7-1** 更正 `docs/09`：①§4.3 死 CSS 表补 `.config-sidebar-group`、修正 6 条 `.config-button-*` 的性质说明；②`:413` G5 / `:547` T5-7 标「已落地，条目过期」；③`:416` G8 删「`directory-picker.tsx` 消费 `SettingsRow`」（实测未 import）；④`:483` T2-1 与 §0.1 自相矛盾的勾选状态；⑤ADR-0021「每语 612 key」→ 实测 616
- [x] **T7-2** 本仓 ADR-0019/0020/0021 与 ADR-0022 的「设计规范 npm 快照」口径，补一句「A（参考实现）已超出快照版本，引用旧快照的结论需复核」

---

## 7. 上轮自报进度的实测复核（抽样验证）

> `docs/09` §0.1/§0.2 的进度小节是**自报**，本轮对高权重项抽样实测。

| 声称 | 实测 | 判定 |
|---|---|---|
| T1-6「生成标题三态 + `hasMessages` 禁用」 | 顶栏那份按钮三态完整（`chat-pane.tsx:584-600,807-910`）✅；但**composer 工具行只两态**且不接 `hasMessages`；**三态永不复位**；core 侧**运行时 100% 失败** | ⚠️ **部分成立** |
| T1-2「空态也渲染工具条」 | 有项目无会话时**完全无工具条**（BUG-2 遮住） | ❌ **不成立** |
| T2-1「删会话/文件页签」 | 代码已完成（截图可见文件树常驻） | ✅ 成立，但 §6 勾选未同步 |
| T5-7 / G5「DirectoryPicker 内嵌行 + 全仓无调用方」 | **已落地且已接线**，与 A 逐行等价 | ❌ **条目过期** |
| T6-1~T6-4（面板/货架） | 代码在位，待视觉复核 | 🟡 待复核 |
| 「`pnpm turbo run lint typecheck test build` 全绿」 | 无法在有副作用的只读审查中复跑；但 `server.test.ts:167` 把 readService stub 掉 → **测试全绿不能证明 auto-name 可用** | ⚠️ 测试覆盖有洞 |

---

## 8. 验收方法

1. **CSS 差集归零**：`node audit/sel.mjs` 跑 `globals.css`→`web-ui.css`、`settings.css`→`settings.css`。剩余条目**只应**是 `.terminal-*` / `.web-login-*` / `.agents-*` / `:root` / `html` / `*` / `[data-theme=*]` / `html.dark`。**当前已满足。**
2. **死 CSS 清零**：`node audit/dead.mjs <repo>/packages/ui/src/styles <repo>/packages/ui/src <repo>/apps/web/src`。当前 101 零消费，目标 ≤ 排除域数量（`.agents-*` / `.is-agent` / `.settings-shell-option` / `.settings-general-description`）。
3. **运行时死类核对**（比 2 更严）：`grep -o 'config-[a-z-]*'` 全仓，确认每条 `config-*` 至少有一个**会渲染**的调用方；重点核 **19 个 Config 原语**是否有非零渲染。
4. **设置全 Tab 双实例同视口对拍**：`node audit/shoot.mjs shots`（已含在 `.settings-section-tab` 上逐 Tab 截图）。逐 Tab 并排看：**模型/Skills/扩展包三节应出现「侧栏 + 详情 + Footer」三栏结构**。
5. **对话框对拍**：`node audit/shoot-session.mjs shots`。工具行应满足：左 `[附件][模型选择器]` / 中 spacer / 右 `[思考][预设][压缩][(停止)][声音]`，**不得出现 `自动命名/导出/统计/插队`**。
6. **auto-name 端到端**：`curl -X POST .../api/sessions/<id>/auto-name -d '{"dryRun":true}'` 应返回 `{"title":"…"}`，**不得出现 `No model available`**。
7. **空态回归**：打开首页（有项目、无会话）→ 应看到品牌行 + 版本块 + 完整 Composer + 顶部工具条，**不得出现「从侧边栏选择一个会话」**。
8. **i18n 验收**：三语各跑一遍全站截图，**不得出现 fallback 到 key 字符串**；**不得出现英文标签混在中文界面**（当前 `General/Models/Skills/Plugins` 即失败）；切语言后 `document.documentElement.lang` 同步、刷新保持。
9. **排除项回归（交付前必跑）**：
   ```bash
   cd /Users/gatesma/project/WebstormProjects/pi-boat
   grep -rIl "MobileGate|agents-section|session-family|AgentSessionPanel|provider-usage|node-pty" packages/*/src apps/web/src
   # 应为零命中
   ```

---

## 9. 需用户拍板的问题

| # | 问题 | 背景 | 影响面 |
|---|---|---|---|
| **Q1** | **品牌名口径** | A 空态渲染其自有品牌名（`ChatWindow.tsx:1356`），B 渲染 **`PiBoat`**（`empty-state.tsx:62`，符合 ADR-0022）。但 ADR-0022 又要求"与 A 完全一样" | 决定是否违反 ADR-0022 |
| **Q2** | **`ProviderIcon` 要不要搬进 composer？** | 实测 A 的 `ProviderIcon.tsx`（43 条映射）**只在设置页**用，composer 里模型选择器用的是"芯片网格" SVG（`ModelSelector.tsx:200-207`）。上轮种子 C3 的描述**不成立** | 决定 composer 是否引入 43 条映射（按"以 A 为唯一真相"应**不引入**） |
| **Q3** | **`自动命名/导出/统计` 往哪放？** | A 的 composer 完全没有它们（A 对应能力在顶栏/侧栏）；B 有是因为 B 没有 A 的顶栏按钮组 | 决定是直接删，还是先落顶栏 |
| **Q4** | **「无项目」时 `skills`/`plugins` 的禁用口径** | A 需真实 project cwd（靠 `projectTrustCwd`）；B 退到家目录 `home.data.home`（`settings-host.tsx:68`）。叠加 B 缺 K4 的自动回退，会出现 A 不会有的空态 | 决定 `settings-host.tsx:164-165` 的禁用条件 |
| **Q5** | **模型节的 provider 身份认证边界** | ADR-0014 §2 排除 `/api/auth/*`。A 的 `activeOAuth`/`activeApiKey`/`AddProviderPicker` 应排除；但 `models.json` 自定义 provider 树 + 模型详情编辑器 ADR-0014 **明确保留** | 决定 T1-2 的工作量 |
| **Q6** | **源码高亮库** | A 用 `react-syntax-highlighter`（Prism）；B 已有 `shiki`（ADR-0009） | 换库 or 沿用 shiki 补暗色主题 + 行号 |
| **Q7** | **`↑` 输入历史浮层 / C20 过程组耗时 / C21 用量行是否纳入本轮？** | 分属 composer 与消息区 | 排期 |
| **Q8** | **F6/F7（live watch / load-more）与 DOCX 是否排期后端？** | 三者都需先扩协议/后端 | 排期 |
| **Q9** | **i18n 铺开与结构改造是否同批？** | ADR-0021 已定"同批"（避免写两遍）；三节重写时若不同批，硬编码中文会被写两遍 | 排期 |

---

## 10. 差异等级定义

| 等级 | 含义 | 典型例子 |
|---|---|---|
| **P0** | 结构或信息架构不同 / 整块缺失 → 一眼看出不像 | auto-name 运行时失败、有项目无会话时中栏退化、设置三节没套 SplitView、工具行缺附件/模型选择器、多出自动命名/导出/统计/插队 |
| **P1** | 布局或交互不同 → 并排看能看出 | 原生 `<select>` vs 自定义面板、声音用 emoji、候选浮层单形态、分支树缺连接线与徽章、图片预览不是灯箱 |
| **P2** | 视觉细节 → 单看不易察觉，对照能发现 | 间距、字号、圆角、hover 色、图标方向、文案、数字格式、盾牌色 |

---

## 附：取证产物索引

| 路径 | 说明 |
|---|---|
| `audit/sel.mjs` | CSS 选择器集合差集 |
| `audit/dead.mjs` | 死 CSS（零消费方）检测，含排除域白名单 |
| `audit/shoot.mjs` | 双实例同视口截图（主界面 + 设置全 Tab） |
| `audit/shoot-session.mjs` | 带真实会话的对话框特写 |
| `audit/shots/A-*.png` `B-*.png` | 19 张取证截图（`A-set-1-模型.png` / `B-set-1-Models.png` / `A-11-composer.png` / `B-11-composer.png` 为本次关键对照） |

> 注：本轮审查阶段为只读（未修改 B 仓库源码）；2026-09-26 本文件入库（`docs/10`）后作为**实施清单**使用，
> 已完成项已在 §6 勾选，进度小结见 `docs/09` §0.3。按 B 的 `AGENTS.md` 提交纪律，改动默认停在未提交状态。
