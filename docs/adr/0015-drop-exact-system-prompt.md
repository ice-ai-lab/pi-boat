# ADR-0015：纯聊天不做精确系统提示词覆写——systemPrompt 一律按 pi 默认组装

- 日期：2026-09-24
- 状态：已接受（Accepted）
- 关联文档：`docs/03-core-design.md` §2.1（模块表）/ §10.2（遗留）；`docs/06-ui-design.md` §11.2（系统提示词面板）；`docs/07-backend-capability-gap.md` §2 G2-10 / §6 B2 / §9（实现期边界）
- 关联决策：**撤销 G2-10**（精确系统提示词覆写）；沿用 ADR-0010（0.87 对齐）关于 `session.systemPrompt` 语义的结论；与 ADR-0014（一期范围排除）同类，属"有意不做"

## 背景

B2 落地时从既有 Web 实现（pi-web）移植了 `core/src/agent/exact-system-prompt.ts`：一个内联 extension，
在 `before_agent_start` 返回 `{systemPrompt}`，让纯聊天（chat-only）会话的请求头部提示词**等于上下文文件正文**。
配套在 `resourceLoaderOptions` 里设了两个占位符（`systemPrompt: ' '` / `appendSystemPrompt: [' ']`）。

复查（2026-09-24）核对 SDK 0.87.1 源码与上游实现后，发现三件事：

**1. 它买的不是「AGENTS.md 进提示词」，而是「剥掉包装」。**
`buildSystemPromptSections()` 里 `if (contextFiles.length > 0) promptSections.project_context = ...`
**无条件执行**，与工具集是否为空无关。实测 `selectedTools: []` 时 `<project_context>` 照样存在，
只是 `<tools>` 退化成 `(none)`、`<rules>` 少两条。所以这个扩展实际买到的是后者：

```
只留占位符（不覆写）: "␣" + <addendum>␣</addendum> + <project_context>…AGENTS.md…</project_context> + <cwd>/proj</cwd>
加覆写扩展:           AGENTS.md 正文
```

**2. 上游方案的三个部件，本仓只移植了一个。** pi-web 的完整做法是：
① `CHAT_ONLY_RESOURCE_LOADER_OPTIONS` 的占位符 **+ 两个 override**（`systemPromptOverride: () => undefined`、
`appendSystemPromptOverride: () => []`，注释自述"占位符只是用来挡住配置里的提示词文件，override 再把占位符本身抹掉"）；
② 本扩展；③ **状态读取优先 exact prompt**（`exactSystemPrompt?.() ?? agent.state.systemPrompt`，让面板显示实发的那份）。
本仓只抄了 ② —— 于是面板侧从未吃到任何收益，缺 ① 还导致 prompt 里多出一个 `" "` preamble 和空的 `<addendum>` 段。

**3. 留着它反而制造面板的时序差异。** `session.systemPrompt` 的实现是
`buildSystemPrompt(this._runSystemPromptOptions ?? this._baseSystemPromptOptions)`，
而带 `forceSystemPrompt` 的 `_runSystemPromptOptions` **只在 run 期间存在**（run 结束的 `finally` 里清空）。
于是同一个面板：**run 中显示上下文文件原文，空闲时显示带包装的那坨**。
这正是 `docs/06` §11.2 标注的"面板显示值属 B1 遗留实测项、必须真机核对"的真实来源——它不是待验证，而是**时序相关**。

## 决策

**删除该插件，纯聊天不再对系统提示词做任何特殊处理。**

1. 删除 `core/src/agent/exact-system-prompt.ts` 及其在 `core/src/index.ts` 的导出与 `AgentSessionService` 的注册
2. 纯聊天不再设 `systemPrompt: ' '` / `appendSystemPrompt: [' ']` —— 占位符的存在理由自述为"真正的提示词由扩展整份替换"，
   扩展既去，留着只会往 prompt 里塞垃圾。**保留** `noExtensions` / `noSkills` / `noPromptTemplates` / `noThemes`：
   它们的理由是"没有工具可执行、加载了也用不上"，与提示词无关（G2-9 边界不受影响）
3. 系统提示词一律由 pi 按默认结构化段落组装（`preamble` + `tools` + `rules` + `docs` + `project_context` + `cwd`）；
   面板显示的就是 `session.systemPrompt`，**不声称**它是"实际下发的 prompt"
4. 面板三态删掉「为空（工具已禁用）」：`<cwd>` 段无条件写入，该字符串永不为空，这一态不可达

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 补齐 pi-web 的 ①③，保留扩展 | ❌ 放弃 | 收益仅是"逐字"，代价是继续扛一个内联扩展 + 依赖 SDK 内部字段（`_runSystemPromptOptions`）的时序；一期没有任何需要"逐字"的场景 |
| 删扩展但保留两个占位符 | ❌ 放弃 | 产出既非 pi 的默认行为、也非"只有上下文文件"——一段 `" "` preamble + 一个空 `<addendum>`，是两头不靠的中间态 |
| 保留现状（扩展在，面板不用 exact） | ❌ 放弃 | 半成品：对内多一处 SDK 耦合、多一处面板时序不稳，对外零收益 |
| 把 `systemPrompt: ' '` + 两个 override 一起抄过来（只求"不发现配置提示词文件"） | ❌ 放弃 | 那等于用两个 override 把占位符抹掉后**回到 pi 默认**，与直接删掉占位符等价，却多两个概念 |

## 后果

**正面**

- 少一个内联扩展与一处 SDK 内部耦合；面板内容确定（不再随"是否在跑"变化）
- 纯聊天提示词 = pi CLI 的默认行为（`--tools ""` 一类），宿主不再自创形态
- 上游 pi-web 的另一半用途（子代理 profile 的 prompt 替换，`docs/07` §8-4 延后项）将来若有真实用例，
  届时带着具体需求重新引入即可——那时"逐字"是刚需，现在不是

**负面 / 已知风险**

- 纯聊天提示词会带上 pi 的身份段、`<tools>(none)</tools>`、`<docs>` 与 `<cwd>`，并保留
  `<project_context>` / `<project_instructions path="…">` 包装（对"聊天"而言偏噪，但这是 pi 的原样行为）
- **配置里的系统提示词文件会重新被 loader 发现**（`const systemPromptSource = this.systemPromptSource ?? this.discoverSystemPromptFile()`
  —— 占位符原本短路了这一步）。这恢复的是 pi 的默认语义，但确实是行为变更，须写进文档
- 面板显示的是 pi 的结构化渲染结果，**不等于**某次请求实际下发的 prompt（ADR-0010 的结论仍然成立）；
  前端不得把它标成"实际下发"，也不得加版本号/token 估算（docs/06 §11.2）

## 验证记录

```bash
# SDK 行为实测（0.87.1 dist/core/system-prompt.js）
node -e "buildSystemPrompt({cwd:'/proj', selectedTools: [], contextFiles:[AGENTS.md]})"
  → <project_context> 仍在 ⇒ AGENTS.md 的加载与工具集无关
node -e "buildSystemPrompt({cwd:'/proj', customPrompt:' ', appendSystemPrompt:' ', selectedTools: []})"
  → "\" \"\\n\\n<addendum>\\n \\n</addendum>\\n\\n<project_context>…\\n\\n<cwd>\\n/proj\\n</cwd>"   ⇒ 占位符的残留

# 门槛
pnpm turbo run typecheck --filter=@ice-ai/core      → 通过
pnpm turbo run lint build test                      → 15/15 tasks 全绿（core 184/184、server 66/66、protocol 33）
```

> 注：首次跑 `packages/server` 时有 5 个 skills/check 相关用例失败，`git stash` 后同样复现、重跑三次均绿
> ——属**环境相关抖动**（与本次改动无关），不是回归。
