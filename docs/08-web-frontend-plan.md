# PiBoat —— Web 前端一期实施规划（对齐 pi-web 页面功能）

> 目标：**一期实现与 pi-web 相同的页面功能**（扣除已排除域，见 §5 差异清单），组件**尽量从 pi-web 复用**（MIT），
> 并按本仓分层铁律落位到 `packages/client` / `packages/ui` / `apps/web` 三包。
> 参照系：**pi-web 源码快照**（`~/project/WebstormProjects/pi-web`，npm 0.9.1 对应源码）；
> 本仓既有设计：`docs/05`（client）/ `docs/06`（ui 视觉与交互）/ ADR-0002（Vite SPA）/ ADR-0009（前端栈）。
> 状态：**已定案**（2026-09-27 用户确认六项决策，落成 ADR-0019；见 §6）。本文作为 F0–F5 批次的排期依据，
> `docs/05`/`docs/06` 的组件与模块细节仍以那两文为准（本文不重复其内容，只做范围与落位）。

---

## 1. pi-web 前端功能盘点（一期对齐的基准）

pi-web 是单路由 Next.js 应用：`app/page.tsx → AppShell`（2 544 行 god component）统管全部状态。
按界面区域盘点（行数为规模参照，移植≠照搬，见 §2）：

### 1.1 布局与全局

| 区域 | pi-web 组件 | 功能点 |
|---|---|---|
| 应用骨架 | `AppShell` | 三栏布局（侧栏/对话/右栏）、左右栏拖拽调宽与持久化（`panel-layout`）、全局键盘快捷键（`useKeyboardShortcuts`）、主题 light/dark/system（`useTheme`）、i18n（en/zh-CN/zh-TW，`useI18n`）、视口高度（`useViewportHeight`）、声音开关（`useAudio`）、页内 Notice 队列 + 浏览器 Notification、PWA 注册（`PwaRegistration`）、移动端布局（`MobilePwaLayout`）、多页签会话记忆（`tab-session` / `initial-navigation` / `workspace-memory`）、草稿箱（`draft-store` + `rekeyDraft`）、`/login` 登录页 |
| 左侧栏 | `SessionSidebar`（2 478 行） | 项目分组与最近项目（`project-groups`）、worktree 切换器与创建（`/api/worktrees`）、会话家族聚簇（`session-family`，**pi-boat 延后**）、会话列表窗口化（54px 定高行）、会话搜索（`SessionSearch` + `session-search`）、行内重命名/删除/导出/复制会话信息（右键菜单）、文件树（`FileExplorer` + `FileIcons` + `file-dirent`）、新建会话（`DirectoryPicker` + `directory-browser` + `cwd/validate`）、git 状态徽标 |
| 中间对话 | `ChatWindow`（1 998 行） + `ChatInput`（2 741 行） | 见 §1.2 |
| 右栏 | `TabBar` + `FileViewer`（1 800 行） + `TerminalPanel` | 文件多标签查看（`file-tab-state`）+ PTY 终端页签（**pi-boat 排除**） |
| 顶部活动面板 | `BranchNavigator` / `SystemPromptPanel` / `ToolDefinitionsPanel` / `AgentSessionPanel` | 分支树导航（fork/clone/navigate_tree）、系统提示词、工具定义、会话信息 + 统计 |
| 设置浮层 | `SettingsPanel` + `SettingsUi` | 五节：general（主题/语言/思考默认展开/内容宽度/字号/引用选择/PowerShell/声音）/ models / skills / agents（**延后**）/ plugins；节内导航记忆（`settings-navigation`） |
| 对话框 | `ProjectTrustDialog` | 项目信任授予（409 两种拒绝态） |

### 1.2 对话域（一期核心）

**ChatWindow**：消息渲染（`MessageView` 1 935 行：markdown / KaTeX / Mermaid / 代码高亮 / diff / 图片预览 / thinking 折叠 / toolCall 折叠 / compaction 摘要 / bash 执行记录渲染）、流式增量、minimap（`ChatMinimap`）、滚动吸附与历史懒加载（`chat-scroll-position` + `chat-lazy-load`）、steering/followUp 队列条、`TurnWrittenFiles`（本轮写出文件）、引用选中文本、搜索结果跳转（`pendingSearchScroll`）、扩展状态栏（`ExtensionStatusBar`）与 widgets（`ExtensionWidgets`）。

**ChatInput**：多行自动增高、图片附件（`image-attachments`，base64 进 `prompt.images`）、输入历史 ↑↓、`@` 文件提及（`file-fuzzy` + `/api/file-index`）、`/` 斜杠命令（`get_commands` + `slash-display`，含技能扩展）、`!` bash 直连（**pi-boat 排除**）、引用回复、steer / followUp 两种排队发送、compact context 与 stop compaction、模型选择器（`ModelSelector` + `ProviderIcon`）、思考档位菜单、工具预设（`tool-presets` + `tool-preset-preference`）、发送↔停止、更多控制浮层。

### 1.3 状态与数据层（`useAgentSession` 2 463 行 + `lib/agent-client`）

SSE 连接管理（`agent-event-connection` / `agent-event-stream` / `agent-event-wire`：seq 对账、重连、idle 宽限）、命令发送、事件→UI 状态折叠、分支树维护、lease 续期（30s）、notices、模型列表加载与重试、系统提示词/工具懒加载、会话统计轮询、prompt 提交恢复（`prompt-recovery`）、`!bash` 执行（排除）。

> **就绪度**：以上除 §5 排除项外，后端 55 端点 / 24 命令 / 27 类 wire 事件**全部就绪**（`docs/07` §1）。
> 唯一后端缺口 G2-11（启动偏好落盘）用前端 localStorage 绕过（同 pi-web 的 `startup-preferences`，见 §6-4）。

---

## 2. 复用策略：三分法

pi-web 前端 ≈ 28 700 行（components + hooks + app）。不能整包搬：它是 Next.js + 手写 CSS 变量体系 +
`fetch` 直连 + 自有 `lib/types.ts`；本仓是 Vite SPA + Tailwind v4/shadcn + `@ice-ai/protocol` 契约 +
client 统一 HTTP 层。复用按三类处理，**每个移植文件头部注明 `// Ported from pi-web (MIT): <相对路径>`**（MIT 保留版权声明）。

### 2.1 A 类：纯逻辑直接移植（约 40 个 lib 模块 → client / ui，测试一并转 Vitest）

与框架无关、与视觉无关的算法/状态模块，改 import（`lib/types` → `@ice-ai/protocol`）后即可用；
pi-web 的 `.test.mjs`（node:test 风格）改写为 Vitest 用例，**先移植测试再移植实现**（锁行为）。

| 域 | pi-web 模块 | 落位 | 备注 |
|---|---|---|---|
| 事件折叠 | `agent-event-wire` / `agent-event-stream` | `client/src/stream/`（docs/05 §6 已定 fold/rebuild 形状） | **以 docs/05 规格为准**，pi-web 作参照对照物 |
| 分支树 | `session-tree` / `search-tree` | `client/src/view-models/` | BranchNavigator 数据源；`session-family` **不移植**（聚簇延后） |
| 会话元数据 | `session-title` / `session-stats` / `session-timing` / `session-view-cache` / `session-revision` | `client/src/view-models/` | stats 口径对齐 core `computeStats`（ADR-0010） |
| 项目分组 | `project-groups` / `project-identity` | `client/src/view-models/` | 对齐本仓 `projectKey`/`listFingerprint`（ADR-0008） |
| 滚动/懒加载 | `chat-scroll-position` / `chat-lazy-load` | `client/src/view-models/`（纯函数） | 吸附模型已定（docs/06 §8.2），pi-web 版作参照 |
| 输入辅助 | `file-fuzzy` / `quoted-selection` / `prompt-recovery` / `draft-store` / `image-attachments` / `slash-display` / `tool-presets` / `tool-preset-preference` / `tool-call-expansion` / `thinking-expansion-preference` | `client/src/input/` | `tool-presets` 的 `default` 集以 core 解析结果为准（G2-9） |
| 渲染辅助 | `message-display` / `streaming-message` / `compaction-summary` / `turn-written-files` / `session-file-references` / `tool-names` / `ansi` | `ui/src/chat/` 同级 `helpers/` | 纯展示派生，不进 client |
| Markdown | `markdown` / `apply-patch` / `patch` | `ui/src/chat/helpers/` | 渲染走 react-markdown + shiki + rehype-sanitize（ADR-0009） |
| 布局/记忆 | `panel-layout` / `workspace-memory` / `tab-session` / `initial-navigation` / `settings-navigation` | `apps/web/src/services/` | 偏好持久化统一 `usePersistentPref`（docs/06 §8.5） |
| 文件域 | `file-types` / `file-dirent` / `file-paths` / `file-viewer-state` / `file-explorer-state` / `text-preview` / `directory-browser` / `file-links` | `client/src/files/`（类型/路径）+ `ui/src/files/`（视图态） | Range/DOCX/分块不做（docs/07 §9） |
| 模型域 | `model-catalog` / `enabled-models` / `model-scope` / `models-cache` | `client/src/models/` | 前端镜像须对齐 ADR-0011（glob 陷阱、最小编辑、最后模型 409） |

**不移植**（服务端域，pi-boat 已在 core 实现）：`session-reader*`、`session-list-scanner`、`session-path`、
`terminal-manager` / `terminal-client` / `terminal-input`、`rpc-manager*`、`web-push` / `push-client`、
`web-auth*` / `auth-throttle` / `login-destination`、`provider-credential-store` / `provider-usage*`、
`subagent-*` 全组、`app-update`、`bash-output`、`exact-system-prompt`、`models-config-store`、
`enabled-models-runtime`（后端已有）、`git-status` / `worktree`（后端已有）、其余 `*.route` / server 侧工具。

### 2.2 B 类：行为参照、视觉重写（组件层）

pi-web 的 CSS（`globals.css` 手写类 + CSS 变量）与本仓体系（Tailwind v4 + shadcn + 原型 token）不兼容，
且本仓**视觉基准是 `docs/design/piboat-web-v3.html` 原型**（docs/06 §2，hairline/superellipse/#4176E6）。
因此组件层**移植交互与结构、不移植样式**：JSX 结构、状态机、键盘/焦点行为、aria 属性参照 pi-web；
类名与视觉按 docs/06 token 重写。重写时顺手完成 docs/06 §9.2 的无障碍补齐与 §10 的原型待修项。

### 2.3 C 类：不移植（排除域，见 §5）

终端组（`TerminalPanel` / `terminal-tab-state` / xterm 依赖）、登录（`/login`）、PWA 组
（`PwaRegistration` / `MobilePwaLayout` / `manifest` / `push-client`）、`ProviderUsageSummary`、
`AgentsConfig`（子代理延后，§8-4）、app-update 提示、`custom` 扩展 UI method（ADR-0012 只做 9 个 method）。

### 2.4 状态架构改造（AppShell 反模式的教训）

pi-web 把 ~30 个 `useState` 全塞在 AppShell + 一个 2 463 行 hook 里。本仓按既定架构拆解
（docs/05 §7 已定骨架，这里补完整映射）：

| pi-web 状态 | pi-boat 落位 | 说明 |
|---|---|---|
| 当前会话 / 页签 / 初始导航 | React Router v7（库模式）+ `apps/web` 路由 context + `tab-session` | URL 形态见 §6-5 |
| SSE 事件流 → UI 状态 | `client/stream/AgentStream`（`useSyncExternalStore`） | docs/05 §5–6 已定，`useAgentSession` 的流部分收敛于此 |
| REST（列表/详情/模型/文件/git） | TanStack Query（`client/react/queries.ts`） | 只管 REST，事件流不入 Query（ADR-0009） |
| 命令发送（prompt/set_model/fork…） | `client/react/use-session-commands.ts` | 命令面 = protocol 24 条 |
| lease 续期 / 重连 / notices | `client/react/use-agent-session.ts`（编排层） | 薄编排，不再折叠事件 |
| 布局宽度 / 面板开关 / 偏好 | `apps/web` context + `usePersistentPref` | `panel-layout` 移植后归 web |
| 主题 / 声音 / 快捷键 / 通知 | `apps/web/src/services/` | ui 只出受控组件 |
| 会话内 UI 态（折叠/展开/宽度） | 组件局部 state + 偏好 hook | 不上全局 store |

---

## 3. 三包模块地图（一期终态目录）

### 3.1 `packages/client`（在 docs/05 §2 基础上扩容）

```
src/
├── http.ts                     # Axios + Zod + 错误信封（docs/05 §4，不变）
├── endpoints/                  # 9 域全量：agent / sessions / models / models-config /
│                               #   files / git / worktrees / resources / projects+system
├── stream/                     # event-source / fold / rebuild / group-trail / agent-stream
├── view-models/                # session-tree / session-stats / session-title /
│                               #   project-groups / chat-scroll-position / chat-lazy-load
├── input/                      # file-fuzzy / quoted-selection / prompt-recovery /
│                               #   draft-store / image-attachments / slash-display /
│                               #   tool-presets / tool-preset-preference
├── files/                      # file-types / file-paths / file-dirent / text-preview / directory-browser
├── models/                     # model-catalog / enabled-models / model-scope / models-cache
└── react/                      # use-agent-session（编排）/ use-agent-stream / use-session-commands /
                                #   queries.ts + queryKeys / use-models / use-files …
```

### 3.2 `packages/ui`（在 docs/06 §4 基础上扩三册目录）

```
src/
├── primitives/                 # docs/06 §4.1 全件（不变）
├── chat/                       # docs/06 §4.2 + 拆解 MessageView：
│   │                           #   MarkdownBody / CodeBlock / MermaidBlock / ImagePreview /
│   │                           #   DiffView / CompactionSummary / MessageMinimap / …
│   └── helpers/                # message-display / streaming-message / tool-names / ansi …
├── sidebar/                    # SessionSidebar(容器*) / SessionRow / ProjectGroupHeader /
│                               #   WorktreeSwitcher / SessionSearch / FileTree / DirectoryPicker
├── files/                      # FileTabs / FileViewer / CodeViewer / ImagePreview /
│                               #   file-viewer-state
├── settings/                   # SettingsPanel(容器*) / GeneralSection / ModelsConfig /
│                               #   EnabledModelsSection / SkillsConfig / PluginsConfig / FrontmatterCard
├── panels/                     # BranchNavigator / SystemPromptPanel / ToolDefinitionsPanel / SessionInfoPanel
├── extension/                  # ExtensionStatusBar / ExtensionWidgets /
│                               #   九种 request 对话框（select/confirm/input/editor/…，无 custom）
└── inspect/                    # docs/06 §4.3（StatCardGroup / ChangesList / WorkspaceMenu …）
```

带 `(容器*)` 的组件依赖 `@ice-ai/client/react` hooks——**ui 边界例外登记**（docs/06 §1 例外条款）：
一期登记四处：`SessionSidebar`、`SettingsPanel`、`FileViewer`、`ExtensionWidgets`（各自在 web 与
未来 Electron 至少两处宿主复用，满足「第二个真实用途」）。其余组件保持 props 驱动、无 Provider 可测。

### 3.3 `apps/web`

```
src/
├── main.tsx / router.tsx       # RR7 库模式：'/'（工作区）单路由 + ?s= 会话参数；设置/面板均浮层
├── layout/                     # WorkspaceLayout（三栏 + makeDrag）/ TabSystem / PanelHost /
│                               #   SettingsHost / ProjectTrustHost / MobileGate(<880)
├── providers/                  # QueryClient / Theme / Sound / Notification / KeyboardShortcuts
├── services/                   # panel-layout / workspace-memory / tab-session /
│                               #   initial-navigation / settings-navigation / startup-preferences
└── index.css                   # @import '@ice-ai/ui/theme.css' + @source ui 源码（docs/06 §2）
```

`vite.config.ts`：`/api` 代理 `127.0.0.1:9527`（**禁缓冲/压缩**，保 SSE）；生产由 server 托管静态产物（`get *`）。

---

## 4. 实施批次 F0–F5

批次间强依赖、批次内可并行；每批验收线 = `pnpm turbo run lint build test` 全绿 + 对应 Playwright 用例。

| 批次 | 内容 | 主要产出 | 粗估 |
|---|---|---|---|
| **F0 骨架** ✅ 已完成（2026-09-27） | `apps/web` 建包（Vite+RR7+Query+Tailwind v4+React Compiler）；client 双入口工程化（`./react` 子导出）；ui `theme.css` + primitives 首批（Button/IconButton/Popover/Textarea/Toast/ScrollArea，9 用例）；`MobileGate` 与 proxy；Playwright 冒烟 | 空壳三栏页 + `/api/health` 打通（冒烟通过） | 0.5 周 |
| **F1 对话 MVP** ✅ 已完成（2026-09-27） | client：http / agent+会话端点 / stream 四件套（fold/rebuild/group-trail/AgentStream）/ `use-agent-session`；ui：primitives 补齐 + chat 全册（MessageList/Composer/AssistantTurn/ToolRow/ThinkingRow/ProcessGroup/MarkdownView/EmptyState）；web：EmptyState cwd 输入 + `?s=` 刷新恢复 + 冷会话 resume（ADR-0013a） | **M1 验收线达成：浏览器完成一轮带工具调用的编程任务**（真机两轮验收 + Playwright 冒烟；client 14 用例含 fold/rebuild 等价性） | 1.5–2 周 |
| **F2 会话与项目** | client：sessions/search/projects/git/worktrees 端点 + view-models（project-groups/session-title/stats/chat-scroll-position/chat-lazy-load）+ queries；ui：sidebar 全册 + inspect 的 SessionListItem/FileTree；web：路由化多会话 + workspace-memory + tab-session + lease | 侧栏全功能、历史懒加载、worktree 切换/创建 | 2 周 |
| **F3 文件域** | client：files 端点 + files/ 模块；ui：files/ 全册（FileTabs/FileViewer/CodeViewer/ImagePreview/DiffView）；ChatInput 拖拽图片与 `@` 提及（file-fuzzy + file-index）；上传 | 右栏多标签查看器、代码高亮、diff、图片 | 1.5 周 |
| **F4 设置中心** | client：models/models-config/resources/resources 端点 + models/ 模块；ui：settings/ 全册 + ProjectTrustDialog + DirectoryPicker 接线；web：SettingsHost + settings-navigation | models 配置/发现/测试/可见范围、skills、plugins、信任 | 1.5 周 |
| **F5 对话增强与高级面板** | 斜杠命令、输入历史、引用回复、steer/followUp 队列条、compact、自动命名、导出、`TurnWrittenFiles`、MessageMinimap、panels/ 全册（BranchNavigator/ToolDefinitions/SessionInfoPanel+统计）、extension/ 全册、快捷键、页内通知+声音+浏览器 Notification、深色主题（若 §6-2 通过）、E2E 全量回归 | **一期验收线：§1 清单 − §5 排除项全部可用** | 2–2.5 周 |

依赖关系：F1 依赖 F0；F2/F3 依赖 F1（消息渲染与流）；F4 依赖 F0（可与 F2/F3 并行）；F5 依赖 F1–F4。
总量级 **9–10.5 周**（单人；A 类测试先行可显著降风险）。

---

## 5. 与 pi-web 的有意差异（防反复重建清单）

> 与 `docs/07` §8 的排除域一一对应；**不是缺口**，前端不得自行补回（补回须先推翻对应 ADR）。

| # | pi-web 功能 | pi-boat 一期 | 依据 |
|---|---|---|---|
| 1 | 终端页签（PTY / xterm） | ❌ 不做；右栏只有文件页签 | §8-3 |
| 2 | `!`/`!!` bash 直连输入 | ❌ 不做（后端无 `bash`/`abort_bash` 命令）；输入框对 `!` 前缀按普通文本处理 | §8-3 |
| 3 | 超长 bash 输出「加载更多」（`/bash-output`） | ❌ 不做；历史 `BashExecutionMessage` 正常渲染，超长截断即终态 | §8-3 |
| 4 | `/login`、provider OAuth/API Key 登录流 | ❌ 不做（无鉴权；凭据走 models.json） | §8-1/8-2 |
| 5 | PWA（manifest/SW/安装）、移动端布局 | ❌ 不做；<880px 门禁提示（docs/06 §9.1） | §8-5 |
| 6 | Web Push 订阅/后台通知 | ❌ 已删除；保留页内 Notification + 声音（页面存活期） | ADR-0016 |
| 7 | Provider 用量/余额面板 | ❌ 不做 | §8-2 |
| 8 | app-update 更新提示 | ❌ 不做 | §8-5 |
| 9 | 设置 agents 节（`AgentsConfig`） | ⏸ 延后（子代理整体延后，可由扩展提供） | §8-4 |
| 10 | 会话家族聚簇（`session-family`） | ⏸ 延后；子代理会话以普通会话呈现（带 `parentSession` 元数据） | §8-4 |
| 11 | DOCX 预览 | ❌ 后端不做转换；FileViewer 走文本回退 | docs/07 §9 |
| 12 | 扩展 UI `custom` method（自绘终端 UI） | ❌ 只做 9 个 method（ADR-0012）；`ExtensionWidgets` 的 custom 分支不移植 | ADR-0012 |
| 13 | 桌面目录选择（`piDesktop.selectDirectory`） | ❌ 二期；DirectoryPicker 走 `/api/cwd/browse` | M4 |
| 14 | i18n 三语 | 待决策（§6-1，倾向 zh-CN 单语） | — |
| 15 | 启动偏好（`defaultModel` 落盘） | 前端 localStorage 绕过（§6-4） | G2-11 |

---

## 6. 执行决策（已定案，ADR-0019）

| # | 议题 | 结论 | 否决的备选 |
|---|---|---|---|
| 1 | **i18n 范围** | ✅ zh-CN 单语：文案集中 `ui/src/locales/zh-cn.ts` 一处，不引 i18n 框架 | 引 pi-web registry 全量三语 |
| 2 | **深色主题时点** | ✅ 随 F5 交付（修订 docs/06「M1 不支持」的时点）：light/dark/system 三态，原型 dark token 即预留 | 维持「M2」，一期只亮色 |
| 3 | **ui 容器例外登记** | ✅ 登记 4 处（SessionSidebar/SettingsPanel/FileViewer/ExtensionWidgets）可依赖 client hooks；第二用途 = apps/desktop（M4） | 全部哑组件、props 由 web 装配 |
| 4 | **G2-11 绕过** | ✅ 前端 `startup-preferences.ts`（localStorage 记住上次 model/thinking/cwd）；core 落盘**不做**（G2-11 保持非阻塞缺口） | 一并补 core（`setDefaultModelAndProvider()`） |
| 5 | **URL 形态** | ✅ 单路由 `/` + `?s=<sessionId>`（对齐 pi-web searchParams 模式；设置/面板浮层不占路由） | `/session/:id` 路由化（与 tab-session 冗余） |
| 6 | **视觉基准** | ✅ 功能对齐 pi-web、视觉走本仓原型 v3（docs/06 既定）——「一样的页面功能」不含像素对齐 | 视觉也对齐 pi-web（须推翻原型 v3） |

---

## 7. 风险与坑（移植前必读）

- **React StrictMode 双挂载**：SSE effect 会先清理再重跑，「组件已挂载」ref 约束（docs/07 §7 事件/流 ★1）
- **不在第一个 `agent_end` 关流**：重试/压缩/扩展排队都可能延续同一逻辑轮次（docs/07 §7 ★2）
- **prompt 单调 run id**：迟到旧 run 的 SSE/轮询响应必须丢弃，否则复活陈旧流式气泡（docs/07 §7 ★3）
- **HTTP/1.1 同域 6 连接上限**：一页多会话多页签并发 SSE 会吃紧（docs/01 §8-7；一期 F2 后实测）
- **窗口化列表**：会话列表 54px 定高窗口化（`getSessionListIndices`），文件树同理；不窗口化几千会话会卡
- **模型域前端镜像**：`provider/*` 不覆盖嵌套 id、禁用最后模型 409、最小编辑不整表重写（ADR-0011 坑清单）
- **图片附件上限**：base64 进 `prompt.images`，与 `/api/files` 上传 25MB 是两条通道；移植 `image-attachments` 时核对其体积约束与本仓 protocol `ImagesSchema` 一致
- **Markdown 安全**：禁止裸 `dangerouslySetInnerHTML`，统一 react-markdown + rehype-sanitize（ADR-0009）；Mermaid/KaTeX 按需懒加载防首屏膨胀
- **折叠展开规则**：`userToggled` 标记不得被自动收起覆盖；分组只认消息序列不认 turn 事件（docs/05 §6.5 硬约束）
- **pi-web 快照漂移**：pi-web 0.9.x 仍在演进，移植期以本机快照为准，不追上游；后续想同步须逐模块 diff
- **导出长会话**：`exportFromFile` 疑似递归，5000+ 条目可能爆栈（docs/07 §9 未实测项）——前端下载侧无解，碰到再报

---

## 8. 与既有文档的关系

- 本文只管**范围、落位、排期、差异**；client 组件契约看 `docs/05`，ui 视觉与交互规格看 `docs/06`
- §6 六项已定案并落成 **ADR-0019**（索引已更新）；`docs/01` §7.1、`docs/06`（§1 例外登记 / §3 深色 / §11.3 行 4）、`docs/07`（G2-11 四处）已同步回写

> 本文与代码不一致时以代码为准并当天更新（AGENTS.md）。
