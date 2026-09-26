# ADR-0020：前端视觉基准定为统一 Web 设计规范（推翻 ADR-0019 §6「视觉走原型 v3」）

- 日期：2026-01
- 状态：已接受（Accepted）
- 关联文档：`docs/06-ui-design.md`（视觉与交互规格）、`docs/08-web-frontend-plan.md` §2.2/§6、ADR-0019 §6（本 ADR 推翻该条）、ADR-0009（前端栈）、ADR-0002（Vite SPA）
- 关联决策：**修订 ADR-0019 决策 6**（视觉基准）；ADR-0019 其余五项决策不变

## 背景

ADR-0019 §6 定的是「功能按设计规范、**视觉走本仓原型 v3**」（`docs/design/piboat-web-v3.html`），
理由是「设计规范的手写 CSS 变量体系与本仓 Tailwind v4 + shadcn 不兼容」。

落地到 F0–F5 之后，实际渲染与设计规范明显不同（顶栏品牌条、`--accent:#4176e6`、
0.5px hairline、superellipse 圆角、10px 圆角卡片等）。用户对照两台实例后指出：
**要求的是「组件样式与统一设计规范完全一致」**，不是「页面功能一样、长相另说」。原型 v3 基准作废。

同时复核了 ADR-0019 §6 的技术前提，结论是**该前提不成立**：

- 设计规范本身就是 **Tailwind v4**（顶部 `@import "tailwindcss"` + `@theme {}` 映射），
 组件层用 `bg-bg-panel` / `text-text-muted` / `border-border` 等 Token 类名 + 内联 `var(--…)`，
 与本仓体系同构，不存在「不兼容」；
- 该规范为本仓自有规范，组件结构与样式可直接落地，无第三方许可约束。

## 决策

**视觉基准定为统一 Web 设计规范（的变量体系）；组件层按规范的结构与样式实现。**

1. **Token 层**：`packages/ui/src/theme.css` 以规范的运行变量为唯一真相
 （`--bg/-bg-panel/-bg-hover/-bg-selected/-border/-text/-text-muted/-text-dim/-accent/
 --accent-hover/-accent-contrast/-user-bg/-assistant-bg/-tool-bg/-bg-subtle/
 --chat-content-max-width/-chat-content-font-size/-font-mono`），亮/暗两套取值逐条对齐；
 `@theme inline` 暴露规范类名（`bg-bg-panel` / `text-text-muted` / `border-border` / `font-mono-font` 等）。
2. **遗留别名的处置**：旧 pi-boat 语义名（`--bg-base/--l1..4/--t1..4/--bubble/--pw-*/--code-*` 等）
 与旧 Tailwind 类（`bg-surface-side` / `text-fg-muted` / `border-line-2` …）**保留为指向规范变量的别名**，
 老组件不必一次性改完；**新代码一律用规范名**，别名随组件逐个清理。
3. **组件层按规范的结构与视觉实现**（`docs/08` §2.2 的 B 类口径由「视觉重写」改为「结构对齐」）：
 组件 JSX 结构与内联样式按规范对应实现，公用类收录进
 `packages/ui/src/styles/web-ui.css`（markdown 排版 / 代码块 / 扩展货架 / 文件查看器 / 回到底部按钮等）。
 规范未导出成类名的部分（大量内联 `style`）直接在组件里实现。
4. **排除域不实现**（`docs/08` §5）：终端、登录页、PWA、mermaid 缩放等规范对应部分的 CSS 与组件不引入。
 收录方式为**脚本按选择器提取**：`styles/web-ui.css` ←、
 `styles/settings.css` ←，只按选择器前缀剔除排除域与由本仓持有的部分
 （token → `theme.css`；`html` / `body` / `*` 基础版式 → `apps/web/src/index.css`）。
 `biome.json` 对这两个文件关闭格式化与 `!important` 检查，以保持与规范可直接 diff。
5. **主题模型按同一规范**（修订 ADR-0019 §2 的「light/dark/system 三态」）：
 偏好是一个调色板 id —— `light` / `dark` / `mist` / `rose` / `pine` / `auto`（`auto` 跟随系统），
 `pine` 也属暗色（`isDarkTheme`）；落地写 `data-theme` + `dark` class，`theme.css` 收录三套彩色调色板。
 主题选择器放进设置的「外观」节（`settings-theme-options` + `ThemeIcon`）；
 侧栏底栏为「模型 / Skills / 设置」三按钮（原来的主题循环按钮是 pi-boat 自造，已删）。
 首帧不闪靠 `index.html` 的内联初始化脚本（`THEME_INIT_SCRIPT`），
 一致性由 `apps/web/src/services/theme-init.test.ts` 锁；切换动效用 View Transitions。
6. **功能行为不变**：本次只改视觉与 DOM 结构，不改数据流、命令面、路由与事件折叠
 （唯一例外是让侧栏开关落进中栏工具条、品牌信息落进侧栏底栏——这是规范布局结构本身）。

## 备选方案

| # | 被否决的备选 | 理由 |
|---|---|---|
| 1 | 维持原型 v3 视觉（ADR-0019 §6 原样） | 与用户要求直接冲突；且「不兼容」的技术前提已被证伪 |
| 2 | 整体复用规范的 + | 规范组件耦合其 2 500 行 AppShell 与 2 400 行 `useAgentSession`；本仓已有等价 client 层，重接成本高于只对齐样式 |
| 3 | 一次性删掉全部旧 Token 别名 | 改 100+ 处类名、单次 PR 无法验证；别名成本近零，渐进清理更稳 |
| 4 | 只改配色不改结构（顶栏、卡片形状照旧） | 结构差异（全局页头 vs 中栏工具条）在截图里最显眼，只改色「还是一样的不像」 |

## 后果

**正面**

- 观感统一：同一套变量、同一批圆角/描边/字号/间距，组件片段可直接复用
- Token 收敛到一套，旧原型 `--l1..4` 四档描边、superellipse、10px 卡片等历史形状可随组件清理逐步消失
- 许可路径明确（`docs/08` §2 的复用三分法继续适用，只是 B 类口径变了）

**负面 / 已知风险**

- **混合期**：别名存在期间，同一份 UI 里两套类名并存；清理不彻底会长期留灰
- 规范大量使用内联样式，组件文件行数上升、Tailwind 类名减少（与「简洁优先」有一段张力，取舍点记在此）
- 规范自身仍在演进：以 0.9.1 快照为准，不追上游

## 验证记录

- 代码：`theme.css` 重写为规范变量；新增 `styles/web-ui.css`；`utilities.css` 改为 1px 描边 + 规范滚动条/拖拽手柄；
 `apps/web/src/index.css` body 版式对齐；`workspace-layout.tsx` 去掉全局页头、改为侧栏 + 中栏工具条 + 右栏；
 chat（markdown/代码块/用户气泡/思考行/工具行/过程组/输入卡/候选浮层/排队条/工具条）、
 sidebar（会话行/搜索/项目选择器）、files（页签/查看器工具条）、settings、panels、extension 组件逐批实现
- 质量门：`pnpm turbo run typecheck build test lint` 全绿（2026-01）
- 文档：`docs/08` §6 行 6 与 `docs/06` 视觉基准段落已同步标注「被 ADR-0020 取代」
