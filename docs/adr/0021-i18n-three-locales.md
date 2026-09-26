# ADR-0021：i18n 三语（en / zh-CN / ja）——推翻 ADR-0019 决策 1「zh-CN 单语」

- 日期：2026-09-26
- 状态：已接受（Accepted）
- 关联文档：`docs/08-web-frontend-plan.md` §5-14 / §5.1 / §6-1、`docs/06-ui-design.md` §1（ui 容器例外）、ADR-0019 决策 1（本 ADR 推翻该条）、ADR-0020 §4（本 ADR 修订其 mermaid 一句）
- 关联决策：**修订 ADR-0019 决策 1**（i18n 范围）与决策 3（ui 容器例外增第 5 处）；ADR-0019 其余决策不变

## 背景

ADR-0019 决策 1 定的是「zh-CN 单语：文案集中 `ui/src/locales/zh-cn.ts` 一处，不引 i18n 框架」。
该决策**从未落地**：`ui/src/locales/zh-cn.ts` 不存在，全仓 ~70 个文件（`packages/ui/src` 约 60 个 +
`apps/web/src` 约 12 个）的界面文案仍是硬编码中文，且没有任何 `t()` / `useI18n`。

同时 ADR-0020 把视觉基准改为 pi-web 后，组件层按「照抄 pi-web 结构与样式」推进——pi-web 的每个组件
都写着 `t("…")`。没有 i18n 基建时照抄组件只能把 `t()` 换回硬编码串，等于**每搬一个组件就制造一次
反向重写**；反过来先落 i18n 则照抄组件可以直接保留 `t()`。

2026-09-26 的对齐审查（`docs/09-frontend-alignment-audit.md`）据此提出该决策应被推翻，
并经用户确认范围：**要做 i18n，三语 = 中文 / 英文 / 日语**。

## 决策

**引入 pi-web 的 registry 式 i18n，做 `en` / `zh-CN` / `ja` 三语；Provider 放 `packages/ui`。**

1. **架构照抄 pi-web**（体量很小，纯新增、零冲突）：
   `packages/ui/src/i18n/types.ts`（`Locale` / `TranslationParams` / `LocalePlugin`）、
   `registry.ts`（`getLocalePlugin` / `getSupportedLocales` / `resolveBrowserLocale`）、
   `format.ts`（`interpolateMessage` / `translateMessage` 回落链「当前语 → en → 返回 key」 /
   `formatRelativeTime` / `formatUpdatedTime`）、`i18n-provider.tsx`（`I18nProvider` / `useI18n`）。
   `localStorage` key 统一为 `pi-locale`；写 `document.documentElement.lang`；hydrate 前强制 `en` 防首帧闪烁。
2. **语言包 `messages/{en,zh-CN,ja}.ts`，每语 612 key**：
   - `en` / `zh-CN` 自 pi-web 拷贝（pi-web 的 en / zh-CN key 集合实测一致，可直接当契约基线）；
   - **扣除排除域 89 key**（`agents.*` 42、`agentSwitcher.*` 14、`subagent.*` 1、
     `sidebar.expandSubagents`/`collapseSubagents`/`agentRunning` 3、`terminal.*` 11、`auth.*` 10、
     `providerUsage.*` 7、`appUpdate.*` 1），即 701 − 89 = 612；
   - `ja` 为**全新撰写**（pi-web 无此语言）。pi-web 的第三语是 `zh-TW`（繁中），**本次不采纳**：
     用户确认的范围就是三语，且把 `zh-TW` 直译成日文会得到大量非本地化文本。
3. **`resolveBrowserLocale` 补 `ja` / `ja-*` → `ja` 分支**（pi-web 原版只识别 `en*` / `zh*`）；
   未注册的 `zh-*` 变体（如 `zh-TW`）仍回落 `zh-CN`，与 pi-web 的「任意 zh-* → zh-CN」口径一致。
4. **Provider 放 `packages/ui`（登记为第 5 处 ui 容器例外，docs/06 §1）**：
   与「容器型组件依赖 client hooks」的四处理由不同——它是全局语言 Context，约 60 个 ui 组件要直接
   调 `t()`，走 props 下传 612 个 key 不可行。这与 `theme.css` 放 ui、由宿主写 CSS 变量同源。
   `apps/web` 顶层包 `<I18nProvider>`（`WorkspacePage`，需覆盖设置浮层）。
5. **语言选择器**在「设置 → 通用 → 语言」节，逐字照抄 pi-web（`role="radiogroup"` +
   `.settings-language-options/-option/-radio/-radio-dot/-label/-code`；CSS 早已在 `styles/settings.css`）。
   语言标签：`English` / `简体中文` / `日本語`。
6. **验收口径**（可执行断言，`packages/ui/test/i18n.test.ts`）：
   ① 三语 key 集合完全一致；② 各 key 的插值占位符一致（`files.conflictSummary` 的 `countSuffix` 豁免）；
   ③ `resolveBrowserLocale` 对 `ja` / `ja-JP` / `zh-CN` / `zh-TW` / `en-US` 的解析。
7. **修订 ADR-0020 §4 的一句**：该条把「mermaid 缩放」列为排除域示例，与审查结论不符——
   **mermaid 不在排除域**（排除域只有移动端 / 子代理 / 终端 / Provider 用量 / 登录 / PWA）。
   本次已把 `.katex*` 与 `.mermaid-block*` / `.mermaid-zoom-*` 规则补进 `styles/pi-web.css`。

## 备选方案

| # | 被否决的备选 | 理由 |
|---|---|---|
| 1 | 维持 zh-CN 单语（ADR-0019 决策 1 原样） | 该决策从未落地；且与「照抄 pi-web 组件」直接冲突（组件的 `t()` 无处可去） |
| 2 | 做 4 语 `en/zh-CN/zh-TW/ja`（完全覆盖 pi-web + 加日语） | 用户确认的范围是**三语**；`zh-TW` 包虽可白拿，但会多出一个未被要求的面 |
| 3 | 拿 pi-web 的 `zh-TW` 包占位改写成 `ja` | 繁中直译成日文会得到大量非本地化文本，是不可接受的假交付 |
| 4 | `useI18n` 放 `packages/client`、由 web 用 props 下传 | client 是框架无关入口（不得 import React）；且 612 key 逐层下传不现实 |
| 5 | 每个组件接一个 `translate` prop（pi-web 的 `ToolDefinitionsPanel` 就是这种） | 60 个组件 × 61x key 的接线成本远高于一个 Context；pi-web 自己也是 Context |

## 后果

**正面**

- 照抄 pi-web 组件时可直接保留 `t()`，不再产生「搬进来又改写」的反向工作
- 一门新语言 = 新增一个 `messages/<id>.ts` + registry 加一行，成本线性
- 三语 key/占位符一致性有测试锁；`en` 与 zh-CN 的 key 集合与 pi-web 同源，未来对齐上游可 diff

**负面 / 已知风险**

- `ja` 无上游可 diff：后续 pi-web 新增 key 时，`en`/`zh-CN` 可追平、`ja` 必须补译（漏译会被一致性测试拦下）
- 改造面大：~70 个文件的硬编码文案要换成 `t()`；结构改造（T1–T7）会重写其中一部分，故本次**先落基建**，
  文案替换与结构改造同批进行（避免同一处文案写两遍）
- ui 包多了一个需要 Provider 的依赖：单测若不是渲染型（如 `i18n.test.ts` 直接测纯函数）不受影响；
  渲染型测试需要包 `<I18nProvider>`

## 验证记录

- 代码：`packages/ui/src/i18n/{types,registry,format,i18n-provider}.tsx` +
  `packages/ui/src/i18n/messages/{en,zh-CN,ja}.ts`（各 612 key）；`packages/ui/src/index.ts` 导出；
  `packages/ui/test/i18n.test.ts`（三语 key/占位符一致性 + locale 解析 + 相对时间含 `ja`）；
  `apps/web/src/pages/workspace-page.tsx` 顶层 `<I18nProvider>`；
  `packages/ui/src/settings/general-section.tsx` 的语言节；`apps/web/src/services/use-chat-appearance.ts`（T5-3 联动）
- 质量门：`pnpm turbo run build lint test` 全绿（2026-09-26）
- 文档：`docs/08` §5-14 / §5.1 / §6-1 已同步标注「ADR-0021 推翻原决策」；
  `docs/06` §1 已登记第 5 处 ui 容器例外
