# ADR-0029：源码高亮统一复用 shiki——双主题经 CSS 变量下发，ui 不订阅宿主主题

- 日期：2026-09-29
- 状态：已接受（Accepted）
- 关联文档：`docs/09-frontend-design-checklist.md` §5.4 F5 / §7 Q3 / T4-4、`docs/06-ui-design.md`（组件与样式口径）、
  ADR-0009（前端栈：`shiki` 为唯一高亮器）、ADR-0020（视觉基准 = 统一 Web 设计规范）、
  ADR-0028（组件级 CSS 就近模块化）
- 关联决策：**关闭 `docs/09` §7 Q3（源码高亮库选型）**；不改视觉口径，只补三处未接线的高亮

## 背景

`docs/09` §5.4 F5 记录「无高亮」的三处：`CodeViewer`、`DiffView`、工具执行面板。
同时 §7 Q3 挂着选型问题：设计规范侧用 `react-syntax-highlighter`（Prism `vs`/`vscDarkPlus`），
而本仓 ADR-0009 已定 `shiki` 为唯一高亮器，且聊天 markdown 代码块**已经在用**它。

即：缺的不是库，是**接线**。若要照规范侧换库，会得到两套高亮器与两套主题定义，
违反 ADR-0009 与「简单优先」。

另一个隐含约束：`packages/ui` 是纯展示包，**不依赖宿主框架**，而主题（`data-theme` + `html.dark`）
由 `client/view-models/theme.ts` 落到 `<html>`，React 侧订阅在 `apps/web`。
若高亮结果要与主题联动，ui 不能去 import 宿主的主题 store。

## 决策

**只读高亮一律复用 `shiki`；颜色以 `--shiki-light`/`--shiki-dark` 内联变量下发，
取哪一套交给 `[data-theme="dark"]` 的 CSS 决定。**

1. **不引编辑器库**。`CodeMirror`/`Monaco` 只在需要编辑、补全、折叠、多光标时才划算，
   本仓三处都是只读展示，引入即过度工程且体积与「ui 纯展示」定位冲突。
   规范侧的 `react-syntax-highlighter` 不采纳（第二套高亮器 + 运行时正则高亮，准确度低于 TextMate）。
2. **高亮模块收敛到 `packages/ui/src/highlight/`**（原 `chat/code-highlight.ts` 上移，跨域复用）：
   - `code-highlight.ts`：懒加载 highlighter + 语言懒加载 + 失败静默退化；出口两个——
     `highlightToHtml()`（聊天代码块，整块 HTML）与 `highlightLines()`（行号表格/补丁，逐行 token）；
   - `use-highlight.ts`：`useHighlightLines()`（异步就绪前返回 `null`，调用方画纯文本）；
   - `highlighted-text.tsx` / `highlighted-code.tsx`：token → `<span>`（有行号/无行号两种用法）；
   - `highlight.module.css`：**唯一的取色规则**（`.token` 与 shiki 自带 `.shiki` 两处）。
3. **双主题走 shiki 的 `themes` + `defaultColor: false`**：shiki 把两套色写成
   `--shiki-light`/`--shiki-dark` 行内变量，不写行内 `color`。于是
   `[data-theme="dark"] .token { color: var(--shiki-dark) }` 一句即可切主题 ——
   **高亮结果与主题无关**（切主题不重算），ui 也不必订阅宿主主题。
4. **降级口径**：>1000 行不做高亮（纯文本，`MAX_HIGHLIGHT_LINES`）；语言未知、shiki 加载失败、
   语言包加载失败，一律静默回落纯文本，**不允许**因高亮失败而报错或空白。超大文件仍保留既有 5000 行截断。
5. **工具面板的语言口径**（只有形态可判定的才高亮）：`argsText` 一律按 `json`；
   `output` 按工具名——`read` 用标题里的文件路径推断、`bash` 用 `bash`、`edit` 用 `diff`，
   其余（`grep`/`find`/`ls` 的表格文本）保持纯文本。
6. **语言 id 沿用 `client` 的 `getLanguageFromPath()`**（`ts`/`md`/`bash` 这类 shiki 别名），
   本包不再自持映射表；别名解析由 shiki 负责，测试锁住（`highlight.test.ts`）。

## 备选方案

- **换 `react-syntax-highlighter`（规范侧）**：与 ADR-0009 冲突，变成两套高亮器 + 两套主题定义；
  规范侧的主题名（`vs`/`vscDarkPlus`）还要再映射到本仓 `data-theme` 口径。
- **CodeMirror 6（只读模式）**：~300KB+ 且要自写主题适配，收益仅为「以后可能要编辑」——
  本仓没有编辑文件的需求（编辑器是外部 IDE），属「以后可能需要」的期权，明确不做。
- **JS 侧解析主题（`MutationObserver` 读 `data-theme` / 从宿主传 `theme` prop）**：
  前者让 ui 观察 DOM，后者要层层透传；都不如让 CSS 变量取色。
- **高亮结果按主题缓存两份**：切主题时重算整文件 token，大文件会卡；CSS 方案无此开销。

## 影响

- **正面**：四处（聊天代码块 / 源码查看器 / 补丁视图 / 工具面板）共用一套高亮与一套主题口径；
  暗色模式下高亮不再亮底（原先 `chat/code-highlight.ts` 硬编码 `github-light-default`，是既有 bug）；
  零新增依赖。
- **代价**：首次用到某语言会按需拉取 shiki 的语言 chunk（fine-grained，单语言数十 KB~数百 KB，
  不落首屏）；`chat/code-highlight.ts` 的引用路径变更（`../highlight/code-highlight`）。
- **未做**（仍挂在 `docs/09` T4-4 后半）：行号列几何（固定 48 宽 + `data-line-number`）。
- **测试口径**：`packages/ui/test/highlight.test.ts` 锁语言别名可加载 / 双主题变量齐备 / 降级返回 `null`；
  `code-viewer-highlight.test.tsx` 锁接线（就绪后颜色落到 span，`language: null` 时保持纯文本）。
