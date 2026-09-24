# ADR-0011：ui 样式按组件就近拆分，表面配色对齐 pi-web（修订 ADR-0010 的承载方式）

- 日期：2026-09-24
- 状态：已接受（Accepted）
- 关联：`docs/adr/0010`（本 ADR 修订其「单文件逐字移植」的承载方式；类名体系、
  不引 preflight、签名细节清单均维持不变）· `docs/06-ui-design.md` ·
  配色参考站点 http://localhost:30141/（pi-web）

## 背景

ADR-0010 落地后，全部组件样式集中在两个巨型全局文件：
`styles/prototype.css`（741 行）+ `styles/additions.css`（567 行）。实践中暴露三个问题：

1. **样式与组件分离**：改一个组件要在两个大文件里全文搜索规则，归属靠人脑记忆；
2. **单独导出组件样式不可用**：组件样式只存在于全局聚合文件，把组件拆去别处时样式带不走；
3. **「逐字对账」价值衰减**：`additions.css` 已是事实上的第二来源，单文件对账的前提（与设计稿
   一一对应）随组件分叉逐渐稀释。

同期产品决定把**表面三层配色对齐 pi-web**（参考站点默认主题）：亮色纸白基底 + 浅灰面板，
暗色中性深灰；设计稿 `docs/design/piboat-web-v4.html` 已先行同步。

## 决策

| 项 | 值 |
|---|---|
| 令牌 | `styles/tokens.css` 成为唯一字面色来源（亮/暗两个变量块）；表面三层取 pi-web：亮 `#ffffff` / `#f5f5f5` / `#eeeeee`，暗 `#1a1a1a` / `#242424` / `#222222`；其余签名（暖调 hairline、靛蓝、纸墨字体）保持 v4 |
| 组件样式 | **与组件 tsx 同目录**（如 `chat/composer.css`、`inspect/file-dock.css`、`primitives/popover.css`、web 端 `components/sidebar.css`），由 `packages/ui/theme.css` 与 `apps/web/src/index.css` 统一 `@import` 聚合 |
| 聚合顺序 | ui 侧（theme.css）在前，web 侧（index.css）在后——保持原 `prototype.css` → `additions.css` 的后置覆盖级联语义 |
| 全局层 | `styles/` 只留三个全局文件：`tokens.css`（令牌）/ `utilities.css`（`@utility` + 滚动条）/ `base.css`（全局 reset + 跨组件共享小件：ico 尺寸、`svg.chev`、`.mini-btn`、`.shimmer`、共享动画帧 `rot/pulse/pop-in/shim`） |
| 死规则 | `.caret`、`.tok-*`（含仅其使用的 `@keyframes blink`）无任何 tsx 消费者，随拆分移除；`--c-*` 高亮 token 保留作清单（shiki 当前走内联色） |
| 构建 | **不变**：tsc 直出 dist、`exports` 仅 `.` 与 `./theme.css`；组件 css 经 theme.css 相对 `@import` 进入同一次 Tailwind 编译，不引入逐组件 css 导出 |

## 理由

1. **样式跟组件走**：找规则、删组件、复制组件都是单点操作；「单独导出」时样式天然可携。
2. **级联语义不变**：聚合顺序复刻原文件先后关系，拆分是纯搬家 + 令牌改值，视觉除配色外零变化
   （构建 + 175 测试全绿验证）。
3. **简单优先**：不做 tsx 内 `import './x.css'` 的逐组件导出——tsc 不处理 css，需要 ambient
   声明 + 构建复制 + exports 展开三个新概念，换一个当前不存在的用例。

## 被否决的方案

| 方案 | 否决理由 |
|---|---|
| 组件 tsx 内 import 自身 css + 构建复制进 dist | 见理由 3；等真出现「跨应用复用单组件」的第二个用例再上 |
| 维持两个巨型全局文件 | 对账价值已被稀释，维护成本持续上升（背景 1–3） |
| 组件样式改用 CSS Modules / Tailwind 重写 | 等于再次「重画」，正是 ADR-0010 否决过的路 |

## 后果

### 正面
- 规则就近、单文件 < 200 行；新组件自带样式，评审时样式归属一目了然
- 对账单元从「两个巨型文件」变为「设计稿 ↔ tokens.css + 各组件片段」，签名细节清单仍在 `docs/06 §2`

### 负面 / 风险与对策
- 「逐字移植」不再以单文件形式成立：设计稿演进需同步到多个文件——签名细节以 `docs/06 §2`
  清单为准，逐项核对
- 聚合入口漏 `@import` 新文件会静默丢样式——新增组件时评审对照目录清单
- 跨组件共享动画帧收敛在 `base.css`，组件 css 引用其 `@keyframes` 属跨文件依赖（各文件已注释标明）
