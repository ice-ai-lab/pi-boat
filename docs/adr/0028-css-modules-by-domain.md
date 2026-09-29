# ADR-0028：组件级 CSS 按域就近模块化（CSS Modules），全局表只留共享钩子与未接线规范类

- 日期：2026-01
- 状态：已接受（Accepted）
- 关联文档：`docs/06-ui-design.md` §2（视觉基准与 token）、ADR-0020（视觉基准 = 统一 Web 设计规范）、
  ADR-0009（前端栈：Vite + React 19 + Tailwind v4，不引 CSS-in-JS）、`docs/09-frontend-design-checklist.md`（死 CSS 清点）
- 关联决策：细化 ADR-0020 决策 3 的「组件样式落地方式」，不改视觉口径

## 背景

ADR-0020 把视觉基准定为统一 Web 设计规范后，组件级样式集中在两个大文件里：
`packages/ui/src/styles/web-ui.css`（1933 行）与 `styles/settings.css`（1240 行），
由 `apps/web/src/index.css` 全局 `@import`。带来三个实际问题：

1. **定位成本**：改一个组件的样式要在 3000+ 行里搜类名，且类名与组件物理分离；
2. **冲突靠约定**：196 个类名全是全局作用域，只能靠 `config-` / `settings-` / `markdown-` 前缀防碰撞；
3. **死代码不可见**：按 `docs/09` 清点，264 个类里有 115 个零消费方，混在同一文件里无法区分
   「正在用的」与「备着待接线」的规则。

同时，`packages/ui` 是纯展示包（只依赖 protocol/client，不绑宿主框架），
若引入运行时 CSS-in-JS 会与 ADR-0009 的 Tailwind v4 双轨并存、增加心智负担，
且与本仓「简单优先/最少概念」的代码规范冲突。

## 决策

**组件级样式默认就近模块化：每个域目录下放 `*.module.css`，随组件 `import`；
全局表只保留有明确理由的共享钩子与未接线规范类。**

1. **归属与粒度**：按域目录就近放置（`chat/`、`files/`、`extension/`、`panels/`、`settings/`），
   类名去掉域前缀 + camelCase（`.config-panel-root` → `.panelRoot`、
   `.markdown-code-block` → `.codeBlock`）；文件头注释保留「原全局类名」映射，便于对照设计规范。
2. **共享件跨组件复用**：同一域的多个组件共用一个 module 文件、各自 `import`
   （`config-ui.module.css` 由 `settings-ui.tsx` 与各 section 共同引入）；
   同域内两个 module 并存时用别名 import（`skillStyles`），避免键名歧义。
3. **第三方渲染产物保留全局**：react-markdown / remark-gfm / KaTeX 产出的类
   （`.task-list-item`、`.contains-task-list`、`.katex`）在 module 内用 `:global(...)` 匹配，
   这类样式不随组件走。
4. **必须保持全局的例外（逐个写明理由）**：
   - `styles/utilities.css`：全局滚动条等基础 utility；
   - `styles/resize-handles.css`：`panel-resize-handle` / `sidebar-section-resize-handle`
     被 ui 与 web 布局同时消费的跨包原语；
   - `chat/chat-content.css`：`.chat-content` 字号钩子，跨多个面板复用；
   - ~~`*/unwired.css`：未接线规范类~~ —— **2026 当天废弃**：零消费的样式一律直接删除（见「决策 7」）。
5. **构建产物的适配**：`packages/ui` 用 `tsc` 出 `dist`，需在 build 脚本中把 `src/**/*.module.css`
   复制到 `dist` 同路径（`apps/web` 经 `dist` 消费 ui）；ui 无 vite 依赖，自持
   `src/css-modules.d.ts` 声明 `*.module.css`（等价 `vite/client`）。
7. **零消费样式一律删除，不留「备着」的表**（2026 当天追加，取代最初的 `*/unwired.css` 方案）：
   未接线的设计规范类（mermaid 全家、`enabled-models-*`/`models-sidebar-*`、`image-preview-dialog`、
   `markdown-custom/compaction-message`、`compaction-file-*`、frontmatter、`linenumber`/Prism token 修正等
   共约 770 行）已删除；同时清理零消费 token（`--l3/--l4/--t1..t4/--k-*/--seg-*/--pw-*/--bubble/--code-*`、
   `--elev-soft*`、`--sb-w/--rb-w/--chat-w`、`--font-sans` 等 36 个变量与 26 条 `@theme` 映射）、
   零消费 utility 类（`.elev-soft*`、`.hairline-l/-r/-t`）、以及**无任何 CSS 规则的 className 钩子**
   （`file-viewer-shell`、`model-selector is-toolbar`、`sidebar-resize-handle`、directory-picker 的
   `backdrop/panel/list`）。理由：规范类留成全局表反而制造「类已备、组件未接」的假象（`docs/09` 的
   主要问题），需要时按 ADR-0020 的类名口径重新写一遍即可，成本低于长期维护死代码。
   例外：`--font`（字标内联用）、`--l1/--l2/--menu/--accent-weak` 等**仍被消费**的旧别名保留。
6. **host 侧同样模块化**：`apps/web/src/layout/workspace.module.css`（sidebar/right-panel/file-panel 布局）
   随 `workspace-layout.tsx`、`files-pane.tsx` import；其间原本被该表顺带覆盖的 ui 规则已按归属迁回
   （`panel-resize-handle` → `ui/styles/resize-handles.css`、`directory-picker-*` → `ui/settings/directory-picker.module.css`、
   `chat-input-textarea` → `ui/chat/chat.module.css`）。
   迁移后 `apps/web/src/index.css` 只 import ui 的全局表，不再有 host 侧全局样式。

## 备选方案

- **CSS-in-JS（styled-components / emotion）**：运行时开销 + 与 Tailwind 双轨，ADR-0009 已排除，不重开。
- **Zero-runtime CSS-in-JS（vanilla-extract / Panda）**：类型安全更好，但要引入新的构建链
  （vite 插件 + 新增依赖），收益增量有限，与「简单优先」冲突。
- **Tailwind 全量改写（把规范类都翻成 utility）**：等于重写一遍视觉层，且规范里大量
  后代选择器 / 伪元素无法用 utility 直译，diff 不可核查。
- **只拆文件不改作用域（阶段一已做）**：解决定位成本，不解决作用域与死代码可见性；
  作为本次重构的第一步保留（`6d90bf1`），在其之上继续做 modules 化。

## 影响

- **正面**：组件与样式同行同目录；类名作用域隔离，冲突从「靠前缀约定」变为「编译期保证」；
  零消费样式随审计直接删除（不留停放表），新增样式无「写哪个大文件」的选择成本。
- **代价**：类名变更使以类名做断言的测试需改为模块类（如 `_icon_`）；`switch (className)` 式的外部
  查类名需要模块导出；`packages/ui` build 需拷贝 module.css。**已删的规范类在需要时要重写**
  （以 ADR-0020 的类名口径 + 设计规范为源，不做长期停放）。
- **迁移节奏**：按域分批（panels → files → chat/extension → markdown → settings），
  每批独立跑 build / test / lint / typecheck / E2E；`.markdown-body p` 这类第三方产物的后代
  排版仍在 module 内（`.body p`），不拆成两份。
- **风险**：全局规则与 module 规则共存期间的级联顺序靠 `apps/web/src/index.css` 的 import 顺序维持，
  该文件顶部已注明「勿乱序」。
