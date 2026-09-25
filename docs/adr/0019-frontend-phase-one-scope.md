# ADR-0019：前端一期范围与复用策略——对齐 pi-web 页面功能（六项执行决策）

- 日期：2026-09-27
- 状态：已接受（Accepted）
- 关联文档：`docs/08-web-frontend-plan.md`（实施规划本体：功能盘点 / 复用三分法 / 三包目录 / F0–F5 批次 / 差异清单）；`docs/05-client-design.md`、`docs/06-ui-design.md`（client / ui 设计稿）；ADR-0002（Vite SPA）、ADR-0009（前端栈）、ADR-0014（一期排除域）
- 关联决策：**修订 `docs/06` §3 与 §11.3 行 4**（深色主题「M1 不支持」的时点结论，其余取向不变）

## 背景

一期后端已全部交付（`docs/07` §1），前端（client / ui / web）开工前需要把「对齐 pi-web 页面功能」落到
可执行的排期。规划本体在 `docs/08`：以 pi-web 源码快照（npm 0.9.1，~28 700 行前端）为基准的功能盘点、
复用三分法、三包落位与 F0–F5 批次。其中六个分叉**跨越多份文档、且容易被后续会话重新提出**，
本文把它们固化为决策记录并写明推翻代价。六项均由用户于 2026-09-27 确认。

总纲（随本文一并生效，细则见 `docs/08` §1/§2/§5）：**一期范围 = pi-web 页面功能全集 − ADR-0014 排除域**
（差异清单 15 项，前端不得自行补回）；**复用三分法** = A 类纯逻辑直接移植（测试先行）、
B 类组件移植行为与结构但视觉按本仓原型 v3 重写、C 类排除域与服务端域不移植。

## 决策

### 1. i18n：zh-CN 单语，不引框架 ✅

文案集中 `ui/src/locales/zh-cn.ts` 一处，组件内不散落硬编码外文；将来要多语从该文件接管。
（pi-web 为 en / zh-CN / zh-TW 三语 + registry 方案；本仓文档不做双语维护——AGENTS.md。）

### 2. 深色主题：随前端 F5 批次交付 ✅（修订 docs/06「M1 不支持」）

light / dark / system 三态；原型 `[data-theme="dark"]` token 块即为此预留（docs/06 §3 的「保留」决策兑现）。
F5 之前的批次不接切换、不做验证。原 2026-09-22 结论「M1 不支持」在 F1–F4 阶段继续有效。

### 3. ui 边界例外登记四处（docs/06 §1）✅

`sidebar/SessionSidebar`、`settings/SettingsPanel`、`files/FileViewer`、`extension/ExtensionWidgets`
四个容器组件可依赖 `@ice-ai/client/react` 的 hooks；第二个真实用途 = `apps/desktop`（M4）复用。
其余组件保持 props 驱动、无 Provider 可测。新增例外仍须逐个在 docs/06 §1 登记。

### 4. G2-11 启动偏好：前端 localStorage 绕过，core 落盘不做 ✅

「下次新建继承上次选择」（model / thinking / cwd）由 `apps/web` 的 startup-preferences
（localStorage）实现，与 pi-web 同法。core 落盘（`setDefaultModelAndProvider()`）**不做**；
G2-11 保持非阻塞缺口（`docs/07` §2/§3.4/§4/§9 已同步标注）。

### 5. URL 形态：单路由 `/` + `?s=<sessionId>` ✅

React Router v7 库模式单路由，当前会话以 `?s=` 持久（对齐 pi-web 的 searchParams 模式，
与 tab-session / workspace-memory 配合）；设置与顶部面板均为浮层，不占路由。

### 6. 视觉基准：功能对齐 pi-web、视觉走本仓原型 v3 ✅

「一样的页面功能」不含像素对齐——pi-web 的手写 CSS 变量体系与本仓 Tailwind v4 + shadcn 不兼容，
且 docs/06 既定视觉基准为 `docs/design/piboat-web-v3.html`（hairline / superellipse / #4176E6）。
复用一律指**行为、交互与逻辑**。

## 备选方案

| # | 被否决的备选 | 理由 |
|---|---|---|
| 1 | 引 pi-web 的 i18n registry 全量移植三语 | 三语是 pi-web 的增量负担；本仓文档已定不做双语，UI 单语与之一致 |
| 2 | 深色维持「M2 再说」 | 原型 dark token 已完整、pi-web 三态现成，推迟无收益反留悬案 |
| 3 | ui 全哑组件、props 由 web 装配 | web 层装配面膨胀；四处容器件在 web 与 desktop 两宿主复用是真实需求 |
| 4 | G2-11 一并补 core 落盘 | 增加后端改动与测试面；localStorage 方案已满足「记住上次选择」，换浏览器丢偏好可接受 |
| 5 | `/session/:id` 路由化 | 与 tab-session / workspace-memory 的多页签记忆冗余，两套真相 |
| 6 | 视觉也对齐 pi-web | 须推翻原型 v3 与 docs/06 全部 token 映射，成本最大、收益为零 |

## 后果

**正面**

- 前端开工前无未决分叉；`docs/08` 从提案生效为排期依据（F0–F5）
- 15 项差异清单 + 本文，排除域前端不回流的防线与 ADR-0014 同构
- 深色主题从「悬案」变为 F5 明确交付项

**负面 / 已知风险**

- 单语意味着 UI 文案硬编码中文；将来出海须从 `zh-cn.ts` 一处接管（不引框架的代价）
- 深色进 F5，若原型 dark token 有对比度缺陷会在验收后期暴露（缓解：token 照抄原型，F5 专项验证）
- ui 例外四处是对「不取数」边界的松动，存在例外扩散风险（防线：逐个登记 + 第二用途论证）
- G2-11 前端绕过意味着清浏览器存储 / 换浏览器丢偏好（pi-web 同款行为，可接受）

## 验证记录

- `docs/08`（头部状态、§6 回填、§8）、`docs/06`（§1 例外登记、§3 深色、§11.3 行 4）、
  `docs/07`（G2-11 共四处）、`docs/01`（§7.1 下一步）与本索引已同步
- 纯文档变更，不触代码，无需跑测试
