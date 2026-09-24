# ADR-0012：视觉基准迁到原型 v4，v3 的功能位继承

- 状态：已接受
- 日期：2026-09-24
- 关联：修订 [0010](0010-prototype-faithful-styling.md) 的「原型」指向（v3 → v4）；
  与 [0011](0011-ui-styles-colocation-and-palette.md)（样式承载与表面配色）并行；
  影响 `docs/01-overview.md` §3.1、`docs/04-server-design.md`、`docs/06-ui-design.md` §2/§4/§8/§10/§11、
  `packages/ui/src/`、`apps/web/src/`

## 背景

M1 落地时全仓登记的视觉基准是 `docs/design/piboat-web-v3.html`（docs/01 §3.1、docs/04 §6.6、
`packages/ui/src/index.ts` 包头注释）。此后原型迭代到 v4（`docs/design/piboat-web-v4.html`）：
精简了骨架类名（`.side` / `.head`），并把表面配色对齐 pi-web（ADR-0011 已落到 token）。

按 v4 稿逐项对账时暴露两类问题：

1. **基准登记没跟进**。文档与代码仍写 v3，于是同一份代码在两套口径下得出不同结论：
   v3 口径是 `min-height:24px; max-height:200px`、首组「会话」总标签（`.list-label`）、
   `.day > span:last-child` 右对齐；v4 口径是 **26/168**、每个分组都带日期标签、标签左对齐。
   不对账就发现不了，一换基准全是差异。
2. **v4 静态稿砍掉了 v3 的功能位**：hero（`#heroSlot`，M1 用它承载 cwd 输入）、侧栏折叠、
   侧栏宽度拖拽、底栏版本号、列表运行提示，在 v4 稿里都没有对应标记。

## 决策

1. **`docs/design/piboat-web-v4.html` 是视觉基准**：配色、尺寸、排版、类名以 v4 为准逐项对账。
   文档与代码中所有「基准」表述改指 v4；指向 v3 的引用只在叙述历史时保留。
2. **v4 未画的功能位继承 v3**，但必须按 v4 的 token（配色 / 圆角 / 字号 / 间距）重绘，
   不另造第三种形态：hero、侧栏折叠、侧栏宽度拖拽、底栏版本号 `.ver`、列表运行提示 `.run-hint`。
   「v4 没画」**不构成删除理由**——它们是已定需求（docs/06 §8.5、§11.3 行 1）。
3. **对账以「实际生效值」为准**：CSS 与内联 `style` 冲突时内联优先——`Textarea` 的
   `minHeight` / `maxHeightPx` 曾把 `.input-card textarea` 的 26/168 覆盖成 24/200。

## 本轮对账落地（2026-09-24）

- `Textarea` 自动增高 **24–200px → 26–168px**（对齐 v4 `.input-card textarea` + `fit()` 上限）
- 输入框 placeholder → `继续对话…（Enter 发送，Shift+Enter 换行）`（v4 原文，覆盖 Composer 默认值 +
  会话页 + 新会话 hero 三处；会话页「未运行」态保留自己的提示文案，那是真实状态而非原型文案）
- 侧栏品牌角标 `M1` → `v4`
- 会话列表：首组改用与 v4 一致的日期标签（不再用 v3 的「会话」总标签）；修掉
  `.day > span:last-child` 把「只有一个 span」的日期标签推到右侧并降级为 `--t4`/500 的问题，
  右对齐只落在 `.run-hint` 上
- 删除零消费者、且 v4 已无对应选择器的 `primitives/button.tsx`（`Button` / `IconButton` /
  `buttonVariants`）与 `primitives/segmented-control.tsx`（v3 的 `.preset-seg` / `.view-tabs` 在 v4 中不存在）；
  `cva` 作为 ADR-0009 既定栈保留，随 M2 的 shadcn 组件启用（「不养期货」）

## 后果

- 视觉对账有唯一基准；v3 退为「功能位的历史出处」。
- 仍未闭合的一处：侧栏 `.model-chip` 的文案是 `模型 · M2` 占位（v4 稿写的是具体模型名），
  M2 接入真实模型名后回填——现在写死具体模型名会变成假状态。
- 基准再次变更（如 v5）时必须重跑本轮对账清单，而不是局部改样式。
