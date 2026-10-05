# ADR-0032：选择列表钉选设「新会话默认模型 / 默认推理级别」，显式配置写全局 settings.json

- 日期：2026-10-05
- 状态：已接受（Accepted）
- 关联文档：`docs/02-protocol-inventory.md` §6.4；`docs/04-server-design.md` §3.3；`docs/07-backend-capability-gap.md` G2-11；`docs/06-ui-design.md`（常规页）
- 关联决策：**收窄 ADR-0019 决策 4 的边界**（localStorage 只管「自动继承上次选择」）；落实 `docs/07` G2-11 预留的落盘方案（「core 显式调 `settingsManager.setDefaultModelAndProvider()` + 新 ADR」）

## 背景

`~/.pi/agent/settings.json` 里的 `defaultProvider` / `defaultModel` / `defaultThinkingLevel` 是 SDK 建
会话时初选模型与档位解析链的源头（scope pin → 按模型设置 → 全局默认 → SDK 内建默认），pi CLI 的
`/model` 命令写的就是这几个字段。pi-boat 一期没有暴露它们：

- `/api/models` 只读快照里能算出 `defaultModel`（显式默认 ?? 首个可见），但没有任何写入端点；
- 新会话的「沿用上次选择」由前端 localStorage（`piboat:last-model`，ADR-0019 决策 4）承担，**只在本浏览器生效**：
  - 服务端消费者看不见它——自动会话命名的模型回退（`session-read-service` 的「settings 默认模型查不到 →
    回退目录第一个」链，docs/10 BUG-1）读的是 settings.json；
  - 与 pi CLI 不共享：CLI 里 `/model` 设的默认，pi-boat 的 web 端不感知；反过来也一样；
  - 换浏览器 / 清存储即丢失。

`docs/07` G2-11 当时定案「一期不做 core 落盘」，但明确预留了方案：要做的话须 core 显式调
`settingsManager.setDefaultModelAndProvider()`（SDK 从 0.87 起还有 `setDefaultThinkingLevel`）并新增 ADR。
用户 2026-10-05 要求在面板提供「设置默认模型和默认思考强度」的选项，即触发本 ADR。

## 决策

**聊天工具条的模型选择列表加钉选位（选择列表行内标记交互，图标用图钉）：当前默认 = 实心图钉标记；
其它行 hover/focus 出描边图钉按钮，点击即把该模型（或推理级别）存为新会话默认，写入全局
`~/.pi/agent/settings.json`。设置面板常规页不设入口。**

1. **protocol**：`ModelsResponse` 透出 `defaultThinkingLevel`（全局默认档位，未设置 = `'medium'`，
   即 SDK `DEFAULT_THINKING_LEVEL`）；新增 `PUT /api/models/defaults`
   （`ModelsDefaultsUpdateSchema = { cwd?, provider?, modelId?, thinkingLevel? }`，部分更新：
   模型对与档位至少带一，provider/modelId 必须成对）。
2. **core**：`ConfigService.updateDefaults(cwd, input)`——带模型对时 `modelRuntime.getModel()` 校验存在
   （不存在 → `UserInputError`，路由映射 400）；`setDefaultModelAndProvider()` / `setDefaultThinkingLevel()`
   按需调用，走与 `updateEnabled` 相同的 flush / drainErrors 收尾（抽出共享的 `persistSettings()`）。
   **档位先按参照模型能力 `clampThinkingLevel()` 再落盘**（本次设置的模型优先，否则当前默认模型；
   都没有则原样落盘）——全局档位对所有模型生效（解析时各自 clamp），但 settings.json 里存的值必须
   真实可用，否则面板回显会与实际生效分叉。返回刷新后的 `models()` 快照，前端直接接管缓存。
3. **server**：`PUT /api/models/defaults`（写盘目标在 `~/.pi/agent`，新增路由清单 ①—④ 逐条核对过；
   `UserInputError` / `InvalidScopeEditError` → 400）。
4. **ui / web**：`ModelSelector` 两级列表（模型行 / 推理级别行）的 `MenuRow` 增加钉选位——
   **图标用图钉**（「钉住为新会话默认」，实心/描边两态；用户指定用图钉而非星形），
   位置与尺寸（24×24 热区、right 6、hover 提亮为 accent）沿用行内标记布局
   （`chat.saveDefaultModel` = 「使用并设为新会话默认模型」；级别行同款「…默认推理级别」）。
   点击钉选不触发行的选中；接线方（chat-pane）保存成功后 toast，并**把当前会话也切过去**
   （「使用并」语义），同时同步 localStorage last-model（ADR-0019-4 的空态初选优先级高于服务端默认，
   不同步则刚设的默认对下一次新会话不生效）。
5. i18n：`chat.defaultModel` / `chat.saveDefaultModel` / `chat.defaultThinking` / `chat.saveDefaultThinking`
   三语各 4 条（ja 自拟）。

### 与 ADR-0019 决策 4 的边界（不冲突）

ADR-0019 决策 4 管的是「**新会话自动沿用上次选择**」——那是隐式的、跟手的选择记忆，继续由前端
localStorage 承担，本 ADR 不改它。本 ADR 管的是「**显式的全局默认**」——用户在模型列表里钉选指定的值，
落 settings.json，与服务端消费者（自动命名回退、SDK 初选链）及 pi CLI 共享。会话内普通切换模型 / 档位
**仍然不落盘**（G2-11 的原始范围不变）；钉选动作是唯一的落盘入口。

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 继续纯 localStorage（不改服务端） | ❌ 放弃 | 服务端消费者（自动命名回退、SDK 初选链）与 pi CLI 都看不见；多浏览器不同步；两套「默认」来源互相打架 |
| 入口放设置面板「常规」页（初版方案） | ❌ 改为列表钉选 | 选择列表行内标记是唯一入口（用户已确认按此定案）；常规页下拉与列表钉选双入口属重复概念 |
| 拆两个端点（default-model / default-thinking-level） | ❌ 放弃 | 一条 `PUT /api/models/defaults` 部分更新即可；一条端点 = 一组 schema/core 方法/hook，概念更少 |
| 支持「取消设置」（回落首个可见模型） | ❌ 暂不做 | SDK 没有 unset API（`setDefault*` 只有 set）；手写第二份落盘逻辑违反 ADR-0017。回落语义仍可用：不设置时解析链本来就走「首个可见」 |
| 服务端不 clamp，原样存档位 | ❌ 放弃（有意分岐） | 存一个默认模型不支持的档位，面板回显与实际生效分叉；clamp 是 pi-ai 现成函数 |

## 后果

**正面**

- web 与 pi CLI 共享同一份默认：任一侧设置的默认对两侧新会话生效；自动命名回退链读到的是用户真实意图
- 入口即列表行内标记，无新增学习成本；新端点复用 `/api/models` 快照做读、返回值即新快照做写后回显，前端零额外查询
- `persistSettings()` 抽出后，enabled / defaults 两条写盘路径同一收尾（第二个真实用例成立）

**负面 / 已知风险**

- SDK 没有 unset：一旦设置过，回落「首个可见模型」只能再显式选一次（当前默认模型即可）；若成为痛点，
  需向上游要 unset API 或新 ADR 允许手写 settings 字段删除
- localStorage「上次选择」优先级高于服务端默认：用户在聊天里切过模型后，面板设的默认会被覆盖到下一次
  再切换为止——这是 ADR-0019 决策 4 的既有语义，本 ADR 通过保存时同步 `setLastModel()` 缓解，不改变优先级
- `defaultThinkingLevel` 是全局单值：切换默认模型后，旧档位若超出新模型能力会被 clamp 落盘（显示值即真实值）

## 验证记录

```bash
pnpm turbo run build   # 全量构建通过
pnpm turbo run test    # protocol 31 / core 224 / server 75 / client 122 / ui 33 / web 10 全绿
```

- core：`config-service.test.ts` 新增 `updateDefaults()` 用例（未知模型拒绝、部分更新、clamp 落盘、settings.json 三字段）
- server：`server.test.ts` 新增 `PUT /api/models/defaults` 用例（不成对/空对象 400 / 未知模型 400 / 部分更新回新快照）
