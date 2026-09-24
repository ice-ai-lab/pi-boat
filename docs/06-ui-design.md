# PiBoat —— ui 详细设计

> `@ice-ai/ui`：纯展示组件库。本文是 `docs/01-overview.md` §3.1 的实现细化，
> **视觉与交互基准是 `docs/design/piboat-web-v4.html`（原型 v4）**，数据形状来自
> `docs/05-client-design.md` §6 的视图模型，类型来自 `@ice-ai/protocol`。
> 状态：**M1 已落地**（2026-09-23，实现见 `packages/ui/src/`，宿主装配见 `apps/web/src/`）；
> 2026-09-24 按 v4 稿完成一轮对账（文案/尺寸对齐、死件清理，见 ADR-0012）。
> 技术栈基准由 ADR-0009 收口（见 §11.1）。
> 与代码不一致时以代码为准并当天更新本文档。

---

## 1. 定位与三条边界

| # | 边界 | 规则 |
|---|---|---|
| 1 | 不依赖宿主框架 | 不 import Electron / Next / 任何路由或查询库；组件只吃 props、只吐回调 |
| 2 | 不取数 | 不在 ui 里调 hooks 取数（M1）：容器与查询留在 `apps/web`，ui 保持可无 Provider 单测 |
| 3 | 不发明形状 | props 的类型来源是 protocol 与 docs/05 的视图模型，不自定义业务类型 |

例外（按需放开，需在本文件登记）：跨端复用的"容器型"组件（如 `SessionSidebar`）可在 M2 起依赖
`@ice-ai/client/react` 的 hooks——AGENTS.md 允许 ui 依赖 client hooks，但每加一个都要有第二个真实用途。

---

## 2. 视觉基准与 token 单一来源

- **唯一基准**：`docs/design/piboat-web-v4.html`。原型允许增量演进，但**签名细节必须保留**：
  0.5px hairline、superellipse 圆角、靛蓝点缀、毛玻璃浮层、sticky 输入卡 + 渐变淡入、细滚动条；
  表面三层（基底/侧栏面板/凹陷面）取 pi-web 配色——亮：纸白 `#ffffff` + 浅灰面板 `#f5f5f5` +
  凹陷 `#eeeeee`，暗：`#1a1a1a` / `#242424` / `#222222`（ADR-0011）
- **token 单一来源**：`packages/ui/src/styles/tokens.css` —— 亮/暗两个变量块，唯一允许出现
  字面颜色的地方；`theme.css` 只在其上做旧语义别名 + `@theme inline` 映射（ADR-0011）
  - 类名与 v4 原型一致（`.side`/`.disc`/`.md`/`…`），可逐项对账
- **基准分层（ADR-0012）**：v4 稿是**视觉基准**（配色/尺寸/排版逐项对账）；v4 稿未画的**功能位**
  （hero / `#heroSlot`、侧栏折叠、侧栏宽度拖拽、底栏版本号、列表运行提示）继承自 v3 稿，
  已按 v4 token 重绘后保留——**不因「v4 没画」而删除**，也不另造与两稿都不同的形态
- **样式就近放置**（ADR-0011，修订 ADR-0010 的「单文件逐字移植」承载）：组件样式与组件 tsx
  同目录（如 `chat/composer.css`、`inspect/file-dock.css`、web 端 `components/sidebar.css`）；
  `packages/ui/theme.css` 聚合 ui 侧，`apps/web/src/index.css` 聚合 web 侧（排其后，保持
  原 additions 的后置覆盖级联）；`styles/base.css` 只放全局 reset 与跨组件共享小件
  （ico 尺寸 / `svg.chev` / `.mini-btn` / `.shimmer` / 共享动画帧）
- **preflight 不引**（沿 ADR-0010）：全局 reset 由 `base.css` 提供；`button{font:inherit}` 会把
  按钮 `line-height` 变成继承值，而原型按钮是 UA `normal`（`.disc-head` 等基线会差 1–2px）
- **暗色不能写死在 `@theme` 里**（`@theme` 是编译期常量，写死则切主题失效）
- **消费方式**：`apps/web/src/index.css` `@import '@ice-ai/ui/theme.css'` +
  `@source '../../../packages/ui/src'`（Tailwind v4 需显式扫包外源码，否则 ui 的类名被摇掉）
- **dev 数据接入**（ADR-0009）：`apps/web/vite.config.ts` 把 `/api`（含 SSE）代理到 `http://127.0.0.1:9527`
  ——浏览器视角同源，与生产拓扑一致；代理**不得开启响应缓冲/压缩**，否则 `EventSource` 收不到帧

## 3. token 映射表（tokens.css → 语义别名）

字面色只写在 `styles/tokens.css`（亮 `:root` / 暗 `[data-theme="dark"]`，两主题同套变量名；
切换入口 + `piboat.theme` 持久化已落地，ADR-0010）；`theme.css` 在其上做语义别名并声明进
`@theme inline`（仅 var 引用，无字面颜色）。**组件 css 直接消费原始变量**（如 `var(--k-bash)`），
语义别名只服务少数 tsx 里的 Tailwind 工具类：

| 原始变量（tokens.css） | 语义别名（`@theme inline`） | 说明 |
|---|---|---|
| `--bg` | `--color-surface` | 应用基底：亮纸白 `#ffffff` / 暗 `#1a1a1a`（参考 pi-web） |
| `--bg-side` | `--color-panel` | 侧栏：亮 `#f5f5f5` / 暗 `#242424` |
| `--bg-raised` | `--color-raised` | 抬升面：输入卡 / 浮层 |
| `--bg-inset` | `--color-sunken` | 凹陷面：代码块 / 引用 / 表格头 |
| `--l1`…`--l3` | `--color-line` / `-line-strong` / `-line-strongest` | 暖调 hairline 3 档（冷灰描边落在暖底会显脏） |
| `--t1`…`--t4` | `--color-ink` / `-secondary` / `-tertiary` / `-quaternary` | 墨色四级 |
| `--accent` `--accent-hover` `--accent-weak` `--accent-line` | `--color-accent*` | 克制靛蓝 `#4a5ec9`（暗 `#98a5ef`） |
| `--hover` / `--sel` | `--color-hover` / `--color-selected` | 悬停 / 选中弱底 |
| `--k-think` `--k-bash` `--k-read` `--k-edit` `--k-err`（+`-bg`） | `--color-think/bash/read/edit/error`（+`-weak`） | 工具/轨迹语义色，色表见 §7 |
| `--add-bg` / `--del-bg` | `--color-add-weak` / `--color-del-weak` | diff 增/删弱底 |

**不进 `@theme`、由组件 css 直接消费的令牌**：`--bubble(-line)`（用户气泡）、`--menu`（毛玻璃浮层底，
配 `glass` utility）、`--c-kw…--c-punc`（代码高亮 token 清单，当前 shiki 走内联色）、
`--elev-sm/-card/-pop`（三档阴影，经 `elev-*` utility 消费）、`--font/--serif/--mono`、
`--r-s…--r-xl`（圆角梯度）、`--ease`、`--sbw`/`--chat-w`（布局尺寸，可拖拽/持久化，§8.4/8.5）、
`--sb-thumb(-hover)`（滚动条 thumb，`base.css` 全局规则消费）。

## 4. 组件清单

三册目录：`ui/src/primitives/`（无业务语义）、`ui/src/chat/`（对话域，消费 docs/05 视图模型）、
`ui/src/inspect/`（统计与检视，M2/M3）。

### 4.1 primitives（M1）

| 组件 | 关键 props | 原型来源 |
|---|---|---|
| `Icon` | `name`（lucide 名）`size` | 31 个 `#i-*` symbol，映射见 §6 |
| `Textarea` | `value` `onChange` `autoGrow` `maxHeightPx=168px` `onKeyDown` | `.input-card textarea` + `fit()`（v4：26–168px） |
| `Switch` | `checked` `onCheckedChange` | `.switch[data-tool]` |
| `Popover` | `trigger` `open` `onOpenChange` `align` `width` | `.pop` + `#wsMenu` + `#modeMenu`（4 处同一交互：锚点定位、点外/Esc/`data-x` 三路关闭） |
| `Tooltip` | `content` `children` | `.mm-tip` `title` 属性 |
| `Toast` | `message`（队列化） | `.toast` + `toast()`，底部居中浮层 |
| `ScrollArea` | `mask?: 'top'` | 细滚动条双分支 + `.scrollbody` 的 mask 渐隐 |
| `ProgressRing` | `value` `size` `strokeWidth` | `.ring` + `#ctxRing`（`stroke-dasharray` 数学） |
| `Chip` | `tone` `icon` | `.chip` `.spill` `.hchip` |

### 4.2 chat（M1 核心，消费 docs/05 §6）

| 组件 | 关键 props | 原型来源 |
|---|---|---|
| `MessageList` | `turns: Turn[]` `onReachTop` `autoScroll` + 插槽（minimap / 宽度把手） | `.scrollbody` + `.chat-col` |
| `UserBubble` | `text` `images?` `at` | `.msg-user` `.bub` `.tm` |
| `AssistantTurn` | `turn: Turn` | `.msg-asst` → `.model-tag` + `.flow` + `.usage-line` |
| `MarkdownView` | `markdown`（流式增量） | `.md` 全量排版 + `.tbl` 表格 wrap |
| `CodeBlock` | `code` `lang` `onCopy` | `.codeblk`（banner + 语言 + 复制 + `pre`） |
| `DiffView` | `lines`（来自 `toolResult.details.diff`） | `.diff`（行号 + `+`/`-`/ctx 前缀）——**无需 diff 库、无需协议改动**，见 §11.2 行 5 附注 |
| `CollapseRow` | `tag` `title` `durationMs` `open` `onToggle` `children` | `.disc` 原子（chev 旋转 + 耗时 + 限高滚动体） |
| `ToolTag` | `toolName` `status` | `.tag.tool.{bash,read,edit}` + `.tag.err`，色表见 §7 |
| `ThinkingRow` | `text` `streaming` `durationMs` | `.shimmer` 流式态 → 定稿态 |
| `ProcessGroup` | `group: ProcessGroupData` `open` | `.group-disc` + `.child-rail`（左导轨）+ 汇总标题 |
| `StoppedTag` | — | `.stopped-tag`（abort 后） |
| `Composer` | `value` `onChange` `onSubmit` `onAbort` `streaming` `model` `mode` | `.composer-seat`（渐变遮罩）+ `.input-card` + 发送↔停止 |
| `ModelBadge` / `ModeChip` | `model` / `mode` `onChange` | `.model-btn` / `.mode-chip` + `.mode-menu`。⚠️ **「模式」与工具预设已合并为同一概念**（2026-09-22 决策，docs/02 §11.1）：本组件与 `ToolList` 的分段控件读写同一状态 |
| `StatsPills` | `stats` `onSelect(kind)` | `#statsRow` 7 个 pill（in / out / cache / tps / cost / ctx ring） |
| `UsageLine` | `usage` `at` | `.usage-line`（每轮：in · out · cache R · cost · 时间） |
| `SystemPromptPanel` | `prompt: string \| null` `loading` | ✅ **形态已定（2026-09-23，ADR-0010）：回到原型的 `.pop` 锚定浮层**（560px，`#popSys` 的 `.sysprompt` 排版）；仍删掉「版本 r42 / 约 700 tokens」（前端无 tokenizer，硬凑会误导），改显示真实字符数；三态文案（空 / 尚未加载 / 加载中） |
| `MessageMinimap` | `turns` `scrollRef` | `.minimap` + `.mm-bar` + `.mm-tip` 预览，算法见 §8.3 |
| `ScrollToBottomButton` | `visible` `onClick` | **原型未画，M1 新增件**（照 pi-web `.chat-scroll-to-bottom`）：圆形按钮 + 下箭头，悬于 composer 上方，`visible = 有溢出 && 未贴底`，`smooth` 滚动，带 `aria-label`（§8.2） |
| `ContentWidthControls` | `width` `onWidthChange` `min` `max` | `.chat-handle` 双侧 + `--mh-y` 指针跟随光条 |
| `EmptyState` | `title` `subtitle` `children` | **v3 稿 `.hero`**（boat 浮动 + 插槽 + 版本脚注）；v4 稿未画 hero，按 ADR-0012 继承并以 v4 token 重绘。**M1 用它承载 cwd 输入**（v3 稿预留的 `#heroSlot`）：路径输入 → `POST /api/agent/new` → 成功后 cwd 转只读展示（`.ws-line`），见 §11.3 行 1 |

**M1 实现的文件与映射**（`packages/ui/src/`，文件名 kebab-case）：

| 目录 | 文件 | 说明 |
|---|---|---|
| `primitives/` | `icon.tsx`（Icon + BoatMark 品牌 SVG）· `textarea.tsx` · `switch.tsx` · `popover.tsx` · `tooltip.tsx` · `chip.tsx` · `progress-ring.tsx` · `scroll-area.tsx` · `toast.tsx` | 全部自绘（shadcn CLI 未引入，见 docs/01 §4 注） |
| `chat/` | `message-list.tsx` · `user-bubble.tsx` · `assistant-turn.tsx` · `markdown-view.tsx` · `code-block.tsx` · `diff-view.tsx` · `collapse-row.tsx`（CollapseRow + ToolTag + ThinkTag + StoppedTag）· `thinking-row.tsx` · `tool-row.tsx` · `process-group.tsx`（+ SystemRow/TrailRowView）· `composer.tsx` · `model-badge.tsx`（ModelTag + ModelBadge）· `mode-chip.tsx` · `usage-line.tsx` · `stats-pills.tsx` · `system-prompt-panel.tsx` · `scroll-to-bottom-button.tsx` · `empty-state.tsx` | M1 对话域组件全集 |
| `hooks/` | `use-auto-scroll.ts` | 吸附模型的纯函数 + hook |
| `styles/` | `tokens.css` · `utilities.css` · `base.css` | tokens.css：亮/暗设计令牌（唯一字面色来源）；utilities.css：`@utility` 共享件（见 §5）；base.css：全局 reset + 跨组件共享小件（见 §5） |
| 组件样式 | `chat/*.css` · `inspect/*.css` · `primitives/*.css`（与 tsx 同目录） | ADR-0011 就近拆分（如 `composer.css` `file-dock.css` `popover.css`），类名与 v4 原型一致 |
| 根 | `theme.css` | 聚合入口：Tailwind 两层 + `styles/` 三件 + 25 个组件 css `@import` + 语义别名 `@theme inline`；web 端 `apps/web/src/index.css` 再聚合 web 组件 css（排其后，保持后置覆盖级联） |

**M1 已落地的原型件**（ADR-0010 前移）：`MessageMinimap`、`ContentWidthControls`、`StatsCardGroup`、
`ToolList`、`FileDock`（`.rightbar` 三栏骨架 + dock 结构）、主题切换、左右栏拖拽 handle、
系统/工具/统计浮层。

**仍未接数据（M3）**：`FileTree`/`ChangesList`/`CodeViewer` 的**真实数据**（`/api/files` 与 git 域）
——结构已就位，当前显示未接入说明，不放假文件；工具预设切换（core 的 `set_tools`）也在 M2。

**M1 之后补落（2026-09-22，侧栏重构）**：`inspect/` 的 `SessionListItem`、`WorkspaceMenu`
两个组件，以及 `apps/web` 的两栏 AppShell —— 见 §4.4。

### 4.3 inspect（M2/M3 剩余）

`StatCardGroup`（`.pop-grid` / `.stat-card` / `span2`）、`ToolList`（`.tool-item` + `Switch`）、
`FileTree`（`.tnode` / `.branch-kids` / `.git M|A|U` 徽标）、`ChangesList`（`.chg-row` + `+/-` delta）、
`CodeViewer`（`.viewer-*`）、`DockTabs`（`.dtab`）。

### 4.4 侧栏（✅ 2026-09-22 补落，早于原计划的 M2）

> 起因：`/` 与 `/session/:id` 原本各渲染一套整屏布局，侧栏一出现就必须先有外壳；
> 同时「默认打开最近一次对话的文件夹空间」（§11.3 行 5）要求侧栏先能列出项目与会话。

| 组件 | 落位 | 关键 props / 行为 | 原型来源 |
|---|---|---|---|
| `WorkspaceMenu` | `ui/src/inspect/workspace-menu.tsx` | `projects` `activeKey` `loading` `onSelect` `onSelectCustom` `runningKeys?`；内部持有展开态（Popover）；路径用 `direction: rtl` 让省略号落在左侧 | `#wsBtn` + `#wsMenu` |
| `SessionListItem` | `ui/src/inspect/session-list-item.tsx` | `session` `active` `running` `onSelect` `onRename?` `onDelete?`；外层 div 定位 + 标题 button + 并列操作 button（原型是 button 套 button，HTML 非法且键盘不可达） | `.session-item` + hover `.ops` |
| `AppShell` / `Sidebar` / `ConvHeader` | `apps/web/src/components/` | 两栏骨架 + 侧栏折叠/宽度拖拽（持久化 `piboat.sidebar`）+ 中栏头部；文件夹空间状态在 `apps/web/src/lib/app-state.tsx`（Context + localStorage，不引 Zustand） | `.app` / `.side` / `.head`（v4 类名）；折叠与宽度拖拽是 v3 稿的功能位，v4 稿未画（ADR-0012） |
| `formatRelativeTime` / `groupByDay` | `ui/src/lib/format.ts` | 会话列表的时间（`21 分钟前` / `昨天 17:42` / `09-18`）与 今天/昨天/更早 分组（纯函数，有单测） | `.session-item .sm` / `.day`（v4：每个分组都带日期标签，含首组） |

**侧栏与原型的有意差异**：

1. **不画右栏（文件浏览器 dock）**：它依赖 `GET /api/files/*`，该域在 M3（docs/01 §6）。界面不放假面板
   ——没有的能力不画（AGENTS.md：命名/界面不得暗示它做不到的事）。同理头部只留 `系统` chip，`工具`/`统计` 归 M2。
2. **会话搜索是列表内过滤**：原型只有一个搜索框；服务端的 `/api/sessions/search` 是跨项目全文搜索，
   与「在当前空间的列表里找」语义不同——M1 做客户端过滤，M2 再分流（跨项目搜索给独立入口）。
3. **列表分组不再画 v3 的「会话」总标签**：v4 稿的 `.day` 每个分组都带日期标签（首组也是「今天」），
   故首组改用日期标签；「N 个会话运行中」作为 v3 功能位挂在首组右侧（`.run-hint`，ADR-0012）。
   同时修掉 v3 遗留规则 `.day > span:last-child`——它会把「只有一个 span」的日期标签也推到右侧并降级为
   `--t4`/500（与 v4 稿的左对齐/650/`--t3` 不符），现右对齐只落在 `.run-hint` 上。
4. **字栈跟随系统**：会话列表继承 `--font`，侧栏 `.tag` / `.model-chip` / `.ver` 走 `--mono`
   ——两者完全跟随系统字体，项目不自带字体文件；`--serif` 的 brand wordmark 不动。
5. **会话标题只在选中行加粗**：`.sess .st` 由 v4 的 `font-weight: 520` 降为 `400`，`520` 收进
   `.sess.on .st`；hover 不加粗。

### 4.5 不进 ui（留 `apps/web`）

AppShell 两栏布局 + 拖拽/折叠、主题切换、路由、QueryClient、Suspense/ErrorBoundary
边界，以及全部取数与过滤装配。

## 5. 共享 utility（`styles/utilities.css`）与全局基础（`styles/base.css`）

| 名字 | 定义 | 原型来源 |
|---|---|---|
| `hairline` | `border-width: 0.5px`（四向变体） | 全站 0.5px 描边，出现于 `.pop-rule` `.group-disc` `.child-rail` `.tnode .lno` 等 |
| `sq` | `border-radius` + `@supports (corner-shape: superellipse(1.5))` 增强 | `.sq`（48 处）；**必须保留 `@supports` 兜底**，该特性仅较新 Chromium/Safari 支持 |
| `elev-panel` / `elev-soft` / `elev-soft-sm` | 三档 `box-shadow`（`--elev-card` / `--elev-pop` / `--elev-sm`） | `.pop` `.input-card` `.new-session` 等 |
| `shimmer` | 文字渐变扫光（`@utility` + `pi-shimmer` 帧）；`base.css` 另有参数不同的 `.shimmer` 类（`shim` 帧），组件按原型出处各取其一 | 流式思考行 |
| `mask-fade-top` | `mask-image: linear-gradient(...)` | `.scrollbody`（含 `-webkit-` 前缀） |
| `glass` | `--menu` 毛玻璃底 + `blur(40px) saturate(150%)` | `.pop` / toast / minimap tip |

**`base.css`**（全局基础，非 utility）：`*` 盒模型 reset、`body` 字体/底色（不叠 Tailwind preflight，
§2）、`::selection`、`button/input` 继承、`:focus-visible`、**全局滚动条**（WebKit 8px + Firefox
`thin`，`@supports` 互斥写法，**不可合并**）、`.num` / `.ico`（`.s12/.s14/.s18`）/ `svg.chev` /
`.mini-btn`、共享动画帧（`rot`/`pulse`/`pop-in`）、`prefers-reduced-motion` 全站降级。
旧版 `.scrollbar-thin` 专属细滚动条与 `.pop-surface` 的 l2 thumb 变体已随 v4 移除（引用了 v4 已删的
`--sb-width`/`--sb-thumb-l2`，属死规则；类名在 tsx 仅作语义标记保留）。

## 6. 图标对账表（31 → lucide）

原型用 SVG sprite（`<use href="#i-*">`）换 lucide 按需导入，需逐一核对替换：

| 原型 | lucide | 原型 | lucide |
|---|---|---|---|
| `i-boat` | **品牌自留 SVG**（lucide 无） | `i-gear` | `Settings` |
| `i-panel` | `PanelLeft` | `i-moon` / `i-sun` | `Moon` / `Sun` |
| `i-plus` | `Plus` | `i-refresh` | `RefreshCw` |
| `i-search` | `Search` | `i-term` | `SquareTerminal` |
| `i-folder` | `Folder` | `i-pencil` | `Pencil` |
| `i-file` | `File` | `i-trash` | `Trash2` |
| `i-chev-r` / `i-chev-d` | `ChevronRight` / `ChevronDown` | `i-check` | `Check` |
| `i-branch` | `GitBranch` | `i-copy` | `Copy` |
| `i-book` | `BookOpen` | `i-bulb` | `Lightbulb` |
| `i-wrench` | `Wrench` | `i-spark` | `Sparkles` |
| `i-gauge` | `Gauge` | `i-upload` | `Upload` |
| `i-db` | `Database` | `i-list` | `List` |
| `i-coin` | `CircleDollarSign` | `i-clock` | `Clock` |
| `i-send` | `ArrowUp` | `i-stop` | `Square`（实心） |
| `i-img` | `Image` | | |

## 7. 工具名→色表（`ToolTag`）

| toolName | token | 备注 |
|---|---|---|
| （思考行） | `--k-think(-bg)` | 原型 `.tag.think` |
| `bash` | `--k-bash(-bg)` | 绿 |
| `read` | `--k-read(-bg)` | 业务蓝 |
| `edit` | `--k-edit(-bg)` | teal |
| 执行失败（任意工具） | `--k-err(-bg)` | 红（`.tag.err` / `.exit-chip`） |
| **其余全部**（`write` `grep` `find` `todo_write` `task` …） | 无具名色 | 现行实现：`.tag.tool` 只定 mono 字体，无底色字色（未具名工具不染色）；要给具名色须先扩 tokens.css 的 `--k-*`，**不允许组件内写字面颜色** |

## 8. 交互规格

### 8.1 折叠行（`.disc` / `.group-disc`）

- **组边界规则**（**已定**，照 pi-web）：轮的锚点 = user 消息（或 compaction / 子代理通知）；轮内以“最后一段
  非空文本块”为分界，其前的 thinking / toolCall 归组、之后的文本为回答区。**不得改用 turn/agent 事件**
  （历史无此边界，会让刷新前后形状漂移）——完整规则与候选方案见 `docs/05` §6.5
- **流式期间的形态**（**已定：方案 2**，照 pi-web）：末轮在 `isStreaming` 期间**平铺不分组**，轮结束后才成组并收起；
  `defaultExpanded = 本轮没拿到回答`（中断/报错时默认展开，避免空白）
- 静态默认：**收起**（v4 稿 HTML 中均为收起态）
- 流式行为：新出现的思考/工具行**自动展开**（`.shimmer` 态），其内容结束后**自动收起**
- **用户手动展开过的行/组不得被自动收起覆盖**：M1 由组件本地 state 实现（`userOpen: boolean | null`，
  `open = userOpen ?? 默认态`），**未**把 `userToggled` 写回视图模型——视图模型保持纯派生、无 UI 状态
- 默认展开策略：思考行 `streaming`、工具行 `running/preparing/error`、过程组 `本轮无最终回答`
- 过程组收起时不渲染 `.child-rail`（`group-disc:not(.open) > .child-rail{display:none}`）
- 折叠体限高 240px 内滚动，`white-space: pre-wrap` + `word-break: break-all`

### 8.2 滚动与自动滚底（**已定**：照 pi-web 的吸附模型）

原型只有无条件 `scrollBottom(el)`。**采用 pi-web 已实测的纯函数模型**（`lib/chat-lazy-load.ts`）
——它比“上滚超过一屏才脱离”更灵敏，且带滞回避免抖动：

- **贴底容差** `TAIL_TOLERANCE = 8px`：`top + clientHeight >= scrollHeight - 8` 即视为贴底
- **脱离 / 重吸**（`getLiveFollowAttached(wasAttached, prevTop, top, …)`）：
  ① 贴底 → 吸附；② **向上滚（`top < prevTop`）→ 立即脱离**；③ 未吸附但向下滚进入
  `REATTACH_TOLERANCE = 96px` → 重新吸附；④ 其余情况保持原状态（**内容增长不会误吸附**）
- **「回到底部」按钮**（原型未画 → **M1 新增件** `ScrollToBottomButton`）：`scrollHeight > clientHeight && 未贴底`
  时显示（pi-web 的 `shouldShowScrollToLatest`），点击 `smooth` 滚动，带 `aria-label`。
  实现上由 `MessageList` 自己渲染（绝对定位在列表右下角，视觉上正落在 composer 上方）——
  滚动状态（贴底与否）只有列表视口知道，不额外提状态到 app
- 判定函数与两个容差常量在 `ui/hooks/use-auto-scroll.ts`，**有单测**（`packages/ui/test/scroll.test.ts`，6 例）
- **自己发出消息时强制回底**（`instant`）
- `MessageList` 顶部需要历史加载触发点（配合 `GET /api/sessions/:id/context` 分页；pi-web 用“保持滚动距离”
  的 capture/restore，M2 分页时再照搬）
- 判定函数与两个容差常量均为纯函数 → 放 `ui/hooks` 或 `client`，**必须有单测**（pi-web 就是这么组织的）

### 8.3 Message minimap

- 密度：每个 turn 一条 `mm-bar`，`right:11px; width:14px; height:3px`，hover 时放大并右移
- `at` 态：当前视口覆盖的 bar（`scrollTop / total` 到 `(scrollTop + clientHeight) / total` 区间）
- hover 出 `mm-tip`（280px 宽，最多 4 行预览，`backdrop-filter: blur(40px)`）
- 点击 `scrollIntoView({behavior:'smooth', block:'start'})`
- ⚠️ 原型的 `.mm-bar` 是 `div`，**不可键盘访问** → 实现改为 `button`

### 8.4 内容宽度把手（`ContentWidthControls`）

照搬 dsh `ConversationWidthControls` 规格：双侧整列高热区、位于内容列边缘外 24px、
hover/拖动显示 2px 光条、光条跟随指针 Y（`--mh-y`）、±36px 渐隐、滚轮落在把手条上转发给滚动区、
持久化 key `CHAT_W_KEY`（`localStorage`）。默认宽度按列宽比例（原型：90%，上限 1180）。

### 8.5 侧栏/右栏拖拽

`makeDrag(handleId, cssVar, min, max, fromRight)` 供左栏、右栏、内容宽度三处复用；
拖动期 `body.resizing`（禁 textarea/iframe 的 pointer 事件）。**原型未持久化侧栏宽度** → 与 §8.4 统一到
`usePersistentPref`。

**侧栏已落地（2026-09-22，§4.4）**：折叠态 + 宽度存在 `piboat.sidebar`（`{collapsed,width}`），
宽度夹在 200–440（原型同一个区间）；拖拽用 pointer capture，分隔条是 `<hr>`（隐式 `separator` 角色）
并带 `aria-valuenow/min/max` 与左右方向键 ±16px——不依赖鼠标。右栏拖拽随 M3 的 dock 一起做。

### 8.6 其他

- Composer 自动增高（`min-height:26px; max-height:168px`，v4 稿 `.input-card textarea` + `fit()` 上限）、
  `Enter` 发送 / `Shift+Enter` 换行（原型
  脚本行为，具体快捷键见 §11）
- 浮层关闭三路：点外部、Esc、`[data-x]`（`closePops/closeAll`）
- 主题切换：`[data-theme]` 属性 + `localStorage`；「跟随系统」在 M2 用 `prefers-color-scheme` + `matchMedia`

## 9. 响应式与无障碍

### 9.1 响应式（**已定：只保大屏，不做小屏适配**，2026-09-22）

M1 只保证**大屏可用**；小屏不做适配，屏幕特别小时**停止适配**（而非硬撑着变形）：

- 视口宽度 **< 880px**（原型第二条断点，语义一致：原型在该宽度把侧栏降为覆盖层）→ 不渲染聊天区，
  显示一个极简提示（复用 `EmptyState`）：“窗口过窄（< 880px），请加宽窗口”
- **M1 不做**：drawer / 单栏重排 / `useIsMobile` / 底部导航。移动端与 PWA 形态随 M3 路径一起排期
- 但**保留「禁写死桌面假设」这条低成本约定**（docs/01 §5.5 ①）：组件不把三栏/固定宽度当硬前提，
  以免将来要适配时得重写；具体表现为：布局尺寸走 props/CSS 变量、不把 `--sbw` 参与
  窄屏计算、组件不依赖 `window.innerWidth` 做结构判断
- Electron 主窗口的最小宽度由 M4 设（与 880 对齐）

原型现状：只有 1180 / 880 两条“覆盖式”断点。M1 不实现 1180 那条（M1 无右栏）；880 转为上述门禁。

### 9.2 无障碍（原型现状：几乎为零）

原型全文除 `aria-hidden` 外**无任何 aria 属性**。移植时补齐：浮层用 `role="dialog"` + 焦点陷阱 +
`aria-expanded`（触发器）、折叠行 `aria-expanded` + `aria-controls`、minimap 改 `button` 并给 `aria-label`、
`FileTree` 用 `role="tree"/"treeitem"` 且节点改 `button`、流式区域 `aria-live="polite"`（避免整段重读）、
图标按钮一律有 `title`/`aria-label`、颜色不得作为唯一状态载体（工具错误同时给图标）。

**M1 实际完成**：图标按钮全部 `title`+`aria-label` + `aria-pressed`（浮层触发器）；浮层 `role="dialog"`
+ Esc/点外关闭；折叠行 `aria-expanded` + `aria-controls`；工具失败同时给警告图标；流式回答
`aria-live="polite"`（仅末轮）；Toast `role="status"`；分段控件用 `fieldset`；
未做：焦点陷阱（M1 浮层内无表单）与 `FileTree` 的 tree 语义（M3）。

## 10. 原型自身待修（移植前顺手清）

| # | 问题 | 处理 |
|---|---|---|
| 1 | `--font-noto-mono` 未定义（`--mono` 引用了不存在的变量） | 补定义或删引用 |
| 2 | `#trajScroll` 在脚本中被查询，DOM 里无此元素 | 死代码，删 |
| 3 | 演示文案残留旧架构/端口：`core:8787`、`localhost:5173`、`VITE v6.3.5` | 改为 9527 / 9528（`PORTS` 单一来源） |
| 4 | 侧栏会话项写死"19 条消息""昨天"分组等假数据 | 接 `SessionInfo.modified/messageCount` |
| 5 | `.viewer-code` 自养高亮（`.kw/.st/.fn/.cm`） | 换 shiki（与 `MarkdownView` 的 `CodeBlock` 同源，不要两套高亮器） |
| 6 | `.tnode`/`.mm-bar` 用 `div` 承担点击 | 改 `button`（§8.3、§9.2） |
| 7 | v3 稿 hero 版本文案 `web v0.1.0`（v4 稿无 hero） | 接构建期注入的真实版本号：hero 脚注 + 侧栏底栏 `.ver`，值取 `__APP_VERSION__` |

## 11. 待决策与协议缺口

### 11.1 技术栈基准（ADR-0009 已接受，2026-09-22）

Tailwind CSS v4（`@theme inline`）、React Compiler、
Lucide、`cva` + `clsx` + `tailwind-merge`（`cn()`）、markdown 走 `react-markdown` + `remark-gfm`
+ `shiki` + `rehype-sanitize`（禁裸 `dangerouslySetInnerHTML`——**M1 实测取法**：shiki 用 `codeToTokens`
渲染 React 元素，而不是 `codeToHtml` + innerHTML）。**ui 不引 TanStack Query**（§1 边界 2）。
shadcn/ui CLI 未在 M1 引入：M1 的 9 个 primitive 都是自绘轻量件（clsx + tailwind-merge；`cva` 属
ADR-0009 的既定栈，M2 接入 shadcn 组件时启用——M1 已无 cva 变体件，见 ADR-0012），
shadcn 的价值在表单/复杂弹层（M2+），届时按本包 alias 落位 `primitives/`。
外部前端规范 skills **不引入本仓**——规范即 ADR-0009 + 本文 + `docs/05`（避免两处规范漂移，
且其模板的 zod 3 / TS 5.8 / Biome 1.9 与本仓 zod 4 / TS 7 / Biome 2 冲突）。

### 11.2 原型暴露的协议/核心缺口（详见 docs/02 §11.1）

| 原型展示 | 现状 | 取向 |
|---|---|---|
| 性能统计：轮数/步数、LLM 耗时、工具耗时、生成速度 t/s（`StatCardGroup` 4 卡 + 2 pill） | `SessionStatsInfo`/`AgentState` **均无这些字段**；SDK `SessionStats` 也没有（已核对 0.85.1 `.d.ts`） | ✅ **已定：core 累加**（2026-09-22）——`rounds` ← `agent_start` 数、`steps` ← `turn_start` 数、`llmMs` ← 每 turn 起止、`toolMs` ← `tool_execution_start/end`、`tps` ← output tokens / `llmMs`。⚠️ **冷会话**（本进程未运行过）无耗时数据，字段必须可选，`undefined` 时 UI 不展示该卡 |
| 「最近提交 29d8be9」 | `SessionInfo` 只有 `branch`/`isWorktree` | M3 git 域返回后拼装，不进 `SessionInfo`（维持原议） |
| 工具预设分段 `chat-only/read-only/default/full` | protocol 无枚举 | ✅ **已定（2026-09-22）**：预设判定归 **core**——只有 core 知道 SDK 的默认工具集（`default` 无法在客户端静态枚举）；M2 开工时定命令形状（`set_tools` 收 preset 名或新命令），**不养期货** |
| 输入卡「模式：默认/只读/**全自动·免确认执行命令**」 | 与工具预设语义重叠；「免确认」在 SDK 0.85 无对应能力 | ✅ **已定（2026-09-22）：与工具预设合并**，模式菜单直接展示四项预设（标签用工具集描述），**删掉「全自动·免确认」**——AGENTS.md：命名不得暗示它做不到的事 |
| 系统提示词「版本 r42」 | `AgentState.systemPrompt` **已在 M1 契约内**（core 在 `getRunningState()` 读 `session.systemPrompt`） | ✅ **已定（2026-09-23，ADR-0010）：展示，形态取原型的 `.pop` 锚定浮层**。**删掉「版本 r42」与「约 700 tokens / 占用上下文 0.07%」**（前端无 tokenizer，硬凑会误导）；「注入于会话创建时」改为「最近一次构建」——上下文文件重载后 prompt 会变 |
| 每轮 `usage-line` | ✅ `message.usage` 已覆盖 | 无需动作 |

**系统提示词面板（参考 pi-web `components/SystemPromptPanel.tsx` + `lib/exact-system-prompt.ts`）**：

- 形态：✅ **已定（2026-09-23，ADR-0010）：回到原型的 `.pop` 锚定浮层**（560px；2000+ 字符长文本的阅读位置靠浮层内的独立滚动保持）；
  顶栏「系统」按钮（`aria-pressed`，有内容时图标转 accent）→ 面板 `height: min(600px, 75dvh)`、`pre-wrap`、等宽 12px
- 三态文案：`""` →「为空（工具已禁用）」/ `null` + loading →「正在加载…」/ `null` →「尚未加载」
- 数据源：`get_state` 的 `systemPrompt`（pi-boat 已具备）。**pi-boat 应改用轻查端点 `GET /api/agent/:id`**，因为 `get_state` 走命令 FIFO，run 期间会排到 prompt 结束（docs/02 §6.1）
- pi-web 在**面板打开时才懒加载**（不占用 prompt 前的初始化），ph-boat 同理：打开时拉一次即可
- 刷新后的限制：M1 未做会话恢复，刷新后会话不在注册表 → 轻查返回 `{running:false}`，面板只能显示「尚未加载」（M2 恢复能力到位后消失）
- ⚠️ SDK 升级注意：pi-web 记录 **Pi 0.86 起 `agent.state.systemPrompt` 改为转录回放且不可赋值**（精确 prompt 需 `before_agent_start` 扩展覆写）；pi-boat 锁 0.85.x 时是直通，升级时必须重验「面板显示的是否仍是实际发送的 prompt」

### 11.3 已收口的 M1 流程/规格细节（2026-09-22）

这五项不是架构分叉，但不确认就会先卡住第一行代码。**现已全部定案**（行 5 为侧栏上线时新增）：

| # | 议题 | 现状 | 选项 | 阻塞性 |
|---|---|---|---|---|
| 1 | **新建会话的 `cwd` 来源** | `POST /api/agent/new` 的 `cwd` 是**必填**（`z.string().min(1)`），而 M1 不做工作区 UX | ✅ **已定（2026-09-22）：前端路径输入框 + `localStorage` 记住上次**。落位：`EmptyState`（hero）的插槽（原型已预留 `#heroSlot`）；提交前只做字符串级校验（非空、绝对路径），**存在性由 core 校验**（见下行）。**实现补充（2026-09-23）**：首页只建空会话（`type: ensure_session`），首条消息随路由 state 带到会话页，**等 `connected` 后再发 prompt**——保证「先建流、再跑首轮」，否则首轮拿不到流式增量（事件不重放，docs/04 §5.5） | **高**（无 cwd 无法建会话） |
| 1b | （连带）**不存在的 cwd 会静默建会话** | 实证（2026-09-22）：SDK `createAgentSession({ cwd: '/不存在' })` **不报错照样建会话**，之后每次 read/bash/edit 都在会话里失败——用户看到的是“agent 莫名一直报错” | ✅ **已定：core 在 `create()` 前置校验**（存在且为目录 → 否则 `UserInputError` → 400），M1 内完成。**不可拖到 M3** 的 `/api/cwd/validate`；也不可选“什么都不做” | **高** |
| 2 | 自动滚底 vs “用户上滚后脱离” | 原型只有无条件 `scrollBottom()` | ✅ **已定（2026-09-22）：照 pi-web 的吸附模型**（贴底 8px / 重吸 96px / 上滚即脱离 / 新增 `ScrollToBottomButton`），见 §8.2 | 中 |
| 3 | <880px 的响应式形态 | 原型只有 1180/880 两条覆盖式断点 | ✅ **已定（2026-09-22）：只保大屏，不做小屏适配**——<880px 显示“窗口过窄”提示，不做 drawer/重排；保留“禁写死桌面假设”，移动端随 M3 排期，见 §9.1 | 低 |
| 4 | 深色主题是否进 M1 | 原型的 `[data-theme="dark"]` token 已完整 | ✅ **已定（2026-09-23，ADR-0010）：启用**——左栏底栏给切换入口（原型 `#themeBtn`），主题持久化 `piboat.theme`；按原型交付就不再把 dark 排除在外 | 低 |
| 5 | **默认打开哪个文件夹空间** | 打开应用时左栏先选中哪个项目（侧栏上线前不存在这个问题，因为根本没有列表面） | ✅ **已定（2026-09-22）：默认打开最近一次对话的文件夹空间**——即 `GET /api/projects` 首项（服务端按 `lastModified` 降序，ADR-0008）。“最近一次对话所在的项目”与其“最近有活动的项目”是同一项，无需额外扫描会话。两个从属规则：① **记住的选择仍存在时优先**（用户显式选过就不该被覆盖）；② 记住的已失效 / 清单为空 → 回落 hero 的路径输入。**不**记忆「空间内最后打开的会话」——那会让 `/` 直接跳进旧会话，与 hero 的“从一次对话开始”语义冲突。落位 `apps/web/src/lib/workspace.ts` + `lib/app-state.tsx`（有单测） | 中 |

---

*本文与代码不一致时以代码为准并当天更新（AGENTS.md）。视图模型形状由 `docs/05-client-design.md` §6
定义，改形状须同时改两文。*
