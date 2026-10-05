# 前端设计一致性清单（内部规范符合度 · 历史快照）

> ⚠️ **历史快照（2026-09-26）**：本文件记录当时的审查状态与待办，**不是当前状态**；
> 其中的勾选与「待改造」项可能已随一期交付落地（如 `SettingsRow` 等自造组件已删）。
> 现役口径以 `docs/06-ui-design.md`、ADR 与代码为准。

- 日期：2026-09-26
- 基准：统一 Web 设计规范（组件结构与视觉唯一真相）
- 受审：本仓 Web 前端（`apps/web`，`localhost:9528`；起点工作区 = `20acf30`）
- 依据：ADR-0020「视觉基准 = 统一设计规范，组件层结构与样式逐条对齐」
- 方法：CSS 选择器集合差集 → 死 CSS（零消费方）检测 → 同视口截图（1440 × light/dark + 设置态）→ 按 5 个视觉区域核对
- 取证产物：本地审计目录（`sel.mjs` / `dead.mjs` / `shoot.mjs` / `shots/*.png`）

---

> **范围边界（先看这条）**：本仓有意不做 6 类能力，标 ⛔ 的行**不得实现**。
> 移动端布局 / 终端 PTY / 登录鉴权 / Provider 用量面板 / 子代理（含会话家族聚簇）/ PWA 与推送。
> 依据：`docs/adr/0014`、`0019`、`0020`、`0021`。

---

## 0. 一句话结论

**CSS 已经基本到位，卡在「组件没用这些 CSS」这一步。**

> **2026 更新（ADR-0028）**：组件级 CSS 已按域拆到 `packages/ui/src/*/**.module.css`，
> 原 `styles/web-ui.css` / `styles/settings.css` 已不存在；**本文列出的「死 CSS」已全部删除**
> （早期曾停在 `*/unwired.css`，随后按「零消费即删」定案清空），需要时按设计规范口径重写。
> 下文的文件名与「缺 N 条」统计按当时的全局表快照记录，不再回填。

规则层差集基本归零：globals 缺 48 条（其中 31 条是排除域 + token 基础版式），settings.css 缺 12 条（全为 `.agents-*` 排除域）。
但 **3 个样式文件共 264 个类名里，有 115 个零消费方（43.6%）** —— 这些"类已备、组件未接"的规则，正是并排看"不像"的直接来源。

| 维度 | 状态 | 量化 |
|---|---|---|
| 颜色 / 字体 / 圆角 token | ✅ **已逐条对齐** | 5 套调色板取值与设计规范完全一致；`@theme inline` 已暴露设计规范类名 |
| CSS 规则层（选择器差集） | ✅ **基本归零** | `globals.css` 288→266，缺 48（31 = 排除域+token）；`settings.css` 190→178，缺 12（全 = `.agents-*`） |
| 死 CSS（零消费方） | ❌ **主要问题** | `web-ui.css` 52/126、`settings.css` 58/126、`utilities.css` 5/12 → **115/264 零消费** |
| 组件 DOM 结构 | ❌ **主要战场** | 外壳 ✓ 已对齐；**侧栏 7 条 P0、中栏 11 条 P0/P1、右栏 3 条 P0、设置 4 条 P0** 未做 |
| i18n | 🟡 **基建完成、未铺开** | 三语 616 key × 3 已就位；但全仓只有 **5 个文件** import `useI18n` |
| 硬 bug | ⚠️ 3 个 | 见 §1（1 个新发现 + 2 个收尾项） |

---

## 0.1 第二轮实施进度（2026-09-26，本次会话）

> 基线：上面 §0 的结论仍是「组件没接上 CSS」。本轮把 **阶段 0 / 阶段 1 / 阶段 6 做净**，
> 并把**阶段 2（侧栏）整体重排到规范结构**；阶段 3-5 只落了一部分。（改动状态以 git 为准）。

**已完成并按规范完全对齐**

- **阶段 0（硬 bug）**：T0-1（minimap 视口真实回传）/ T0-2（`aria-expanded` 用真实开合）/
 T0-3（删无 CSS 的 `config-badge` 分支）/ T0-4（关闭右栏复位展开态、全宽 `rightPanelFullWidth`
 时收起顶部面板、右栏顶行 `calc(36px+safe-area)` + `--bg-panel`）。
- **阶段 1（外壳/工具条）**：T1-1（文件面板开合按钮 36×36 + `borderLeft`）/ T1-2（空态也渲染工具条；
 `showChat = 会话 || 已选目录`）/ T1-3（顶部面板改 `position:fixed` 贴顶下拉 + `topPanelPos` 测量）/
 T1-4（去掉会话名与「思考中」；`ml-auto` 只给统计按钮）/ T1-5（cacheRead 环形箭头 + `pct% / window`
 + context 图标 + tooltip + 无统计时隐藏 + `formatCompact`/`costText` 口径）/ T1-6（生成标题三态
 naming/success/error + `hasMessages` 禁用）/ T1-7（分支页签按 `hasSessionBranches` 门控，改用规范的
 `BranchNavigator inline`）/ T1-8（工具条高度 `calc(36px+safe-area)` + `paddingTop` + 内联 `borderBottom`）/
 T1-9（全局快捷键改为 Esc 停止 + `Ctrl+Alt+N` 新建，端口径为 `registerAbortHandler`）/
 T1-10（`session-info-popover` 三列 key-value + 完全段复制 + 入场动画，替换自造 StatCard）/
 T1-12（历史图标 SVG 与 system/tools `title` 词条）。
- **阶段 2（侧栏，整体重排）**：T2-1（删「会话/文件」页签；文件树常驻会话列表下方 +
 `.sidebar-section-resize-handle` 竖向拖拽）/ T2-2（搜索改 32×32 图标按钮，搜索框条件渲染，
 打开搜索时隐藏 worktree 行）/ T2-3（`SessionSearch` 三段式 + `<mark>` + `role="status"` 计数，
 配套扩了协议与 core——见 ADR-0022）/ T2-4（独立 worktree/分支行 + 只读引导态）/
 T2-5+T2-6（EXPLORER 可折叠标题 + 26×26 `ToolbarIconButton` 图标行；终端按钮按排除域跳过）/
 T2-7（会话行 meta 三段语义 + 运行/未读指示器）/ T2-9+T2-10（项目下拉：筛选/对勾/活动徽标/
 「添加工作区…」+ `DirectoryPicker` portal 模态 520×620）/
 T2-11（文件搜索面板 150ms 防抖 + 变更文件区块）/ T2-12 部分（上传入口改为头部图标 +
 `openUploadPicker()` 命令式接口；进度/冲突三选一/树内蓝点未做）/ T2-13（hover 两个 32×32 图标按钮 +
 行内删除确认 + Shift 跳过；删「复制 id」）/ T2-14（新建按钮归位标题行右侧）/ T2-15（`PiBoat` 字标 +
 点击切显版本，带扰乱动画）/ T2-16（文件树行 `8+depth*14` / `height 24` / `gap 4` / `radius 4` /
 `var(--text)`；git 徽标 14×14 mono 11/600、untracked 绿、仅未 hover 显示；hover 行内「提及/下载」）/
 T2-17（transient 守卫、`title` tooltip、列表窗口化 = `getSessionListIndices`）/
 T2-18（Catppuccin 图标：沿用 32 个 SVG 到 `apps/web/public/icons/catppuccin/`，`mask` 单色 14px
 `--text-dim`，CSS 落入 `styles/web-ui.css`）。
- **阶段 6（面板/货架）**：T6-1（`SystemPromptPanel` 去 `PanelShell`，改用规范的
 `.system-prompt-panel/-scroll/-text/-empty` + `min(600px,75dvh)`）/ T6-2（单一 `.extension-status-shelf`
 + `has-widgets`/`has-status` + `sanitizeExtensionStatusLine` 排序 join + `AnsiText` + `role="status"` +
 `aria-label`）/ T6-3（货架移到 composer **之下**）/ T6-4（`ExtensionWidgets` 更新脉冲 diff +
 `is-updating` + 位置三角 SVG + panels 前移 + `AnsiText`）/ T6-5（并入 T1-3）。
- **阶段 3 部分**：T3-1（空态重写：32×32 应用图标 + `PiBoat` 22px/700 + 右侧 `web vX`/`pi vY` 版本块
〔2026-09-28 撤掉，见下方 T3-1 调整〕 +
 **直接复用 Composer** + 上/下 `flex-1` 居中偏下 + `paddingRight 52`；发送即建会话）/ T3-4 部分
 （工具行移到输入卡**下方**：`belowInput` 槽 + 左=模型/思考、右=工具预设/压缩/导出/统计/插队/声音）/
 T3-15（`BranchNavigator` 全量重写：导引线 + 7×7 三态圆点 + `U`/`A` 徽章 + `+N` 压缩）/
 T3-1 附属（无 `@ 提及` 通道：新增 `mention-bus`，文件树「提及」按钮 → Composer 草稿）。
- **阶段 7 部分**：T7-1 部分（侧栏/中栏新增代码全部走 `t()`；`useI18n` 消费方从 5 → 明显增加，未全量）。

**本轮新增的协议/后端增量**（ADR-0022）

- `SessionSearchResponse` → `{ results: SessionSearchHit[]; truncated }`（core `searchDetailed`
 产出 `entryId` + `before/match/after` 片段，上限 50）；`/api/health` 增 `piVersion`
 （core 从 SDK `VERSION` 取）；品牌与页面标题统一 `PiBoat`（回答 §7 Q1）。
- 空态版本块（2026-09-28 起改为侧栏品牌胶囊里的 `pi v0.87.1`）即由此得来，非手抄。

**仍未做（按优先级）**

1. **阶段 3 剩余**：C2 附件（粘贴/拖拽/压缩/整屏覆盖层）、C3 `ModelSelector`+`ProviderIcon`、
 C4 剩余（图标化 + 上弹面板 + 红色停止 + SVG 声音）、C5/T3-8 `ChatMinimap` 全量重写（CSS module 251 行）、
 C6 已完成、C10-C33（候选浮层双形态、输入历史浮层、用户气泡图片/hover 行、助手 cache W/cost、
 工具行 split diff、灯箱、katex/mermaid、`NoticeShelf` 左上角页内通知、phase 文案等）。
2. **阶段 4（右栏）**：F2 `MermaidBlock`、F3 md/HTML preview 三模式、F4 `FrontmatterCard`、
 ~~F5 语法高亮（已落地，ADR-0029）~~、F8 上传交互、F9 图片查看器、F10 音视频/PDF、F16 `@ 提及`、
 F17 每页签查看器状态、F18 diff 折叠、F20/F21/F22 收尾。
3. **阶段 5（设置）**：G1-G5（模型/Skills/扩展包三节套 `ConfigPanelShell + SplitView`、
 `EnabledModelsSection` 整块、目录选择器接线）、G6 选中文字浮窗、G7 控件层对齐、
 G8-G11（删自造 `SettingsRow`、补 `.config-detail` 内边距、盾牌色、导航记忆）。
4. **阶段 7 全量 i18n**：T7-2~T7-6（四个未改造节 + 侧栏/中栏/右栏域全量 `t()`、清自造类名）。
5. **⛔ 排除域**（不得实现）：移动端、终端 PTY、登录鉴权、Provider 用量、子代理/会话家族、PWA。
6. **待后端前置**：F6 live watch、F7 load-more 续拉、F19 DOCX 预览（Q5/Q6）。

**验证状态**：`pnpm turbo run lint typecheck test build` 全绿（24 tasks；core 190 / server 64 /
protocol 31 / client 83 / ui 16 / web 3 用例）。双实例 DOM 取证：品牌行、侧栏字标序列
（`PiBoat` / `New` / `~/…/pi-boat` / `main` / `Explorer` / `Models` / `Skills` / `Settings`）、
元素计数（`.file-panel-expand-button` / `.sidebar-section-resize-handle` / `.catppuccin-file-icon`）、
窗口标题 `pi-boat - PiBoat` 与规范一致。

---

## 0.2 第三轮实施进度（2026-09-26，参考实现 逐屏对拍）

> 基线：用户在并排对照 参考实现（`localhost:30141`）后报了 4 处「还是不一样」。本轮用
> **同视口双实例 DOM 取证**（同一会话 id、同一文件、同一设置节）逐处定位，改掉 2 处、
> 存证 2 处。取证脚本不入库（临时目录）。

**已修**

- **侧栏「莫名其妙的加载中会话」（P0·真 bug）**：`runningSessionIds()`（今名 `runningSessions()`，ADR-0026）返回的是**全部常驻注册表**
  （含 idle 未被回收的会话），前端据此给它们渲染无限转圈。对齐 参考实现 `getRunningRpcSessionIds()`：
  只有「流 / 提示 / 压缩」在跑才算 running；常驻但 idle 不再算。改名配套：`isRunning()` → `isResident()`
  （它的语义确实是「在注册表里」，旧名字是这次误判的源头，AGENTS.md「命名不得暗示做不到的事」）、
  新增 `residentSessionIds()` 供 idle 回收遍历。顺手删掉 `SessionReadServiceOptions.isRunning`
  （零消费方的期权，AGENTS.md 规则）。取证：修前侧栏前 3 行有 2 个转圈 span，修后 0 个，全部回落成
  `x minutes ago` / `N msgs`。
- **右栏文件查看器抬头（原「文件浏览头部分」）**：`packages/ui/src/files/file-viewer.tsx` 抬头重排成
  参考实现 同形——`.file-viewer-shell` + `.file-viewer-toolbar`（`padding 5px 12px / gap 8 / 11px /
  var(--bg)`）+ `路径` + **`语言 · N lines · 体积`** + `.file-viewer-live-indicator`（恒灰＝未监听，
  不假装已同步）+ **仅有 git 改动时**才出现的内容/diff 切换 + 动作行（提及 / 折行 / 下载）全部走
  `.file-viewer-icon-button` 的 24×24。修前「折行」是 32×24 文字按钮、meta 只有体积、切换恒在。
  配套：`use-file-content` 在 diff 模式也取一次文本（只为数行，不渲染），三语补 `files.viewSource /
  files.viewDiff / files.openInNewTab`。取证：`json · 45 lines · 6.6 KB` 与 参考实现 逐字同形。

**已定位、未修（按本轮取证结论排队）**

1. **中栏「对话框」（阶段 3 剩余）**：与 参考实现 `ChatInput` 的结构差是**整块**的——pi-boat 缺附件按钮
   （图片通道 core/server 已通：`prompt.images`）、缺模型选择器（`set_model` 命令早在 core，但 client
   未导出 + web 无 `ModelSelector`/`ProviderIcon` 组件，即 checklist C3）、思考档位与工具预设是**原生
   `<select>`**（参考实现 是按钮 + 上弹面板，C4）、缺声音开关与红色停止、多出 `自动命名/导出/统计/插队`
   四个文字按钮（前三个 参考实现 在顶部工具条，插队是 参考实现 的「流式中 Steer/FollowUp 按钮」形态）。
2. **设置三个标签页（阶段 5 = G1-G5）**：`Models/Skills/Plugins` 三节仍是
   `div.flex.flex-col.gap-8 > section > SettingsSectionTitle(已标记 deprecated)` 的自造结构 + 硬编码中文，
   而 参考实现 三节都是 `ConfigPanelShell(embedded) > ConfigSplitView[ConfigSidebar + ConfigDetail]`
   + `ConfigFooter`。**CSS 与 `settings-ui.tsx` 的 Config* 原语本仓都齐**，缺的是组件接线。

**环境修复（非代码）**：`.turbo/cache` 里曾缓存进一份**损坏的**
`packages/client/dist/endpoints/sessions.d.ts`（内容是 tar 包），任何 `pnpm turbo run build/typecheck`
都会被回放覆盖成坏文件、报 `TS1127 Invalid character`。已 `rm -rf .turbo/cache` 并重建；复现时先删缓存。

---

## 0.3 第四轮实施进度（2026-09-26，参考实现逐屏对拍）

> 完整清单与取证在 `docs/10-frontend-parity-audit.md`（第四轮报告入库版）。本节只记**已完成**的部分，
> 任务编号用第四轮的 T 编号（与本文 T5-x 编号不同名，切勿混用）。

**阶段 0：硬 bug（全部完成）**

- **T0-1 / BUG-1（auto-name 运行时 100% 失败）**：`session-read-service.ts` 的模型选取抽成可测的
  `resolveAutoNameModel()`，补上「settings 默认模型查不到 → 回退目录第一个」的回退链（旧写法**只在
  provider/modelId 缺失时回退**，模型改名后 `getModel()` 返回 undefined 就直接抛错）。
  settings.json 与 pi CLI/参考实现 共享，SDK 升级改过 id（`deepseek-v4-flash` → `deepseek-flash`）是常见诱因。
- **T0-6 / BUG-1d（双重落盘）**：core 的 `autoName()` 改为**只生成不落盘**；写盘归 server 路由一处
  （resident → `set_session_name` 命令通道，冷会话 → `rename`）；client 侧重复的 `setAgentSessionName` 调用删除。
- **T0-2 / BUG-2（有项目无会话时中栏退化）**：`workspace-layout.tsx` 按 参考实现 `effectiveNewSessionCwd`
  给 `preferredCwd` 加项目根回退 → 空态恢复品牌行 + 工具条 + 完整 Composer（同时修好了空态发消息用错 cwd）。
- **T0-3 / BUG-3（设置节标签硬编码英文）**：4 个节标签 + 面板标题 + 关闭键改走 `t()`；
  `projectHint` 也走 `settings.projectRequired`。
- **T0-5 / BUG-4（不可达的 `settings-general-error` 节点）**：删掉 `hintFor` 分支（对齐 参考实现：
  禁用节只给 `title`，不渲染提示行）。
- **T0-4 / BUG-1b·1c（生成标题三态永不复位）**：`chat-pane.tsx` 补 1800ms / 5000ms 定时器 + 切会话复位
  + unmount 清理（对齐 参考实现 `AppShell`）；composer 工具行那份按钮改接完整三态 + `hasMessages`。

验证：`core` 194 / `server` 66 / 全包 `typecheck` 全绿；新增 core 单测钉住回退链，
server 新增「冷会话走 rename / resident 走命令通道」两条。

**阶段 1：设置中心（已做控件层与判定，三节套壳未做）**

- **T1-1 / G7**：三节的 `primitives/button` 全部换成 `ConfigButton`（`-primary`/`-secondary`/`-danger`/`-small`/`-default`
  因此变为活类）；删除零消费且未导出的 `primitives/switch.tsx`；`primitives/input.tsx` 改 12px / h30 / px9。
- **T1-9 / G10**：`ProjectTrustDialog` 盾牌色 `#d97706` → `#f59e0b`。
- **T1-11**：节内小标题改走规范类 `.config-section-title`（11px/600/uppercase/`--text-dim`）。
- **T1-8 / K4·K5**：没有真实项目 cwd 时 `skills`/`plugins` 两节禁用（改为 `projectRoot === null`，
  不再退到家目录），且停在禁用节时自动回退「常规」。

**阶段 2：对话框/Composer（全部完成，除 T2-11 的部分项）**

- **T2-1** 新建 `packages/ui/src/chat/model-selector.tsx`（设计规范 `ModelSelector` 整体移植，去掉移动端分支）：
  芯片 SVG + 友好名 + 按 provider 分组的上弹面板 + >8 条的筛选框。client 补 `setModel`（`set_model` 命令）。
  ⛔ 未引入 `ProviderIcon` 的 43 条映射（它只服务设置页 provider 树，核实后不属 composer）。
- **T2-2** 新建 `apps/web/src/services/use-attached-images.ts`（设计规范 `lib/image-attachments.ts` 移植：
  >1MB 非 GIF → canvas 缩到最长边 1024 / JPEG 0.85）+ Composer 的 56×56 缩略图与右上角移除 +
  隐藏 file input + 粘贴 + 整屏拖拽覆盖层（三圈涟漪，关键帧已在 `web-ui.css`）。client 的
  `prompt`/`steer`/`follow_up` 补 `images` 通道（protocol 本就有 `ImagesSchema`）。
  ⚠️ 有意偏差：protocol 的 `message` 是 `min(1)`（有单测钉住），所以「只发图不写字」仍被拒（设计规范允许），
  放宽需单独决策。
- **T2-3** 卡内流式双按钮 Steer（黄）/ Follow-Up（靖蓝），删掉常驻「插队」toggle。
- **T2-4** 删卡内黄色停止，工具行末端补红 `#ef4444` 停止；流式中输入卡描边转 `rgba(234,179,8,0.4)`。
- **T2-5** 删工具行的 `自动命名/导出/统计`（实测顶栏已有「生成标题 / 会话信息」，无功能丢失）。
- **T2-6** 新建 `packages/ui/src/chat/tool-preset-menu.tsx`（原 `composer-menus.tsx`，2026-09-28 更名）：
  工具预设改自定义按钮 + 上弹面板（勾选 SVG + 译文描述）
  （思考档位分段已并进 `ModelSelector` 的二级菜单，见 §0.5）；工具预设标签直接用 protocol 的
  `TOOL_PRESETS` 值，不再手写中文。
  - 补充（2026-09-30）：当前工具集反查不上任何一项预设时（settings 改过 / 扩展塞进工具，
    如 web-access 的 `web_enable`），标签回落 `t('chat.customToolPreset')`（「自定义」）——
    此前回落空串，按钮只剩一枚扳手图标（用户报「模式为空」）。预设命中时仍显示 `TOOL_PRESETS` 值。
- **T2-7** 声音改 SVG 两态（开/静音）。
- **T2-8** 占位符三态（`steerPlaceholder`/`agentPlaceholder`/`messagePlaceholder`）走 `t()`。
- **T2-9** 新建输入历史浮层（30px 头 + 时钟 SVG + 序号 + 2 行截断 + active `--bg-selected`）；
  `↑` 在空输入上拉起，`use-input-history` 因此瘦到只留 `{ history, remember }`。
- **T2-10** 发送按钮换设计规范的内联右箭头 SVG；右区 `gap: 2`；工具行补 `flex: 1` spacer。
- **T2-12** 排队条头改 `t('chat.queued', {count})` + 「移回输入框」带 SVG；行改胶囊标签
  （steer 带 accent 描边）+ 单行省略。
- **T2-13** 删 `chat-pane` 的 `pb-4` 与双层 16px 包装 div；Composer 外层改 `fieldset`
  `padding: 0 16px 8px` + `paddingRight: 52`（避让 minimap），与设计规范逐字一致。
- **T2-11** 候选浮层补头部（计数 + `Tab / Enter`）与 `@` 行图标；`/` 改按来源分组 + 网格卡片
  （`variant="grid"`：sticky 分组头带计数 + `repeat(auto-fit, minmax(220px, 1fr))`，卡片 58px 高、
  active 换 accent 描边；`@` 仍走 `list` 形态）；结构由 `packages/ui/test/suggestion-menu.test.tsx` 锁住。

**取证（非截图，文字断言）**：双实例同视口下实测——卡 `border-radius:14px` / `padding:10px 10px 10px 14px`；
`fieldset` `padding: 0px 52px 8px 16px`；工具行结构为
`[附加图片][模型选择器 "DeepSeek V4 Pro"] ─ spacer ─ [思考 high][预设 configured][压缩][声音]`，
**不含** `自动命名/导出/统计/插队`；流式时卡描边 `rgba(234,179,8,0.4)`、工具行末端红停止
（`#ef4444` / bg `rgba(239,68,68,0.08)`）、引导/后续按钮出现在卡内；附件缩略图 56×56。

- **E2E**：`apps/web/e2e/smoke.spec.ts` 的断言字符串（「输入一个工作目录」/「连接正常」）早已随前几轮重构失效，
  本次一并改为锁与本地状态无关的结构（侧栏设置入口 / `.chat-content` / `files.noneOpen`），并固定 `zh-CN`。

---

**明确未做（原因写在括号里，需下一轮）**：T1-2/3/4/5（模型/Skills/扩展包三节套
`ConfigPanelShell + ConfigSplitView + ConfigFooter`；**前置缺口**：参考实现 的三节详情依赖
本仓 protocol/core 还没有的数据形状——`EnabledModelsView` 的 per-provider `enabledCount`/`thinkingPin`/
`stalePatterns`、skills 的 `filePath`/`install`/版本、plugins 的 per-package 详情——照搬会只能造假数据）；
T1-6（「选中文字浮窗」开关**无消费方**：参考实现 的开关背后是 `ChatWindow` 整块 quote-selection 特性，
本仓未做；先加开关会违反 AGENTS「零调用方的期权直接删」）；T1-7（删自造 `SettingsRow` 等，必须与套壳同批）；
T1-10（三节 i18n，与套壳同批，避免写两遍）。

---

## 0.4 会话链路修复（2026-09-26，用户点名「点击发送之后消息没发出去」）

四个独立缺陷叠在一起，现象都是「消息没发出去 / 界面没反应」。均已修复，并用真实 server + 浏览器回归。

- **A. 空态首条消息静默丢失**：`chat-pane.tsx` 的 `handleSubmit` 在 `startSession()` 之后调用**同一个
  render 闭包里的** `session.send`——那个闭包里的 `sessionId` 还是 `null`，`send` 直接早退，消息不会发出。
  修：`use-agent-session.ts` 用 `sessionIdRef` 作为「此刻的会话」唯一来源（`switchSession()` 同步 ref + state），
  `send`/`abort`/`steer`/`followUp` 一律读 ref。
- **B. 中栏自毁**：`start()` 提交 sessionId 的那帧 `?s=` 还是旧的，effect ① 把「刚建好的会话」读成
  「URL 切到了无会话」而 `reset()`，中栏退回占位、composer 消失，URL 停在 `?s=<新id>`（顺带一次
  `GET /api/sessions/:id` 404）。修：对账只留一处（`session-nav.ts` 的 `decideSessionNav`），
  URL 发起的切换以 URL 为准、本组件发起的切换才补 URL。
- **B'（同日回归并修回）会话互切**：B 的第一版仍把「URL→会话」「会话→URL」拆在两个 effect 里，
  且删掉了旧实现里防反向覆盖的 `selfNavigationRef`——用户点会话 B 时 state 还是 A，「会话→URL」
  把 URL 写回 A，`open(B)` 完成又写回 B，再 `open(A)`……**两个会话无限互切**（每秒一组
  `open` + `get_commands/get_tools/get_session_stats`）。修：合成单一 effect + `decideSessionNav()`，
  方向由 `selfSwitchRef` 显式标出；回归用例见 `apps/web/src/panes/session-nav.test.ts`（7 条），
  并用浏览器实测「点 B / 点 C / 前进 / 后退」各只跑一次 `open`。
- **C. 订阅前派发 → 整轮不渲染**：命令发得比 SSE 订阅早时，服务端那条 user `message_start`
  （`fold` 建 Turn 的锚点）收不到，assistant 的流式全落在「无锚点」上被丢弃——消息发出去了，界面什么都没有。
  修：`AgentStream.waitUntilReady()`（等 `connected` 帧，2s 上限兜底），`send`/`steer`/`followUp` 派发前必等。
- **D. 会话被回收 / server 重启后不自愈**：`renewAgentLease` 走 `postCommand`，而该端点回的是扁平
  `{success, renewed}`（无 `data`）→ 返回值恒为 `undefined`，ADR-0013 约定的「`renewed:false` → 显式 resume」
  从来没生效过；表现为 `POST /api/agent/:id` 一直 404、`session_shutdown` 后 composer 永久禁用。
  修：① 端点改读扁平字段；② `dispatchWithRevive`——命令 404 时先 revive（resume + 重建历史 + 重置水位线）
  再重发一次；③ `session_shutdown`（terminated）立即 revive；④ lease 心跳 `renewed:false` 兜底。
  注意 revive 不能只 `resume`：新 Entry 的 seq 从 1 重新计数，必须同时 `restore()` 重置客户端水位线。

验证：手写 Playwright 脚本跑通四条路径（空态发送 / 既有会话追问 / 「新建会话」后发送 /
`touch server` 重启后发送）；新增单测 `packages/client/test/stream.test.ts`（waitUntilReady ×4）与
`packages/client/test/session-revive.test.ts`（revive 重发 ×3）；`test + lint + build` 全绿。

---

## 0.5 第五轮实施进度（2026-09-28，composer 区对齐原型 v3「玻璃」）

> 基准换到 `docs/design/piboat-ui-redesign-v3.html`（与 `efee687` 起的「玻璃 Glass」色板同一份原型）。
> 本轮只动**对话框区域**（原型 §8）：一张玻璃卡 + 卡内控件条 + 卡下指标行 + 卡上排队条。

- **输入卡合并为一张**：`Composer` 从「卡片（输入 + 发送动作）+ 卡下工具行」改为原型 `.inputcard`
  ——20px 圆角玻璃卡（玻璃放 `::before`，卡内上弹菜单才保留自己的毛玻璃），卡内只有两段
  （输入区 `min-height:56px` / 控件条 `.card-foot`）；附件缩略图从卡上方移进卡内顶部。
  槽位随之改名：`belowInput`（卡内左簇）→ `cardFoot`，`belowInput` 保留给卡下的一行。
- **动作进控件条**：停止 / 引导 / 后续消息 / 发送 都移到 `.card-foot` 的右端（`Composer` 自己渲染），
  键盘 `↵` = 引导（运行中）/ 发送（空闲）、`⌘/Ctrl+↵` = 后续消息——与按钮上的 kbd 提示一致
  （此前运行中 `↵` 走的是普通 `prompt`）。禁用态 = 透明底 + 发丝描边。
- **模型 + 推理等级合并成一个控件**：`ModelSelector` 收起态 `[芯片] 模型 id [等级胶囊] ⌄`，
  展开后是二级菜单（根页「模型 / 推理等级」两行 → 各自列表 + 返回）；等级描述 key 随之迁入。
- **`composer-menus.tsx` → `tool-preset-menu.tsx`**（`ComposerMenus` → `ToolPresetMenu`）：
  思考档位移出后只剩工具预设一段，文件与组件名按剩余职责命名。
- **指标行并入底部**：顶栏的会话统计按钮删掉，改由新的 `ComposerMetrics` 渲染在输入卡**下方**
  （`↑ in ↓ out ⟳ cache read │ cost │ ◐ pct / window` + 上弹「会话信息」面板，面板从指标行向上弹）。
  行**居中**（2026-09-28 用户指定；原型是右对齐）。T1-5 的读数口径（`formatCompact` / cost / context
  三档配色）原样迁移，顶栏从此只剩会话级入口。
  ⚠️ 金额是 **USD 本地估算**：SDK 用模型目录里的费率（USD/1M token）乘 token 数算出，本仓不换汇（见下文）。
- **排队条对齐原型 `.queue`**：头行 11.5px/650 `--text-muted`（不再是等宽大写）+ 「移回输入框」走 `.cbar`；
  行内标签改**语义底色胶囊**（引导 = amber、后续消息 = accent）+ 顶部发丝线，文案走 `t('chat.steer')` /
  `t('chat.followUp')`（此前直接渲染 `steer` / `follow-up` 字面量）。
  ⚠️ 原型行尾的「单条 ✕」不做：协议只有 `clear_queue`（整队清空），单条删除需要新增端点。
- 验证：原型单文件对照截图（排队条 / 运行中 / 空闲三态 + 模型二级菜单）+ 真实会话页截图；
  `typecheck + lint + test + build` 全绿。i18n 新增三语 key：`chat.modelLabel` / `chat.reasoningLabel` / `chat.back`。

### 0.5b 后续修订（2026-09-28）

- **kbd 提示常显**（**有意偏离**原型 `:has(.ta:not(:placeholder-shown)) .send kbd`；`docs/06` §8.6）：
  输入框有文本时只去禁用态，`↵` / `⌘↵` 提示不消失。
- **停止按钮真的能停**：core 的**即时命令**（中断 `abort / steer / follow_up / clear_queue /
abort_compaction`、应答 `extension_ui_response`、只读 `get_state` 等）改为**不排同会话命令队列**
  （`docs/03` §6.1）——旧行为下「停止」要等本轮自然结束才生效，连点还会各挂一条浏览器连接
  （同源 6 条占满 → 所有接口 pending）；扩展对话框的应答会死锁到 5 分钟超时。client 侧的
  `abort` 另加了在途去重。

---

## 1. 必须先修的硬 bug

### BUG-1【P1·新发现】ChatMinimap 的视口高亮是死的
- `apps/web/src/panes/chat-pane.tsx` → `buildMinimapBars(chat.turns, 0, 1, 1)` —— 后三个参数**硬编码**。
- `packages/client/src/view-models/minimap.ts`：`scrollHeight=1` 时 `ratio = turnCount`，`activeRange` 恒返回 `{0, turnCount}` → **每条 bar 的 `active` 恒为 `true`**，全部渲染成 accent 高亮态，且**滚动时永不变化**。
- 后果：minimap 看起来"全亮"，用户无法从它判断当前视口在哪；`scrollTopForBar` 的点击定位也失去参照。
- 修：把 `MessageList` 的 `scrollTop / clientHeight / scrollHeight` 回传（或把 minimap 移入滚动容器）后替换硬编码参数。

### BUG-2【P2】右栏隐藏按钮的 `aria-expanded` 硬编码为 `false`
- `apps/web/src/panes/files-pane.tsx`：`aria-expanded={false}` 写死。规范是 `aria-expanded={rightPanelOpen}`。
- 后果：屏幕阅读器永远认为右栏未展开。
- 修：改用真实 `rightPanelOpen` 值。

### BUG-3【P2】`.config-badge` 渲染了一个不存在的类
- `packages/ui/src/settings/settings-panel.tsx` 渲染 `className="config-badge"`，而 `packages/ui/src/styles/settings.css` **没有 `.config-badge` 规则**（规范也无此概念）。
- 后果：宿主一旦传 `badge` 就会渲染出一个无样式裸文本。
- 修：删掉 badge 分支（当前无宿主传值）。

> **此前的三个硬 bug 已修复并复核**：BUG-1（`chat-scroll-to-bottom` 补 `is-visible`）✅、BUG-2（门禁死代码 + `MobileGate` 已删净）✅、BUG-3（右栏可关：`.file-panel-expand-button` + 真实 `rightPanelExpanded`）✅ —— 仅遗留 §6 T0-3 的 3 处细节。

---

## 2. 页面 / 路由层对照

| 设计规范 | pi-boat | 判定 |
|---|---|---|
| `/` → → `<AppShell/>` | `/` → `router.tsx` 单路由 → `<WorkspacePage/>` → `<WorkspaceLayout/>` | ✅ 结构等价 |
| `/login` | — | ✅ 有意删除 |
| `/api/*` 53 个 route handler | `packages/server` Hono 56 端点 | ✅ 后端形态不同（ADR-0004），前端不关心 |

**页面层没有缺口。差异 100% 在组件层。**

---

## 3. 范围边界（已定案，标 ⛔ 不得实现）

| # | 项 | 结论 | 连带项 |
|---|---|---|---|
| 1 | 移动端布局 / `useIsMobile` / 移动工具条 / `MobileGate` | ⛔ **不做** | `useViewportHeight`、`@media(pointer:coarse)`、iOS standalone 块、设置里窄屏形态 |
| 2 | 终端 PTY / xterm / `TerminalPanel` | ⛔ **不做** | 侧栏 EXPLORER 的终端按钮、TabBar 的 terminal 图标、`!`/`!!` bash 模式提示条、`bash-output`。**但保留 `BashExecutionMessage` 的历史渲染** |
| 3 | 登录 / 鉴权 / `/login` / `web-login-*` | ⛔ **不做** | 设置里的「登出」项、「Shell(Windows)」PowerShell 节 |
| 4 | Provider 用量（余额）面板 | ⛔ **不做** | `.providerUsage.*` 7 个 i18n key（语言包已扣除） |
| 5 | 子代理：`AgentsConfig` / `session-family` / `AgentSessionPanel` | ⛔ **不做** | 设置节数**保持 4 个**、会话**平铺即终态**、工具条**不加子代理页签**、不补 12 条 `.agents-*` CSS、`SettingsSectionIcon` 不加 `is-agent` 分支 |
| 6 | PWA / web push / 设置里的推送节 | ⛔ **不做** | `PwaRegistration` |

**回归检查（交付前必跑，当前结论：均未实现 ✅）**

```bash
cd <repo>
grep -rIl "MobileGate\|agents-section\|session-family\|AgentSessionPanel\|provider-usage\|node-pty" packages/*/src apps/web/src
# 应为零命中（唯一命中 xterm 的是注释）
```

---

## 4. 样式层对照（三层）

### 4.1 Token 层 ✅ 无需改动
`packages/ui/src/theme.css` 与设计规范 逐条一致：`--bg/-bg-panel/-bg-hover/-bg-selected/-border/-text/-text-muted/-text-dim/-accent/-accent-hover/-accent-contrast/-user-bg/-assistant-bg/-tool-bg/-bg-subtle/-chat-content-max-width/-chat-content-font-size` × 5 套调色板（light/dark/mist/rose/pine）。
`apps/web/src/index.css` 的 `*` / `html,body` / `pre,code` 三段与设计规范完全一致。字体 `@fontsource-variable/noto-sans-mono` 同字体同轴。✅

### 4.2 CSS 规则层：差集已基本归零 ✅

**`globals.css` → `styles/web-ui.css`：288 → 266，缺 48 条**

| 缺失内容 | 条数 | 判定 |
|---|---|---|
| `.terminal-*` / `.terminal-xterm*` | 17 | ⛔ 排除域 |
| `.web-login-*` / `html.dark .web-login-error` | 14 | ⛔ 排除域 |
| `:root` / `html` / `*` / 5 个 `[data-theme]` / `html.dark` / `html[data-theme="pine"]` | 11 | ✅ 已落在 `theme.css` + `index.css` |
| `html.dark .catppuccin-file-icon` | 1 | ❌ 随 T4-10 一起补（当前零消费） |
| **合计 48** | | **无真缺口**（除 catppuccin 1 条随组件走） |

**`settings.css` → `styles/settings.css`：190 → 178，缺 12 条**，全部是 `.agents-*`（`.agents-concurrency-control` / `.agents-feature-*` / `.agents-overridden-label` / `.agents-system-prompt*`）→ ⛔ **排除域，确认不补**。

> **结论**：此前报告里"真缺口"的 `.mermaid-block*` / `.mermaid-zoom-*` / `.katex*`（共 23 条）**已经在 `styles/web-ui.css` 补回**（T7-11 部分完成）。现在规则层的欠账只剩「组件没接上」。

### 4.3 死 CSS（零消费方）—— 本文最重要的发现 ⚠️

`styles/` 三个文件共 **264 个类名，115 个零消费方（43.6%）**。下列规则**都已收录、但没有任何组件使用对应类名**：

**（a）规范侧有对应组件、本仓整块缺失 → 真缺口，必须接上**

| 死 CSS | 位置 | 本应消费它的组件 | 对应任务 |
|---|---|---|---|
| `.mermaid-block` / `-loading` / `-error` / `.mermaid-preview-button` / `.mermaid-zoom-*`（14 条） | `web-ui.css` | （329 行，**不存在**） | T4-1 |
| `.katex` / `.katex-display` | `web-ui.css` | markdown 公式（**无 `remark-math`**） | T3-15 |
| `.image-preview-dialog` / `-image` / `-close` | `web-ui.css` | 灯箱（本仓的同名件是右栏风格，**不是 dialog**） | T3-10 |
| `.notice-shelf-item`（+ `@keyframes notice-shelf-in/out`） | `web-ui.css` | `NoticeShelf`（**不存在**，仍是底部 toast） | T3-14 |
| `.markdown-frontmatter*`（7 条） | `web-ui.css` | （**不存在**） | T4-3 |
| `.compaction-file-*` / `.markdown-compaction-message` / `.markdown-custom-message` | `web-ui.css` | 压缩结果卡片（**不存在**） | T7-11 尾 |
| `.extension-widget-update-pulse` / `.is-updating` / `.extension-widget-placement(-icon)` | `web-ui.css` | 更新脉冲 + 位置三角（**未接**） | T6-6 |
| `.has-widgets` / `.has-status` | `web-ui.css` | 扩展货架单一 shelf（**组件从不加这两个类**） | T6-5 |
| `.file-viewer-live-indicator` / `.file-viewer-load-more` | `web-ui.css` | FileViewer live watch / 续拉（**未接**） | T4-5 / T4-6 |
| `.directory-picker-backdrop/-panel/-list/-footer/-entry/-path/-back/-action` | `web-ui.css` | `DirectoryPicker` portal 模态（本仓是内嵌行、**且无宿主调用**） | T5-11 |
| `.catppuccin-file-icon` | `web-ui.css` | （本仓用 lucide；**`apps/web/public/` 目录不存在**） | T4-10 |
| `.sidebar-section-resize-handle` | `web-ui.css` | 侧栏会话区/EXPLORER 之间的拖拽手柄（**无消费者**） | T2-1 |
| `@keyframes drop-zone-in` / `drop-ripple` | `web-ui.css` | 整屏拖拽上传覆盖层（**不存在**） | T3-3 |
| `.linenumber` | `web-ui.css` | 源码行号（`react-syntax-highlighter` 的行号类） | T4-4 |
| `.contains-task-list` / `.task-list-item` | `web-ui.css` | markdown 任务列表 | T3-15 |
| `.markdown-file-preview` / `.chat-stats-center` | `web-ui.css` | 文件预览 markdown 容器 / 统计区 | T4-2 |

**（b）`settings.css` 里 58 条零消费 —— 全部源于「三个节没套 `SettingsUi` 的 SplitView 壳」**

| 死 CSS | 条数 | 本应消费它的组件 | 对应任务 |
|---|---|---|---|
| `.enabled-models-*`（banner / filter / row / pin / count / empty / error / title …） | 19 | （**整块缺失**） | T5-5 / G8 |
| `.config-button-primary/-secondary/-danger/-ghost/-default/-small/-success-icon` | 7 | `ConfigButton` 的完整变体。**2026-09-26 更正**：`-ghost`/`-small` 早已由 `settings-ui.tsx` 的模板串运行时拼出；`-primary`/`-secondary`/`-danger`/`-default` 也已在 T1-1 后由三节消费。**唯一仍为零消费的是 `-success-icon`**（保存成功勾，随模型节套壳补） | T5-10 |
| `.config-sidebar-group` | 1 | 规范侧由 `SkillsConfig.tsx`、`PluginsConfig.tsx` 消费（分组容器）；本仓漏列，随后续套壳接线 | T1-4/T1-5 |
| `.skill-detail-heading` / `.skill-version-row` / `.skill-source-link(-text)` / `.skill-update-status` / `.skill-update-indicator` / `.skill-name-value` / `.skill-version-value` / `.skill-description` | 9 | 详情面板（本仓是单列三块） | T5-6 / G9 |
| `.models-sidebar-add-item` / `.models-sidebar-badge` / `.models-sidebar-indented-item` | 3 | provider 树 | T5-5 / G7 |
| `.settings-shell-option` / `.settings-general-description` | 2 | 规范的设置行（本仓用自造 `SettingsRow`） | T5-10 / G14 |
| `.config-scope-tag` / `.config-detail-path` / `.config-sidebar-message` / `.config-trust-notice` | 4 | `ConfigPanelShell` 的槽位（本仓未套壳） | T5-5 / G7 / G10 |
| 状态修饰类 `.is-success` / `.is-checking` / `.is-error` / `.is-empty` / `.is-fill` / `.is-grow` / `.is-muted` / `.is-project` / `.is-pushed-right` / `.is-top-aligned` / `.is-update` / `.is-full-height` | 12 | 各 SplitView 组件 | 随 T5-5/6/7 自然接线 |
| `.is-agent` | 1 | ⛔ 排除域，**不补** | — |

**（c）`utilities.css` 5 条自造类零消费**：`.hairline-l` / `.hairline-r` / `.hairline-t` / `.elev-soft` / `.elev-soft-sm`
→ 其中 `.hairline-b` 仍在被广泛使用（**自造类名污染**，见 4.4）。

### 4.4 自造类名污染（不在设计规范词汇表内）

| 自造类 | 出现处（示例） | 整改口径 |
|---|---|---|
| `hairline-b` / `border-line-1` | `settings-panel.tsx`、`panel-shell.tsx`、`chat-pane.tsx` | 换内联 `borderBottom: '1px solid var(--border)'` |
| `text-fg` / `text-fg-muted` / `text-fg-faint` / `text-text-dim` 混用 | `settings-panel.tsx`、`session-row.tsx` | 统一设计规范名：`text-text` / `text-text-muted` / `text-text-dim` |
| `bg-surface-side` / `bg-surface-raised` / `bg-line-2` / `bg-line-3` / `bg-warn-soft` / `bg-danger-soft` / `bg-success-soft` / `bg-accent-weak` | 多处 | 换 `--bg` / `--bg-panel` / `--bg-hover` / `--bg-selected` / `--border` |
| `sq`（`border-radius:6px`） | 多处 | 换显式 5px / 6px 圆角 |
| `elev-panel` / `elev-soft` | `primitives/toast.tsx` 等 | 换内联 `boxShadow` |
| 自造复合组件 `SettingsRow` / `SettingsSectionTitle` / `SettingsNotice` | `settings-panel.tsx`，被 5 处消费 | 删掉，改 `ConfigField`（规范）或 `.settings-shell-option` |

---

## 5. 组件层差异矩阵

> 等级：**P0** = 结构或信息架构不同 / 整块缺失（一眼不像）｜**P1** = 布局或交互不同（并排看得出）｜**P2** = 视觉细节（间距/字号/圆角/颜色/hover）

### 5.1 外壳 / 布局 / 中栏工具条 —— 已对齐 ✓，剩 10 条

| # | 差异 | 目标形态 | 当前实现 | 等级 |
|---|---|---|---|---|
| S1 | **工具条缺「文件面板开合」按钮** |（36×36、`borderLeft`） | 完全没有（`chat-pane.tsx`） | **P0** |
| S2 | **空态不渲染工具条** | `showChat` 在"已选目录的新会话"为 true，页签 disabled | `sessionId===null` 直接 `return <EmptyState/>`（`chat-pane.tsx`） | **P0** |
| S3 | **面板挂载形态** | `position:fixed` 贴顶下拉、`zIndex:500` | `PanelShell` 文档流内整宽 + 自备 header + `maxHeight:min(600px,60dvh)`，把消息区往下推（`panel-shell.tsx`） | **P0** |
| S4 | 页签整组被 `ml-auto` 推到最右 | 只有统计按钮 `marginLeft:auto` | 整组 `ml-auto`（`chat-pane.tsx`） | P1 |
| S5 | 工具条多了会话名 + 流式文案 | 两者都不在工具条里 | `chat-pane.tsx`（会话名）、（"思考中"） | P1/P2 |
| S6 | 统计按钮内容缺 | input↑ / output↓ / **cacheRead 环形箭头** / cost / **context 图标 + `{pct}% / {window}`** | 只有 input/output/cost/{pct}%（`chat-pane.tsx`） | P1 |
| S7 | 数字格式口径不同 | `formatCompact` 1200→"1k"；cost `≥0.01 ? $x.xx : <$0.01` | `formatTokens` 1200→"1.2k"；`formatCost(0.005)`→"$0.0050" | P2 |
| S8 | 统计按钮形态 | 无 `borderRight`、有详细 tooltip、无统计时隐藏 | 复用 `TopBarAction` → 有 `borderRight`、无 tooltip、无统计也显示 | P2 |
| S9 | 工具条高度 | `calc(36px + env(safe-area-inset-top))` | 固定 `h-9` | P2 |
| S10 | 全局快捷键 | Esc 停止 + `Ctrl+Alt+N` 新建 | `⌘B/⌘J/⌘K/⌘,`，且 `onToggleStats` 是空操作（`use-keyboard-shortcuts.ts`） | P2 |
| S11 | 关闭右栏不复位展开态 | 复位 | `workspace-layout.tsx` 只 `setRightPanelOpen(false)` | P2 |

### 5.2 左侧栏 —— **最显眼的缺口，7 条 P0**

| # | 差异 | 目标形态 | 当前实现 | 等级 |
|---|---|---|---|---|
| L1 | **多了「会话 / 文件」页签** | 无页签 | `sidebar-pane.tsx,151-171`（26px 高圆角按钮） | **P0** |
| L2 | **文件树位置** | 常驻 EXPLORER，与会话列表同屏，中间 `sidebar-section-resize-handle` | 藏在「文件」页签，用 `content` **替换**会话列表（`sidebar-pane.tsx`、`sidebar.tsx`） | **P0** |
| L3 | 搜索入口 | 头部 32×32 **图标按钮**，点击才插入输入框 | 搜索框**常驻**（`sidebar-pane.tsx`） | **P0** |
| L4 | 搜索结果 UI | 三段式（标题 / cwd+时间 / **正文片段 + `<mark>`**）+ `role="status"` 计数行 | 只有输入框 + 防抖，结果复用会话行，无片段/高亮/计数（`session-search.tsx`） | **P0** |
| L5 | **缺独立 worktree/分支行** | `height:29` / mono 分支名 / `main` 标注 / 9×9 chevron；另有只读引导态 | 完全没有（worktree 塞在项目浮层内 `project-picker.tsx`） | **P0** |
| L6 | **EXPLORER 头部图标行** | 折叠 chevron + 大写标签 + 4 个 26×26 `ToolbarIconButton`（变更文件/搜索文件/上传/刷新） | 一行路径文字 + 一个自造「上传」文字按钮（`file-explorer-pane.tsx`） | **P0** |
| L7 | 会话行 meta 语义 | `[运行/未读/时间] + [{n} 条消息] + [仅 worktree 的分支，accent + 9×9 图标]` | `[时间] + [{n} 条] + [任意 branch 纯灰字、无条件]`，运行指示在标题行内（`session-row.tsx`） | **P0** |
| L8 | 项目下拉内容 | 筛选框(>8) + 对勾 + 活动徽标 +「添加工作区…」 | 圆角不透明面板 + 对勾 + 徽标 + 底部一项（`sidebar.tsx`） | P1 |
| L9 | `DirectoryPicker` | portal 模态 520×620，「添加工作区…」的原生选择器不可用（非 macOS / 调用失败 / 校验失败）时回落打开 | **已接线**（`sidebar.tsx`） | P1 |
| L10 | 缺「变更文件」区块（`+a -d`） | | 无 | P1 |
| L11 | 缺文件搜索面板 | （150ms 防抖 + 结果树） | 无 | P1 |
| L12 | 会话行 hover 操作 | 两个 32×32 图标按钮 + **行内删除确认** + Shift 跳过 | 三个文字按钮「改名/复制/删除」，无确认，多一个 规范侧没有的「复制 id」（`session-row.tsx`） | P1 |
| L13 | 运行/未读指示器 | 都在 meta 行第一格：14×14 accent 旋转弧 / 14×14 `#0891b2` 脉冲点 | 标题行内 `Loader2 size=11`；**无未读概念** | P1 |
| L14 | 新建按钮 | 标题行右侧、32px、有 hover 与 disabled | 独占一行右对齐、无 hover、无 disabled、图标用 lucide（`sidebar.tsx`） | P1 |
| L15 | **会话行右键上下文菜单** | `onContextMenu` + | 全仓 `onContextMenu` 零命中 | P1 |
| L16 | **侧栏上传交互被简化** | 头部图标触发 + 进度条 + 同名冲突三选一 + 结果汇总 + 树内蓝点 | 一行「上传」文字按钮 + 一次 `uploadFiles('rename')` + toast（`file-explorer-pane.tsx`） | P1 |
| L17 | EXPLORER 可折叠标题行 | 9×9 chevron + 大写 11px/600 标签 `文件浏览器`，折叠态持久化 | 无 | P1 |
| L18 | 品牌字标 | `PiBoat`（mono/15/700/-0.01em）+ **点击可切显版本号** | `PiBoat`，字体已对齐，**无点击行为** | P2 |
| L19 | 文件树行几何 | `paddingLeft: 8+depth*14` / `height:24` / `gap:4` / `radius:4` / 文字 `var(--text)` | `depth*12+6` / `py-[3px]` / `rounded-[6px]` / `text-fg-muted`（`file-tree.tsx`） | P2 |
| L20 | 文件图标 | Catppuccin SVG + mask 单色 `--text-dim` 14px | lucide 彩色 13px（`file-icon.tsx`） | P2 |
| L21 | git 徽标 | 14×14 / mono 11 / 600 / untracked 绿 `#4ade80` / **仅未 hover 显示** | 10px / 无字重 / untracked 灰 / 常显（`file-tree.tsx`） | P2 |
| L22 | 行内「提及 / 下载」 | hover 时右侧出现 | 显示文件大小文字 | P2 |
| L23 | 会话 `transient` 守卫 + `detailsPending` 的 `…` | | 无 | P2 |
| L24 | 列表 `pr-1` + `focusedIndex` 透传 | | `session-list.tsx` 多 `pr-1`；未传 `focusedIndex` | P2 |
| L25 | 会话标题 `title` tooltip | | 无（`session-row.tsx`） | P2 |

✅ 已一致：（头部上边距，净 12/10 等效）、（底栏三按钮文案已走 `t()`）。
⛔ 排除域：会话家族聚簇（平铺是终态）、EXPLORER 的终端按钮。

### 5.3 中栏对话区 —— **11 条 P0/P1**

| # | 差异 | 目标形态 | 当前实现 | 等级 |
|---|---|---|---|---|
| C1 | **空态整体换了一种东西** | 品牌行（32×32 app icon + `PiBoat` 22px/700 + 更新链接 + 右侧两行版本块）→ **直接就是完整 Composer** | `🚢 PiBoat` + `新会话` → **目录输入卡**（`/path/to/project（绝对路径）` + 开始）+ 提示文案（`empty-state.tsx`） | **P0** |
| C2 | **附件能力全缺** | 32×32 附件按钮 + 56×56 缩略图 + 粘贴图片 + HTML→md + 客户端压缩 + **整屏拖拽覆盖层（3 圈涟漪）**（） | `composer.tsx` 全文 268 行**零附件代码** | **P0** |
| C3 | **无 ModelSelector / ProviderIcon** | composer 左侧模型选择器 + 供应商图标（43 条映射） | 只有模型名纯文本（`composer-toolbar.tsx`）；两组件**不存在**；`apps/web/public/` **目录不存在** | **P0** |
| C4 | **底部工具行位置与形态** | 在**输入卡下方** `marginTop:8`；左=附件+模型，右=思考/工具预设/Compact/**停止（红 `#ef4444`）**/声音（SVG） | 在**输入卡上方**（`aboveInput`）；3 个原生 `<select>`；多"自动命名/导出/统计/插队"；声音用 emoji；停止是卡内黄色（`chat-pane.tsx`、`composer.tsx`） | **P0** |
| C5 | **ChatMinimap 退化成细条** | 36px 右缘栏 + 中轴线 + 8×8 圆角节点 + hover 展开 **320px 大纲预览面板** + 251 行 CSS module | **36 行的桩**：`absolute right-2 w-3.5`；全仓**无任何 `*.module.css`** | **P0** |
| C6 | **统计浮层内容整体未落地** | `session-info-popover` 三列 key-value（会话信息/项目信息/消息计数/token 表含 cacheWrite·cost·**cacheHitRate**）+ 复制按钮 + 入场动画 | `PanelShell` 里的自造 StatCard 网格 + 进度条（`session-stats-panel.tsx`） | **P0** |
| C7 | **BranchNavigator 树行完全不同** | `TreeNodeView`：`height:24` + 16px 缩进导引线 + 连接横线 + **7×7 三态节点圆点** + `U`/`A` 角色徽章 + `+N` 链压缩 | `hairline-b` 行 + `▾/▸` 折叠 + lucide 图标；无连接线/圆点/徽章/`+N`（`branch-navigator.tsx`） | **P0** |
| C8 | 空态垂直定位 | 上 `flex-1` → 内容 → 下 `flex-1`（居中偏下） | 顶对齐（`empty-state.tsx`） | P1 |
| C9 | 流式中按钮 | Steer（黄）+ Follow-up（靛蓝）双按钮 | 单个黄色「停止」（`composer.tsx`） | P1 |
| C10 | 候选浮层 | `/` 与 `@` 双形态：header 计数 + 分组 + `auto-fit minmax(220px,1fr)` 网格 + accent 描边 + 文件图标 | 单一菜单，无分组/网格/描边/图标，`max-h-64`（`suggestion-menu.tsx`） | P1 |
| C11 | 输入历史浮层 | ↑ 开浮层（序号 + 时钟图标头 + active 底） | 直接替换 textarea 内容（`chat-pane.tsx`） | P1 |
| C12 | 用户气泡 | `maxHeight:300` 内滚 + 渲染 `images`（240×240 + 点击放大）+ hover「复制/从此编辑/新会话」+ 时间戳 | 无 maxHeight、**不渲染图片**、无 hover 行、无时间戳；`markdown-body` 嵌套两层（`assistant-turn.tsx`） | P1 |
| C13 | 助手底部 | 用量含 **cache W** 与 **$cost** + 复制 + 时间戳 + 截断告警块 | 用量已重做为**胶囊行 + 明细浮层**（`usage-pills.tsx`，费用/Tokensⓘ/耗时；cache W、cost、命中率都在 ⓘ 明细卡里，2026-10-05） | P1→已修 |
| C14 | TurnWrittenFiles | 内联在助手消息末尾，一行 chip（mono 12 / `bg-subtle` / 描边 / 圆角 6 + 文件图标） | 移到 MessageList 与 composer 之间的独立区块、纵向、无边框（`chat-pane.tsx`）〔2026-09-27 已补做，见 T3-11 注〕 | P1 |
| C15 | 工具行展开体 | 入参/结果**分开** + 结果独立配色 + `maxHeight:400` + 空结果 `(no output)` 斜体 + **split diff** + 结果图片 | 入参与输出用 `\n` 拼在同一 `<pre>`；无 diff、无结果图片（`tool-row.tsx`） | P1 |
| C16 | 图片预览 | `<dialog class="image-preview-dialog">` 灯箱（72% 黑背板） | 同名件是右栏风格内联缩放；markdown `img` 未覆盖 → **消息内图片无法放大** | P1 |
| C17 | markdown 能力 | katex 公式 + mermaid + `img`→灯箱 + 本地文件链接拦截 + `MAX_MARKDOWN_CHARS=100_000` 保护 | 只有 `remark-gfm`；公式/mermaid/灯箱/本地链接/超大保护**全缺**（`markdown-view.tsx`） | P1 |
| C18 | 运行态 phase 文案 | 「正在运行 xxx 工具 / 等待模型…」+ `animate-pulse` | 只有「生成中…」（`assistant-turn.tsx`） | P1 |
| C19 | 页内通知位置 | 聊天区**右上角** `NoticeShelf` | 全局**底部居中** fixed toast（`primitives/toast.tsx`） | P1 |
| C20 | 加载更早 | 纯文字哨兵 `py-3 text-center text-xs text-text-muted` | 描边按钮（`message-list.tsx`） | P2 |
| C21 | 排队条 | 「撤回」描边按钮 + 行内 steer/follow-up **胶囊徽标** + **无分组头** | 裸文字「清空队列」+ 自造分组头（`queue-bar.tsx`） | P2 |
| C22 | 思考行 | 折叠预览 `allowedElements={[]}` 剥 markdown 记号 + 展开显示 `{duration}s` + 正文 `--text-muted` | 直接取首行原文（漏 `**`/`#`）+ 无 duration + 正文用 `--accent`（`thinking-row.tsx`） | P2 |
| C23 | 代码块 | 复制 + **mermaid 预览切换**（`.markdown-code-action.is-active` 唯一消费方 =）+ 行号 | 只有复制；`.is-active` 未被使用（`code-block.tsx`） | P2 |
| C24 | 发送按钮图标 | 右箭头 + 竖线起点（`line 2 7 11 7` + `polyline 7.5 3 12 7 7.5 11`） | lucide `ArrowUp`（方向不符，`composer.tsx`） | P2 |
| C25 | 占位符文案 | 三态（`steerPlaceholder`/`agentPlaceholder`/`messagePlaceholder`） | 硬编码「给 PiBoat 发消息…」，流式不变（`composer.tsx`） | P2 |
| C26 | 各类 banner | 模型错误/作用域/图片不支持/重试/压缩结果 | 全无（降级为底部 toast） | P2 |
| C27 | 过程组 | 无耗时后缀 | 多一个耗时后缀（`process-group.tsx`） | P2 |
| C28 | 助手模型标签 | 友好显示名 `getModelDisplayName` | 原始 `modelId`，且 `Turn.model` 无 provider 字段（`assistant-turn.tsx`） | P2 |
| C29 | 流式用量徽标 | 模型标签行右侧「↓ 估算 tokens」+ 彩色 `t/s` | 无 | P2 |
| C30 | 空态品牌行 `paddingRight` | 桌面 `52`（避让 minimap） | 固定 `16`（`empty-state.tsx`） | P2 |
| C31 | `data-message-role` 等锚点 | 助手容器带 `data-message-role` / `data-entry-id` | 无任何锚点属性 | P2 |
| C32 | 用户气泡「命令展开」形态 | `skillExpansionToCommand` → 可折叠 `/cmd args` | 无（`assistant-turn.tsx`） | P2 |
| C33 | `streaming` 判定粒度 | 按「最后一条用户消息 / 群组锚点」算 live tail | 把 `chat.streaming` 传给**每一轮**（`chat-pane.tsx`） | P2 |

✅ 已一致：（消息列骨架）、（`ThinkingIcon` SVG 完全一致）、T0-1（`chat-scroll-to-bottom` + `is-visible`）。
⚠️ **需订正**：规范侧 `CodeBlock` 有「换行切换」按钮 —— **不成立**，规范的 `CodeBlock` 只有复制 + 可选的 mermaid 预览切换。

### 5.4 右栏文件面板 —— 3 条 P0

| # | 差异 | 目标形态 | 当前实现 | 等级 |
|---|---|---|---|---|
| F1 | 体量 | 右栏链路 8 文件 **3695 行**（查看器本体 1800） | 对应 14 文件 **1423 行**（查看器本体 647） | **P0**（F2-F10 的合计表现） |
| F2 | **Mermaid 完全缺失** | （329 行）+ zoom dialog，**文件预览与聊天都渲染** | 无组件；CSS 已备但零消费 | **P0** |
| F3 | **markdown / HTML 预览模式** | `displayModes = ['source','preview','diff']`，md 走 Markdown、HTML 走 sandbox iframe，且 md/html **默认进 preview** | 只有「内容 / diff」；markdown 当纯文本（`file-viewer.tsx`） | **P0** |
| F4 | FrontmatterCard | `parseFrontmatter` + 卡片，md 预览顶部渲染 | 缺失 | P1 |
| F5 | 源码语法高亮 | ~~`react-syntax-highlighter`（Prism `vs`/`vscDarkPlus`）~~ 改用本仓既有 `shiki`（ADR-0029）+ **>1000 行降级** | **已落地**：`CodeViewer`/`DiffView`/工具面板接 shiki，双主题走 `--shiki-light/--shiki-dark` + `[data-theme]`；仍截断 5000 行 | P1（**已关闭**，仅剩行号列几何见 T4-4） |
| F6 | live 文件监听 | `EventSource(...?type=watch)` + `.file-viewer-live-indicator` 绿点 | 无。⛔ **阻塞：本仓协议 `FileByteType` 无 `watch`** | P1 |
| F7 | 大文件 load-more | `.file-viewer-load-more`：已读/总大小 + 续拉 `nextOffset` | 截断 + 「请下载」（`code-viewer.tsx`）。⛔ **阻塞：`type=read` 回裸字节、无 offset 参数** | P1 |
| F8 | 上传交互 | 头部图标 + 进度条 + 冲突三选一 + 结果汇总 + 树内蓝点 | 「上传」文字按钮 + `uploadFiles('rename')` + toast（`file-explorer-pane.tsx`） | P1（后端已就绪） |
| F9 | 图片查看器 | toolbar path + `W×H` + 大小 + live 圆点 + **棋盘格背景** | 自带缩放工具栏，无 path/尺寸/live/棋盘格（`image-preview.tsx`） | P1 |
| F10 | 音视频 / PDF | `AudioViewer`/`VideoViewer`/`DocumentViewer`（PDF 分页、live、sandbox） | 只有裸 PDF iframe；音视频落进「二进制 → 下载」（`file-viewer.tsx`） | P1 |
| F11 | toolbar 内联值 | `gap:8` / `padding:'5px 12px'` / `background: var(--bg)` / `fontSize:11` / meta = `语言 · 行数 · 大小` | `gap-3` / 只有 `px-3` / `background: var(--bg-panel)` / meta 只有大小（`file-viewer.tsx`） | P2 |
| F12 | 模式按钮文案 | 硬编码 `Source / Preview / Diff`（规范本身未 i18n） | 「内容 / diff」（`file-viewer.tsx`） | P2（**口径待拍板**，见 §7 Q4） |
| F13 | TabBar 交互 | 中键关闭 + `←/→/Home/End` 轮转 | 只有 Enter/Space（`file-tabs.tsx`） | P2 |
| F14 | Catppuccin 图标 | SVG sprite + mask 双主题 | lucide 彩色；**`apps/web/public/` 不存在** | P2 |
| F15 | `AnsiText` | （`ansi_up`） | **全仓不存在**（影响 T6-5/T6-6 与工具输出） | P2 |
| F16 | **「@ 提及」按钮 + 选中行提及（Cmd/Ctrl+I）** | | 无按钮、无快捷键、无选区行范围算法 | P1 |
| F17 | **每页签查看器状态持久化** | `file-tab-state.ts`（`viewerState` + `viewerRevision`）+ `key={id:revision}` | `FileTab` 无 scrollTop/page/revision；`files-pane.tsx` 渲染 `<FileViewer>` **无 key** → 切标签滚动位置丢失、图片 fit/zoom 跨标签残留 | P1 |
| F18 | DiffView 结构 | 3 行上下文折叠 + `... N unchanged lines ...` + **单列**行号 | **双列**行号 + 无折叠 + 多一个 `+N/-N` 汇总条（`diff-view.tsx`） | P1 |
| F19 | DOCX 预览 | `DocumentViewer` 支持 docx | 「DOCX 不支持在线预览」+ 下载（`file-viewer.tsx`）。⛔ **受后端限制** | P1 |
| F20 | 右栏空态 / toolbar 多余件 | 单行居中 `files.noneOpen`；无「在新标签页打开」；下载在 mode-switch 之后 | 两行中文 + 渲染 root 绝对路径；多「在新标签页打开」；下载位置不同 | P2 |
| F21 | 源码行号列几何 | 固定 `width:48` / `background:var(--bg-panel)` / `data-line-number` | `<table>` + `pl-2/pr-3`，无固定列宽、无 `data-line-number`（→ **F16 无法实现**） | P2 |
| F22 | 本仓自造「二进制文件」分支 | 规范无 | `file-viewer.tsx` | P2（应删） |

### 5.5 设置中心 —— 壳已对齐 ✓，4 条 P0 在「三节没套壳」

| # | 差异 | 目标形态 | 当前实现 | 等级 |
|---|---|---|---|---|
| G1 | **模型节结构** | `ConfigPanelShell + SplitView`（provider 树 + 详情 + Footer Save） | 单列三块（checkbox 列表 + models.json textarea + 目录刷新）（`models-section.tsx`） | **P0** |
| G2 | **EnabledModelsSection / Banner** | + `EnabledModelsBanner` + helpers | **整块缺失**（`.enabled-models-*` 19 条 CSS 零消费） | **P0** |
| G3 | **Skills 节结构** | `ConfigPanelShell + SplitView`（列表 + `skill-detail-*` 详情） | 单列三块（`skills-section.tsx`） | **P0** |
| G4 | **扩展包节结构** | `ConfigPanelShell + SplitView`（extensions/packages 分组 + 详情） | 单列三块（`plugins-section.tsx`） | **P0** |
| G5 | ~~**`DirectoryPicker` 形态 + 接线**~~ | portal 模态 520×620 / 圆角 10 | **已落地且已接线**（`sidebar.tsx` 的「自定义路径…」触发）——**本行已过期**（2026-09-26 复核） | ✅ |
| G6 | **通用节缺「选中文字浮窗」开关** | 3 项：内容宽 / 字号 / **Show actions for selected text** | 只有前 2 项（`general-section.tsx`）；`settings-host.tsx` 也未传该 prop（「思考展开」项已于 2026 主动删除） | P1 |
| G7 | **控件层未对齐 `primitives`** | `ConfigSwitch` 44×27 / knob 23 白（原型 v3 口径）；`ConfigButton` 圆角 5 / h32·h28 / font 12·11 / `is-success`；输入框 12px | `Switch` 36×20 / 圆角 6 / knob **16px 白**；`Button` 圆角 7-8、无 secondary/danger/成功态；`Input` 11px（`primitives/switch.tsx`、`button.tsx`、`input.tsx`） | P1 |
| G8 | **自造 `SettingsRow` 仍在用** | 规范无 `.settings-row`，用 `.settings-shell-option` / `ConfigField` | `settings-panel.tsx`，被 `models-section.tsx`、`skills-section.tsx`、`plugins-section.tsx` 消费（**2026-09-26 更正**：`directory-picker.tsx` 并未 import 它） | P1 |
| G9 | 三节去掉外层 padding 后文字贴边 | `.config-detail{padding:20px}` 提供内边距（`settings.css`） | `models-section.tsx`、`skills-section.tsx`、`plugins-section.tsx` 是裸 `flex flex-col gap-8` → **内边距为 0** | P1 |
| G10 | ProjectTrustDialog 盾牌色 | `#f59e0b` | `#d97706`（`project-trust-dialog.tsx`）—— 此前误标为"完全落地"，实为改色 | P2 |
| G11 | `settings-navigation` 无详情选中记忆 | 存 `{section, selections}` | 简化版，无 selections（`apps/web/src/services/settings-navigation.ts`） | P2 |

✅ 已一致（T5-1 落地质量高）：尺寸/遮罩/阴影、G4 壳层 padding、G5 节图标、G15 节常驻挂载（`hidden` 切换）、G17 `.config-close-button` `×`、G18 ESC（document 级）、G20 主题选择器 + `ThemeIcon` 完全一致、语言节 radiogroup 六类、**节数保持 4 个（未补 Sub-agents）✅**、移动端 `<select>` 已补、`ConfigSwitch`/`ConfigButton` 在设置内已被消费。
⛔ 排除域：Agents 节（`.agents-*` 12 条 CSS、`is-agent` 分支）、登出、Shell(Windows) PowerShell 节、推送节。

### 5.6 浮层面板 / 扩展货架

| # | 差异 | 目标形态 | 当前实现 | 等级 |
|---|---|---|---|---|
| P1 | **挂载形态** | 工具条 inline 触发 + `position:fixed` 贴顶下拉 | `PanelShell` 内联整宽（`panels-host.tsx`） | **P0**（同 S3） |
| P2 | **SystemPromptPanel 多一整条标题栏** | 无标题栏、无关闭键；`height:min(600px,75dvh); min-height:220px` | 被 `PanelShell` 包裹（多 title + hint + 关闭 + 「重新读取」）、`60dvh`（`system-prompt-panel.tsx`） | P1 |
| P3 | **扩展货架外层结构** | **单一** `.extension-status-shelf`（`has-widgets`/`has-status`），widgets 在前、status 在后 | 两者是**兄弟节点**且顺序相反，无 shelf 包装、无 `has-*` 类（`chat-pane.tsx`） | **P0** |
| P4 | 状态行内容 | `sanitizeExtensionStatusText` → 按 key 排序 → 空格 join → `<AnsiText>` + `role="status"` + `title` | `statuses.map(<span>)`；无排序/sanitize/AnsiText/role（`extension-status-bar.tsx`） | **P0** |
| P5 | **货架纵轴位置错了** | 挂在 composer **之下**（消息区 → composer → 货架） | 放在**消息列表之上**（`chat-pane.tsx` 在 MessageList 之前） | P1 |
| P6 | widget 更新脉冲 | 快照 diff + `is-updating` + `.extension-widget-update-pulse` | `WIDGET_UPDATE_IDLE_MS` 定义了但**从未引用**（`extension-widgets.tsx`） | P1 |
| P7 | widget 位置三角 | `.extension-widget-placement` + `<svg viewBox="0 0 8 6" data-direction>` | 改成一个 规范侧没有的「N 行」文本（`extension-widgets.tsx`） | P1 |
| P8 | panels 顺序 | `.extension-widget-panels` 在 triggers **之前** | 在 triggers **之后**（`extension-widgets.tsx`） | P2 |
| P9 | shelf 多一条内联描边 | 顶描边只由 `.extension-status-shelf` 提供 | `.extension-status-line` 上多内联 `borderTop` → 两条线（`extension-status-bar.tsx`） | P2 |
| P10 | widget 内容未走 `AnsiText` | `<pre><AnsiText text={...}/></pre>` | `{widget.widgetLines.join('\n')}` | P2 |

✅ 已一致：`ToolDefinitionsPanel` 两栏结构（`tool-definitions-panel.tsx` + CSS，T6-1 合格）。

### 5.7 i18n 覆盖度 🟡 **基建完成、未铺开**

| 检查项 | 结果 |
|---|---|
| 语言包 | ✅ `messages/{en,zh-CN,ja}.ts`，**各 616 key**，三语 key 集合一致（有 Vitest 断言） |
| 基建 | ✅ `types.ts` / `registry.ts`（**已补 `ja`/`ja-*` → `ja`**）/ `format.ts` / `i18n-provider.tsx`；`localStorage` key = `pi-locale`；同步 `document.documentElement.lang` |
| 设置域消费 | ✅ `settings-panel.tsx`(9) / `general-section.tsx`(16) / `project-trust-dialog.tsx`(4) / `tool-definitions-panel.tsx` |
| **全仓 `useI18n` 消费方** | ❌ **仅 5 个文件**（上列 4 个 + `chat-pane.tsx` 部分；`workspace-layout.tsx` 部分） |
| 未 i18n 的热点 | ❌ `sidebar-pane.tsx`（「会话/文件/PiBoat」）、`sidebar.tsx`（「新会话」）、`session-row.tsx`（「改名/复制/删除/N 条」）、`models-section.tsx`(~11 处)、`skills-section.tsx`(~14)、`plugins-section.tsx`(~9)、`directory-picker.tsx`(~4)、`composer.tsx`、`empty-state.tsx`、`settings-host.tsx`（**节标签是英文硬编码**、~20 条中文通知） |
| `formatRelativeTime` | ✅ 已被 `session-row.tsx` 消费 |

**量化**：`packages/ui/src/**/*.tsx` 含中文字符的文件 **51 个**，其中仅 **3 个** import `useI18n`；`apps/web/src` 含中文 **24 个**，仅 **2 个** import。
→ §6 的 **T8-5（全仓替换）仍是 i18n 唯一的未闭环项**，判断成立。

---

## 6. 整改任务清单

> 勾选口径沿用既有 T 编号；`N*/O*/M*` 为新增编号。
> **~~删除线~~ + ⛔ = 排除域，不得实现。**

### 阶段 0：修 bug（先做）
- [x] ~~**T0-1（新）** 接回 minimap 滚动视口跟踪：替换 `chat-pane.tsx` 的硬编码 `0,1,1`。~~〔BUG-1〕（2026-09-27 minimap 整体移除，视口回传与跟踪同步删除）
- [x] **T0-2（新）** `files-pane.tsx` 的 `aria-expanded` 改真实 `rightPanelOpen`。〔BUG-2〕
- [x] **T0-3（新）** 删 `settings-panel.tsx` 的 `config-badge` 分支（无对应 CSS）。〔BUG-3〕
- [x] **T0-4** 右栏收尾 3 处：展开时收起顶部面板（`workspace-layout.tsx`，）；关闭时复位 `rightPanelExpanded`；右栏顶行补 `height: calc(36px+env(safe-area-inset-top))` + `background:var(--bg-panel)`。〔F20/T0-3 尾〕

### 阶段 1：外壳 / 中栏工具条（P0）
- [x] **T1-1（新·O-1）** 工具条右侧补**文件面板开合按钮**（36×36 + `borderLeft`，）。〔S1〕
- [x] **T1-2** 空态也渲染工具条（页签 disabled + `opacity:0.45`，）。〔S2 / T1-4〕
- [x] **T1-3** 面板改工具条下方 `position:fixed` 贴顶下拉，删 `PanelShell` 内联整宽形态。〔S3 / P1 / T1-6〕
- [x] **T1-4（新·O-2）** 去掉工具条里的会话名（`chat-pane.tsx`）与「思考中」；`ml-auto` 只留给统计按钮。〔S4/S5〕
- [x] **T1-5（新·O-3）** 统计按钮补 cacheRead 图标 + `{pct}% / 窗口尺寸` + context 图标；数字格式改用规范的 `formatCompact`/`costText`；去 `borderRight`、补 tooltip、无统计时隐藏。〔S6/S7/S8〕
- [x] **T1-6（新·O-5）** 生成标题补成功/失败态（`autoNameStatus` 三态 + `hasMessages` 禁用，）。〔§9 误标已完成〕
- [x] **T1-7（新·O-6）** 分支页签补 `sessionHasBranches` 门控；图标色按有无分支取 accent/text-dim。〔§5.1〕
- [x] **T1-8** 工具条 `height: calc(36px + env(safe-area-inset-top))` + `paddingTop`；`hairline-b` 换内联 `borderBottom`。〔S9〕
- [x] **T1-9** 全局快捷键改 Esc 停止 + `Ctrl+Alt+N` 新建；修 `onToggleStats` 空操作。〔S10 / T1-8〕
- [x] **T1-10（新·O-4）** 新建 `session-info-popover` 内容组件（三列 key-value + 复制按钮，），废弃自造 StatCard 形态；把 `@keyframes session-info-pop` 补进 `styles/web-ui.css`。〔C6〕
- ~~T1-11 移动工具条 / `useViewportHeight`~~ ⛔ **排除域**
- [x] **T1-12** 历史图标 SVG、系统/工具页签 `title` 词条对齐（`chat-pane.tsx` ←）。〔P2〕

### 阶段 2：左侧栏（P0 —— 最显眼的缺口）
- [x] **T2-1** 删「会话/文件」页签（`sidebar-pane.tsx,151-171`），文件树改会话列表**下方常驻 EXPLORER** + `.sidebar-section-resize-handle`。〔L1/L2〕（**2026-09-26 复核：代码已完成**——截图可见文件树常驻、无页签；原勾选状态与 §0.1 自相矛盾，此处更正）
- [x] **T2-2** 头部补 32×32 搜索图标按钮，搜索框改条件渲染；打开搜索时隐藏 worktree 行。〔L3〕（2026-09-27：搜索框改「就地替换工作区行」，不再插行把列表顶下去）
  - 二次调整（2026-09-27）：搜索图标降为 26×26/r6/icon 13，随动作簇下移到工作区行，输入框展开时就地插在工作区行**下方**
- [x] **T2-3** 新建 `session-search-results.tsx`：三段式 + `<mark class="rounded-sm bg-accent/20 text-text">` + `role="status"` 计数。〔L4〕
- [x] ~~**T2-4** 新增独立 worktree/分支行 + 只读引导态。~~ 〔L5〕（2026-09-27 用户拍板**去掉分支切换逻辑**：worktree 切换/新建/删除与只读引导态全部移除；分支改为工作区选择器内**只读展示**，选择器显示目录名 + `main`/当前分支 + 下拉箭头）
  - 二次调整（2026-09-27 用户拍板）：**分支信息也不再展示**——工作区行只剩「目录名 + 下拉箭头」，位置让给新会话/搜索动作；`SidebarProps.currentBranch` 与宿主的 git 分支接线一并删掉（`useGitStatusQuery` 仍供 EXPLORER 的变更数使用）
  - 三次调整（2026-09-27 用户拍板）：目录名改为**完整路径**（家目录缩为 `~`，`displayCwd()`），过长时用 `PathLabel` 左侧省略、保住目录名与靠后父目录；与下拉项里的路径渲染同源。**有意偏离**设计规范 `.ws .fname` 的「只显示目录名」
- [x] **T2-5（新·M3）** EXPLORER 可折叠标题行（9×9 chevron + 大写标签 + 持久化，）。
- [x] **T2-6** EXPLORER 头部 26×26 图标行（变更文件/搜索文件/上传/刷新；终端按钮跳过）；新建 `ToolbarIconButton` 原语。〔L6〕
- [x] **T2-7** 会话行 meta 改三段语义（`时间·运行·未读` / `t('sidebar.messagesCount')` / 仅 worktree 的 accent+9×9 图标，`:2366-2391,2019-2082`）。〔L7/L13〕
- [ ] **T2-8（新·M2）** 会话行右键菜单：落地 + 接 `onContextMenu`。〔L15〕
- [x] **T2-9** 项目下拉重写（筛选框/对勾/活动徽标/「添加工作区…」，）。〔L8〕
- [x] **T2-10** `DirectoryPicker` 改 portal 模态并接线到「添加工作区…」的回落。〔L9 / G5〕
- [x] **T2-11** 补「变更文件」区块 + 文件搜索面板。〔L10/L11〕
- [ ] **T2-12（新·M4）** 侧栏上传交互升级：头部图标 + 进度条 + 冲突三选一 + 结果汇总 + 树内蓝点。〔L16〕
- [x] **T2-13** 会话行 hover 改两个 32×32 图标按钮 + 行内删除确认 + Shift 跳过；删「复制 id」（`:2415-2473,2273-2313`）。〔L12〕
- [x] **T2-14** 新建按钮归位标题行右侧 + hover/disabled + 内联 SVG。〔L14〕（2026-09-27 用户拍板：独立动作行、白底描边 r6、无阴影、常规字重 400 与正文同字体；窄侧栏下标签省略）
  - 二次调整（2026-09-27 用户拍板）：新会话 + 搜索**下移到工作区行**（原只读分支位）；带文字的白底按钮会把项目名挤成 `pi-b…`，故 `+` 改**图标按钮** 26×26/r6/icon 13；品牌行只留字标，高 54 → 44
  - 三次调整（2026-09-27 用户拍板，**当前形态**）：按 `docs/design/piboat-web-v4.html` 的品牌行排版改为三段——**品牌行**（应用图标 20px + `PiBoat`，高 44）/ **动作行**（`新会话` 正文按钮，样式保持：`flex:1 / h31 / r6 / padding 0 16 / 白底描边` + 搜索图标 26×26）/ **工作区行**（目录名 + 下拉）；搜索输入展开时插在动作行下方。原型里的 `v4` 版本胶囊**未落地**（待定：是否要常显版本、显示 app 还是 pi 版本——目前仍靠点字标切显）
  - 四次调整（2026-09-28 用户拍板）：上面的「待定」已定——版本胶囊**常显**，且**应用版本 + pi 版本同行**（见 T2-15 调整）
- [x] ~~**T2-15** 品牌字标改 `PiBoat` + 点击切显版本。~~ 〔L18〕（2026-09-27 字标左侧应用图标 `favicon.svg`；`Pi` 常规字色 + `Boat` 品牌黄 `--brand`；右侧常驻版本药丸 `v0.1.0`（APP_VERSION），原点击切显与扰乱动画移除；见 ADR-0022）
  - 二次调整（2026-09-27 用户拍板）：字标左侧**加回图标**，用的是应用图标本体（`/favicon.svg`，20×20，与空态的 app icon 同一张图），即原型的 19px mark 位；字标本身与点击切版本行为不变
  - 三次调整（2026-09-28 用户拍板，**当前形态**）：版本胶囊改为「`v0.1.0 · pi v0.87.1`」同行——pi 版本随应用版本常驻品牌行（`Sidebar` 的 `piVersionLabel`）；窄侧栏（最小 180px）下胶囊先截断，不挤掉右侧主题按钮
- [x] **T2-16** 文件树行几何 + git 徽标 + 行内「提及/下载」。〔L19/L21/L22〕
- [x] **T2-17（新·M5/M6/M7）** `transient` 守卫、`detailsPending` 的 `…`、去掉列表 `pr-1` + 透传 `focusedIndex`、标题补 `title` tooltip。
- [x] **T2-18** 建 `apps/web/public/icons/catppuccin/{latte,mocha}/`（沿用规范图标），`file-icon.tsx` 改用 `.catppuccin-file-icon`（14px 单色 `--text-dim`）。〔L20 / F14 / T4-10〕
- [x] **T2-20（新）** 会话列表按「今天 / 昨天 / 更早」分组（本地日历日）；窗口化从「固定 54px 行高」改为「分组头 + 会话行」前缀和布局（`packages/client/src/view-models/session-list-window.ts`，头 34 / 行 54；分组头 11px/700 + 上分隔线）。（2026-09-27 用户拍板）
- [x] **T2-21（新）** 会话行改**单行**（**有意偏离**规范 A 的两行 54px，对齐 Codex / DeepSeekHarness 的密度）：行高 54 → **34**（窄屏 ≤640px → 44）、分组头 34 → 26（窄屏 30）、`SESSION_LIST_OVERSCAN` 8 → 10 行；meta 从第二行移到行尾右对齐（`[运行/未读] 紧凑时间 {n}条`，时间/条数各定宽 + `tabular-nums` 保证竖向对齐），时间文案改紧凑单位（`40m` / `2h` / `3d`，超过一周给 `M/D`；新增三语 key `sidebar.time{JustNow,Minutes,Hours,Days}`），条数用新增 `sidebar.messagesCountShort`（`697条`；原 `sidebar.messagesCount` 保留以对齐规范 A 的 key 集），**运行/未读指示器不再顶掉时间**，标题**去掉加粗**（原 `600/500` → 常规字重，选中态改由底色 + accent 左边条区分），worktree 分支收成 9px 图标（全名进 tooltip），hover 双图标按钮 32 → 26 且**顶掉 meta**（不再挤标题），行内删除确认按钮 30 → 22 / 重命名输入框 30 → 24 / 确认文案标题截 22 → 12 字。（2026-09-27 用户拍板；`packages/client/src/view-models/session-list-window.ts` + `packages/ui/src/sidebar/sidebar.tsx` + `docs/design/piboat-web-v4.html`）
- ~~T2-19 会话家族聚簇 / 机器人图标 / 折叠 chevron~~ ⛔ **排除域（会话平铺是终态）**

### 阶段 3：中栏对话（P0/P1）
- [x] **T3-1** 空态重写：品牌行（32×32 app icon + `PiBoat` 22px/700 + 更新链接 + 右侧两行版本块）+ **直接复用 Composer**；容器改「上 flex-1 / 内容 / 下 flex-1」；`paddingRight` 桌面 52。〔C1/C8/C30〕
  - 调整（2026-09-28 用户拍板，**当前形态**）：**撤掉**品牌行右侧的两行版本块（`EmptyState` 的 `appVersion`/`piVersion` 两个 prop 一并删，组件只剩 `children` + `shelf`）；pi 版本改在**侧栏品牌胶囊**里与应用版本同行常驻（`Sidebar` 新增 `piVersionLabel`，`useServerInfo()` 的消费方从中栏移到侧栏 pane；数据源仍是 `/api/health`，不手抄第二份版本）
- [ ] **T3-2** Composer 附件能力 + 整屏拖拽覆盖层（）。〔C2〕
- [ ] **T3-3** 落地 `ProviderIcon`（43 映射）+ `ModelSelector`；建 `apps/web/public/` 并拷 `provider-icons.svg`。〔C3〕
- [ ] **T3-4** 工具行移到输入卡**下方**，`<select>` 换图标+文字按钮 + 上弹面板，补红系停止与 SVG 声音。〔C4〕
- [ ] **T3-5** 流式中改 Steer（黄）+ Follow-up（靛蓝）双按钮。〔C9〕
- [ ] **T3-6** 候选浮层 `/` 与 `@` 双形态（header 计数 + 分组 + 网格 + 描边 ring + 文件图标，）。〔C10〕
- [ ] **T3-7** 新增 `history-menu.tsx` 输入历史浮层。〔C11〕
- [ ] ~~**T3-8** ChatMinimap 重写：完全复制 （251 行），组件按 实现 36px 栏 + 中轴 + 8×8 节点 + 320px 预览面板。~~〔C5〕（2026-09-27 用户拍板移除 minimap，本任务作废）
- [ ] **T3-9** 新建 `chat/image-preview.tsx` 灯箱（`<dialog class="image-preview-dialog">`）；`markdown-view.tsx` 注册 `img` → 灯箱；用户气泡渲染 `images`；工具行结果图片。〔C12/C15/C16〕
- [x] **T3-10** 用户气泡：`maxHeight:300` + hover 操作行 + 时间戳 + 去掉多余 `markdown-body` 嵌套。〔C12〕
- [x] **T3-11** 助手底部：cache W + `$cost` + 复制 + 时间戳 + 截断告警；`TurnWrittenFiles` 改内联 chip 并移入 `AssistantTurn`。〔C13/C14〕
  - ⚠️ 2026-09-27 复查：勾选时 **C14 部分实际未落地**（旧实现仍是 `chat-pane.tsx` 里「本轮改动 N 个文件」
    + 竖排路径列表的独立区块）；同日补做 —— chip 形态 + 移入 `AssistantTurn`，回归锁
    `packages/ui/test/turn-written-files.test.tsx`。C13 部分仍以 `docs/10` C13 为准（cache W / `$cost` /
    复制 / 时间戳 / 截断告警未做）。
- [ ] **T3-12** 运行态 phase 文案行。〔C18〕
  - ⚠️ 2026-09-27 复查：**实际未落地**（`chat.runningNamedTool` / `chat.waitingModel` 等 key 零消费方，
    只有 `assistant-turn.tsx` 的「生成中…」）。回退勾选，以 `docs/10` C18 为准；参考实现见
    `components/ChatWindow.tsx` 的 `phaseLabel()`（需把 `AgentPhase` 从 fold 状态派生）。
- [x] **T3-13** 新建 `notice-shelf.tsx`（右上角页内通知，替换中栏底部 toast）。〔C19〕
- [x] **T3-14** markdown 补 katex / mermaid / 本地文件链接拦截 / `MAX_MARKDOWN_CHARS` 保护；补 `.contains-task-list`/`.task-list-item` 的消费。〔C17〕
- [x] **T3-15** BranchNavigator 换 `TreeNodeView`（连接线 + 7×7 圆点三态 + `U`/`A` 徽章 + `+N`，算法内聚）。〔C7 / T6-2〕
- [x] **T3-16** 收尾：加载更早哨兵 / 排队条胶囊 + 描边撤回 / 发送图标 / 占位符三态 / 思考行 / 过程组去耗时 / 各类 banner。〔C20-C27〕
- [x] **T3-17（新·N2-N8）** 助手显示名、`t/s` 徽标、`data-*` 锚点、用户命令展开形态、per-turn liveTail 判定。
- [x] **T3-18（新）** 内容区宽度把手（`ui/chat/content-width-handles.tsx` + `chat-pane` 接线）：双侧 hover 热区 + 2px 光条（跟指针 Y）+ 对称拖拽改宽 + 滚轮转发 + 持久化（`piboat:chat-content-width`，下限 640）；实际宽按 `列宽 - 80` 夹取。〔docs/06 §8.4〕（2026-09-27 参照 deepseek-harness `ConversationWidthControls` 落地）

### 阶段 4：右栏文件（P0/P1）
- [ ] **T4-1** 落地 `MermaidBlock`（329 行 + zoom dialog + SVG 下载）并在 md 预览与聊天 markdown 加分支。〔F2〕
- [ ] **T4-2** FileViewer 补 `displayModes` 三态 + md/HTML preview（iframe sandbox）+ 默认进 preview。〔F3〕
- [ ] **T4-3** 落地 `FrontmatterCard` +，md 预览顶部渲染。〔F4〕
- [x] **T4-4（高亮部分 2026-09-29，ADR-0029）** `CodeViewer` / `DiffView` / 工具面板接 shiki 高亮 + 1000 行降级；
 **仍缺**行号列几何（固定 48 宽 + `data-line-number`）。〔F5/F21〕
- [ ] **T4-5** ~~live watch~~ ⛔ **阻塞：本仓协议无 `type=watch`**，需先扩后端
- [ ] **T4-6** ~~load-more 续拉~~ ⛔ **阻塞：`type=read` 回裸字节，无 offset**
- [ ] **T4-7** 上传交互升级（头部图标 + 进度条 + 冲突三选一 + 汇总 + 蓝点）；后端已就绪。〔F8〕
- [ ] **T4-8** 图片查看器按 `ImageViewer` 重写（path + `W×H` + 大小 + live + 棋盘格），删自造缩放栏。〔F9〕
- [ ] **T4-9** 补 `AudioViewer`/`VideoViewer`；PDF 增强 toolbar + 分页。〔F10〕
- [ ] **T4-10（新·F16）** 查看器「@ 提及」按钮 + 选中行提及（Cmd/Ctrl+I）+ 选区→行范围算法。〔F16〕
- [ ] **T4-11（新·F17）** 每页签查看器状态持久化（`viewerState` + `viewerRevision` + `<FileViewer key>`）。〔F17〕
- [ ] **T4-12（新·F18）** DiffView 改上下文折叠 + 单列行号。〔F18〕
- [ ] **T4-13** toolbar 内联值 + meta 三段（语言·行数·大小）；删自造「在新标签页打开」、删「二进制文件」分支、空态改单行居中；下载位归位。〔F11/F20/F22〕
- [ ] **T4-14** TabBar 补中键关闭 + 方向键轮转。〔F13〕
- [ ] **T4-15** 落地 `AnsiText`（+ `ansi_up` 依赖）。〔F15〕
- [ ] **T4-16（新·F19）** DOCX 预览 ⛔ **受后端 DOCX→HTML 限制**，需先补后端

### 阶段 5：设置中心（P0/P1）
- [ ] **T5-1** 模型节重建为 `ConfigPanelShell + ConfigSplitView` + `AddProviderPicker`；落地 `EnabledModelsSection` + `EnabledModelsBanner` + helpers。〔G1/G2〕
- [ ] **T5-2** Skills 节套 `ConfigPanelShell + SplitView`，启用 `.skill-*`。〔G3〕
- [ ] **T5-3** 扩展包节套 `ConfigPanelShell + SplitView`，extensions/packages 分组 + 详情。〔G4〕
- [ ] **T5-4** 通用节补「选中文字浮窗」开关（+ `settings-host.tsx` 传 prop）。〔G6〕
- [ ] **T5-5** 控件层：`primitives/switch.tsx` / `button.tsx` / `input.tsx` 对齐 `.config-switch` / `.config-button-*` / 12px 输入框；补 secondary/danger/`is-success`。〔G7〕
- [ ] **T5-6** 删自造 `SettingsRow` / `SettingsSectionTitle` / `SettingsNotice`，改 `ConfigField` / `.settings-shell-option`；三节补 `.config-detail` 内边距。〔G8/G9〕
- [x] **T5-7** `DirectoryPicker` portal 模态 + 接线（同 T2-10）。〔G5〕（**2026-09-26 复核：已落地且已接线**，条目过期）
- [ ] **T5-8** 盾牌色 `#d97706` → `#f59e0b`；落地 `settings-navigation` 的 selections 记忆。〔G10/G11〕
- ~~T5-9 Agents 设置节 / `.agents-*` CSS / `is-agent` 分支~~ ⛔ **排除域（节数保持 4 个）**

### 阶段 6：浮层面板 / 扩展货架（P0/P1）
- [x] **T6-1** `SystemPromptPanel` 去掉 `PanelShell`，改 `.system-prompt-panel/-scroll/-text/-empty` + `height:min(600px,75dvh)`；CSS 补进 `styles/web-ui.css`。〔P2〕
- [x] **T6-2** 扩展货架改**单一 shelf**（widgets 在前 + status 在后 + `has-widgets`/`has-status`）+ `sanitizeExtensionStatusText` 排序 join + `AnsiText` + `role="status"`；`chat-pane.tsx` 只留一处调用。〔P3/P4/P9/P10〕
- [x] **T6-3（新·P5）** 货架从「消息列表之上」移到 **composer 之下**，与规范的「消息区 → composer → 货架」一致。〔P5〕
- [x] **T6-4** `ExtensionWidgets` 接快照 diff + `is-updating` + 脉冲层；位置三角 SVG；panels 前移；删「N 行」文本。〔P6/P7/P8〕
- [x] **T6-5** 面板挂载形态合并到 T1-3（`position:fixed` 贴顶下拉）。〔P1〕

### 阶段 7：i18n 铺开（**建议最先开工**）
- [x] **T7-1** `settings-host.tsx` 节标签改 `t()`； 的 `title`/`projectHint`；~20 条中文通知。〔I1/I2/I4〕
- [ ] **T7-2** 四个未改造节（模型/技能/扩展包/目录选择器）文案改 `t()`（key 已在语言包）。〔I3〕
- [ ] **T7-3** 侧栏域：`sidebar-pane.tsx`（会话/文件/PiBoat）、`sidebar.tsx`（新会话）、`session-row.tsx`（改名/复制/删除/N 条）、`session-search.tsx`。
- [ ] **T7-4** 中栏域：`composer.tsx`（占位符/流式文案）、`empty-state.tsx`、`suggestion-menu.tsx`、`queue-bar.tsx`、`thinking-row.tsx`、`tool-row.tsx`、`process-group.tsx`、`assistant-turn.tsx`。
- [ ] **T7-5** 右栏域：`file-viewer.tsx`、`file-tabs.tsx`、`code-viewer.tsx`、`diff-view.tsx`、`file-tree.tsx`、`file-explorer-pane.tsx`、`files-pane.tsx`。
- [ ] **T7-6** 收尾：清 `sq` / `hairline-b` / `bg-surface-*` / `text-fg-*` / `elev-panel` 自造类名（改造后的区域）。〔§4.4〕
- [ ] **T7-7** 补 `styles/web-ui.css` 的 `system-prompt-*` / `session-info-popover` 等组件内联样式规则。〔§4.2〕

---

## 7. 验收方法

1. **CSS 差集归零**：`node audit/sel.mjs` 跑 `globals.css`→`web-ui.css`、`settings.css`→`settings.css`。剩余条目**只应**是 `.terminal-*` / `.web-login-*` / `.agents-*` / `:root` / `html` / `*` / `[data-theme=*]` / `html.dark`。
2. **死 CSS 清零**：`node audit/dead.mjs <repo>/packages/ui/src/styles <repo>/packages/ui/src <repo>/apps/web/src`。当前 **115 个零消费**，目标 ≤ 排除域数量（`.agents-*` / `terminal-*` / `web-login-*` / `is-agent`）。
3. **双实例同视口截图对照**：1440 / 1024 × {light, dark, mist, rose, pine}，逐页截：
 - 默认工作区（有会话 / 空态 / 已选目录无会话 / 未信任项目）
 - 侧栏：搜索打开、项目下拉、worktree 下拉、EXPLORER 展开与折叠、文件搜索、变更文件
 - 中栏：空态、流式中、工具行展开（含 diff）、思考行、过程组、排队条、候选浮层（`/` 与 `@`）、输入历史、minimap hover
 - 右栏：源码/预览/差异三模式、图片、音视频、PDF、大文件续拉
 - 设置：4 个节 × 各节详情（模型 provider 详情、skills 详情、plugins 详情）
 - 面板：分支（`U`/`A`/`+N`）、系统、工具（两栏）
 - 扩展货架：widget + status 同时存在
 - 脚本：`audit/shoot.mjs`
4. **反向核对**：不要只对「整页像不像」，必须逐条核对**每条 CSS 规则是否被消费** —— 这是本类审查最大的坑。
5. **i18n 验收**：三语各跑一遍全站截图，**不得出现 fallback 到 key 字符串**（界面出现 `common.skills` 即为失败）；`grep` 全仓不应再有硬编码界面文案；切语言后 `document.documentElement.lang` 同步、刷新保持。
6. **排除项回归（交付前必跑）**：
 ```bash
 grep -rIl "MobileGate\|agents-section\|session-family\|AgentSessionPanel\|provider-usage\|node-pty" packages/*/src apps/web/src
 # 应为零命中
 ```

### 需用户拍板的问题

| # | 问题 | 选项 |
|---|---|---|
| Q1 | 品牌名 | ✅ 已关闭（ADR-0022）：界面品牌与页面标题统一取 `PiBoat` |
| Q2 | 设置节清单 | 规范侧含 Sub-agents 一节；本仓保持 4 节（子代理为排除域）。**确认维持 4 节？** |
| Q3 | 源码高亮库 | ✅ 已关闭（ADR-0029）：沿用 `shiki`（ADR-0009），补双主题（`--shiki-*` 变量 + `[data-theme]`）与 >1000 行降级，不引第二套高亮器 |
| Q4 | 文件查看器模式文案 | 规范侧硬编码英文 `Source / Preview / Diff`；本仓现为「内容 / diff」。**统一走 i18n，还是照英文原文？** |
| Q5 | F6/F7（live watch / load-more） | 二者都**需要先扩后端 + 协议**（`type=watch`、`type=read` 带 offset）。**这轮是否排期后端？** |
| Q6 | DOCX 预览 | 需要后端 DOCX→HTML 转换。**是否排期？** |

---

## 8. 差异等级定义

| 等级 | 含义 | 典型例子 |
|---|---|---|
| **P0** | 结构或信息架构不同 / 整块缺失 → 一眼看出不像 | 侧栏「会话/文件」页签 vs 常驻 EXPLORER、空态换成目录输入卡、ChatMinimap 退化成细条、设置三节没套 SplitView |
| **P1** | 布局或交互不同 → 并排看能看出 | 附件能力缺失、候选浮层形态、分支树缺连接线与徽章、图片预览不是灯箱、文件树位置 |
| **P2** | 视觉细节 → 单看不易察觉，对照能发现 | 间距、字号、圆角、hover 色、图标方向、文案、数字格式 |

---
