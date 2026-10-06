# ADR-0034：代码域与文件树参照 DeepSeek Harness 重做——`packages/ui/src/code/` 落地 DSH 原语，Catppuccin 图标方案退役

- 日期：2026-10-06
- 状态：已接受（Accepted）
- 关联文档：`docs/06-ui-design.md` §4（文件面板）/ §5（聊天代码块）、ADR-0009（shiki 唯一高亮器）、
  ADR-0020（视觉基线）、ADR-0028（CSS Modules 按域）、ADR-0029（源码高亮复用 shiki——本 ADR 取代其实现层）
- 第三方出处：DeepSeek Harness（MIT），登记见根 `THIRD_PARTY_NOTICES.md`

## 背景

pi-boat 的聊天代码块、源码查看器与右栏文件树此前是自研的轻量实现：

- 高亮是自研 shiki 适配器（`packages/ui/src/highlight/`，整包 `import('shiki')`、
  双主题经 `--shiki-light/--shiki-dark` 变量），流式期间整个 fence 反复全量高亮，
  语言未知时用户看到的永远是纯文本；
- 文件树视觉参照第三方仓库 `mabaoguo9527/dsh-file-explorer`，图标走 Catppuccin 单色
  精灵图（264K 静态资产 + mask 换色），文件类型辨识度低；
- Diff 视图是行号表格 + 语义软底，与代码块视觉不成体系。

DeepSeek Harness（下称 DSH）开源了同一族组件的成熟实现（MIT）：同步 shiki core +
JS regex 引擎、流式增量高亮（只重分词增量文本、已完成行 DOM 不动）、viewport 激活式
高亮、内嵌全彩文件类型图标集、PathLabel 路径标、DiffBlock。用户定案：文件树、文件查看器、
聊天代码块三者对齐 DSH；DiffView 一并换 DSH 观感；聊天代码块不带行号；文件树行内交互
（git 徽标 / @提及 / 下载 hover 按钮）与 DSH 对齐（收敛，不在行内挂）。

## 决策

**把 DSH `ui-primitives` 中 cordis-free 的原语近乎原样移植到 `packages/ui/src/code/`，
接线层在 pi-boat 侧重写；原自研高亮适配器与 Catppuccin 图标方案整体退役。**

1. **移植范围**（`packages/ui/src/code/`）：`highlight.ts`（同步 shiki core + JS regex
   引擎 + boot 三语法 + 懒语法表 + css-variables 主题）、`use-viewport-highlighting.ts`、
   `code-block.tsx`（三渲染臂：流式增量 / 静止 HTML / 纯文本兜底）、`code-toolbar.tsx`、
   `diff-block.tsx`、`fold-toggle.tsx`、`clipboard.ts`、`file-type-icon.tsx` +
   `code-file-icon.tsx` + `code-file-types.ts` + `code-file-icon-artwork.ts`（内嵌 SVG 表）、
   `path-label.tsx`、`code-highlighting.ts`（`useCodeHighlighter`）、`code-runs.tsx`。
   不移植：`incremental.ts`（markdown 块级增量解析，pi-boat 用 react-markdown，无此层）。
2. **接线层重写，不搬架构**。DSH 的 ui-sidebar-files / documentpreview 是 Cordis 插件
   （store/face/slots），pi-boat 没有也不好造；只移植其逻辑与观感：
   文件树 `packages/ui/src/files/file-tree.tsx` 按 DSH FilesBody 重写（目录优先 +
   `Intl.Collator` 自然序、折叠层缓存条目、失败/空目录/被忽略项各占一行注记、
   FileTypeIcon 彩色行图标）；工具行加 `PathLabel` 根路径。分页加载与 fs watch 不做
   （server 无 watch 端点；沿用手动刷新，期权规则见 AGENTS.md）。
3. **DiffBlock 输入改造**：DSH 原版从 oldText/newText 现算（`diff` 包）；pi-boat 的 diff
   由服务端给 unified patch，故 `buildRows()` 改为解析 patch（复用 client 的
   `parseUnifiedDiff`）——meta 收敛成一行 path、hunk 头变 `⋯` 缝，渲染/折叠/复制口径与
   DSH 一致。旧 `files/diff-view.tsx` 删除。
4. **聊天代码块**：`markdown-view.tsx` 换 code/CodeBlock（卡片头：语言标 + 折行 + 复制），
   `streaming` 从会话层透传（AssistantTurn → ProcessGroup/TextRow → MarkdownView）；
   **不带行号**（与 DSH 聊天 fence 一致，行号只在文件查看器出现）。
5. **shiki 引擎升级**：从整包 `import('shiki')` + 双主题 tokens 模式，改为
   `shiki/core` + `createJavaScriptRegexEngine`（无 oniguruma WASM）+ `@shikijs/langs`
   细粒度语法包（boot 仅 ts/shellscript/json，其余按需 import）+ `createCssVariablesTheme`。
   取色变量从 `--shiki-light/--shiki-dark` 变为 GitHub Light/Dark Default 的
   `--shiki-*` token 色板，落在 `theme.css` 的 `[data-theme]` 块（ADR-0029 的
   「高亮结果与主题无关」原则不变，实现换 DSH 的）。
6. **退役清单**：`packages/ui/src/highlight/`（5 文件）、`chat/code-block.tsx`、
   `files/code-viewer.tsx`、`files/diff-view.tsx`、`files/file-icon.tsx` +
   `apps/web/public/icons/catppuccin/`（264K）。git 徽标 / @提及 / 下载从树行内 hover
   收敛到「变更文件」区块与查看器工具行（DSH 行内无动作，对齐其干净观感）。
7. **许可与出处**：DSH 为 MIT；移植文件在 `THIRD_PARTY_NOTICES.md` 登记来源与改动点。
   artwork 表内的实例 id token 更名 `__ICE_CODE_ICON_INSTANCE__`。

## 备选方案

- **继续自研适配器，只补流式增量**：等于重写 DSH `highlight.ts` 的 600 行且没有测试资产，
  「自持第二份」违背 AGENTS.md 的复用原则。
- **搬整个 documentpreview（分页加载 / 渲染器注册表 / office / excel）**：依赖 Cordis
  面太宽，且 pi-boat 服务端无对应分页与 watch 端点；收益大部分用不上。
- **保留 Catppuccin 精灵图、只换树结构**：文件类型辨识度是本次观感升级的主要来源之一，
  保留即双图标体系并存，维护两套。

## 后续修订（2026-10-06 同日）

落地后用户复核追加四条定案（并入本 ADR）：

1. **配色平面化**：顶条/工具行/查看器标题行统一 38px + 0.5px 发丝线、平面 `--bg` 底；
   激活页签 = 浅灰胶囊（`--bg-hover`）；图标按钮 28×28 圆角 8（DSH `.tool` 同款，弃圆形）；
   查看器路径换 `PathLabel`。
2. **操作行精简**：查看器不显示行数/体积 meta，不出复制/下载/新标签页动作
   （连带删除 `formatFileSize`、`FileContentState.size` 与相关 i18n key）。
3. **markdown 直接渲染**：`.md/.mdx` 默认 `MarkdownView` 渲染；右上角
   「Markdown / 代码 / 纯文本」选择器（DSH documentpreview 的 renderer choice 同概念），
   选择持久在页签（`FileTab.previewMode` + `setTabPreviewMode`）。
4. **文件浏览器不再隐藏体积目录**：`listDirectory` 如实列出 node_modules/.git/dist 等
   （DSH 同口径）；`FileListResponse.ignored` 字段删除；**敏感路径（.ssh/.aws…）仍连
   存在性都不列**——那是 `path-guard` 的安全边界，不在本条范围内。

## 影响

- **正面**：聊天流式代码块不再整块重高亮（增量 token + 行组 DOM 复用）；大文件高亮按
  viewport 激活；未知语言先纯文本、语法懒加载完成后自动补高亮；文件树/查看器/聊天三处
  一套代码视觉；删除 264K 静态图标资产与 ~300 行自研适配器。
- **代价**：新增依赖 `@shikijs/langs`（与 shiki 同版本锁 ^4.4.3）；懒语法首用时有一次
  chunk 拉取；文件树行内不再有 hover 按钮（提及/下载改走查看器，属行为变化，用户已确认）。
- **测试**：`packages/ui/test/code-highlight.test.ts` 锁别名解析 / boot 同步可用 / 未知
  语言降级 / 流式增量=全量；`code.test.tsx` 锁 CodeBlock 三臂静态行为、DiffBlock patch
  映射与折叠、`orderEntries` 排序。
