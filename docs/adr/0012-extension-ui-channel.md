# ADR-0012：扩展 UI 双向通道——采用 SDK RPC 面的 9 个 method，不引入 TUI 渲染

- 日期：2026-01
- 状态：已接受（Accepted）
- 关联文档：`docs/02-protocol-inventory.md` §3.5（**本文修正其成员表**）、§4（命令通道）、§5.1（事件通道）；`docs/03-core-design.md` §10；`docs/07-backend-capability-gap.md` §2 G2-4、§6 B2
- 关联决策：ADR-0007（无凭据 → 事件流不带 header，扩展 UI 只能走既有两条通道）；ADR-0014（终端能力不做——**本条决定不引入 TUI 渲染依赖，与之保持一致**）

## 背景

扩展要通过 UI 与人交互（选一个选项、确认一次破坏性操作、输入一段文本、报一条通知）。
`docs/02` §3.5 把这条通道登记为「10 种 method + 自定义 UI」并「随 M2 再定」，形状一直没定。

开工前核对了 0.87.1 的两层接口，发现**两者不是一回事**：

1. **`ExtensionUIContext`（扩展看到的宿主接口）** 很大，且大量成员是 TUI 专属：
   `onTerminalInput` / `setWorkingMessage` / `setWorkingVisible` / `setWorkingIndicator` /
   `setHiddenThinkingLabel` / `setFooter` / `setHeader` / `addAutocompleteProvider` /
   `setEditorComponent` / `getToolsExpanded` / `setTheme` …，以及
   **`custom(factory)`——它的参数是 `pi-tui` 的 `Component` 工厂，浏览器无法渲染**。
2. **`RpcExtensionUIRequest`（RPC 模式实际过线的成员）只有 9 个**，**没有 `custom`**：
   `select` / `confirm` / `input` / `editor` / `notify` / `setStatus` / `setWidget` / `setTitle` / `set_editor_text`。

更关键的是：**SDK 自己的 RPC 模式（`modes/rpc/rpc-mode.js`）已经给出了这套接口的参考实现**——
TUI 专属成员逐个 no-op 并写明原因；`custom()` 直接 `return undefined`；`setWidget` 只透传**字符串数组**，
**工厂函数形态被忽略**；`pasteToEditor` 退化为 `setEditorText`；`getEditorText` 返回 `""`（同步方法无法等 RPC）。

也就是说：**「不实现 `custom`」不是本仓的妥协，而是 RPC 模式自身的边界**。这直接取消了「是否引入 `pi-tui`」这个问题。

## 决策

**按 SDK 的 RPC 面实现，不多不少。**

### 支持的 9 个 method

| method | 请求载荷 | 应答 |
|---|---|---|
| `select` | `{title, options[], timeout?}` | `{value}` / `{cancelled}` |
| `confirm` | `{title, message, timeout?}` | `{confirmed}` / `{cancelled}` |
| `input` | `{title, placeholder?, timeout?}` | `{value}` / `{cancelled}` |
| `editor` | `{title, prefill?}` | `{value}` / `{cancelled}` |
| `notify` | `{message, notifyType?}` | 无（fire-and-forget） |
| `setStatus` | `{statusKey, statusText?}` | 无（`statusText` 缺省 = 清除该项） |
| `setWidget` | `{widgetKey, widgetLines?, widgetPlacement?}` | 无（缺省 = 清除该项） |
| `setTitle` | `{title}` | 无 |
| `set_editor_text` | `{text}` | 无 |

- 事件通道下发 `extension_ui_request`（**id 由 SDK 生成**，宿主原样回传）
- 命令通道回收 `extension_ui_response`，三种形状：`{id, value}` / `{id, confirmed}` / `{id, cancelled: true}`
- **`extension_ui_input` 不存在**（`docs/02` §4 曾登记它，属误记，随本文删除）
- **`custom` 不在协议里**：core 侧的 `ExtensionUIContext.custom()` 直接返回 `undefined`（与 RPC 模式一致）

### 宿主必须自己补的两件事（SDK 不兜）

1. **默认超时**。`timeout` 是**扩展自己传的**（`ExtensionUIDialogOptions.timeout`），不传就没有超时；
   而 `editor` 的 RPC 载荷**根本没有 `timeout` 字段**。所以宿主必须给所有阻塞型请求加一个服务端默认超时，
   到期以 `{cancelled: true}` 收尾 —— 否则扩展可以永久挂在 `await` 上。
2. **会话终止时清账**。`session_shutdown` / dispose / SSE 全断时，把该会话所有未决请求一次性以
   `{cancelled: true}` 结清，不能留悬挂 Promise。

### TUI 专属成员的处置（照 RPC 模式的语义逐个落地）

- `onTerminalInput` → 返回空退订函数
- `setWorking*` / `setHiddenThinkingLabel` / `setFooter` / `setHeader` → no-op
- `addAutocompleteProvider` / `setEditorComponent` / `getEditorComponent` → no-op / `undefined`
- `getEditorText` → 返回宿主侧的编辑器文本快照（宿主自己跟踪），不是 `""`（Web 有真实编辑器，比 RPC 模式能做得更好）
- `pasteToEditor` → 走 `set_editor_text`
- `setWidget` 的**工厂函数形态** → 忽略（只支持字符串数组，与 RPC 模式一致）
- `theme` / `getAllThemes` / `getTheme` / `setTheme` / `getToolsExpanded` / `setToolsExpanded` → 只读默认值 / 失败返回

### widgets 与 status 的状态面

- 两者都是**按 key 覆盖**的集合，`undefined` = 清除；随 `AgentState.extensionStatuses` / `extensionWidgets` 快照下发
- 宿主侧要按 **key 代际**管理：同一 key 被连续设置时，旧的一版作废（避免异步渲染竞态把旧内容写回）
- `reload` / runtime 替换后必须清理（清空并向下发清除通知），否则会留下已卸载扩展的残留挂件

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| **A. 全量 10 method（含 `custom` 的服务端 headless TUI 渲染）** | ❌ 放弃 | 需要引入 `pi-tui` + 一套固定网格/ANSI 渲染通道（有实现先例：固定 92×40 的 headless TUI）。但这与「终端能力一律不做」的技术栈取向冲突，且**收益为零**：RPC 模式本身就不支持 `custom`，扩展在 RPC 模式下不会走这条路 |
| **C. 最小集（`notify` + `select`/`confirm`）** | ❌ 放弃 | `input` / `editor` 是常见需求（扩展要一段文本/多行输入）；少实现 4 个成员省不下多少，却让一批扩展残缺 |
| **D. 不做通道** | ❌ 放弃 | 依赖 `ui.*` 的扩展会普遍挂住或超时，「扩展」这条产品线等于不可用 |
| 把 `ExtensionUIContext` 的 TUI 成员也照搬成 Web 语义（自创形状） | ❌ 放弃 | 会与 SDK 的 `mode: "rpc"` 契约分叉；扩展按 `mode` 分支行为，自创语义会让它误判宿主能力 |

## 后果

**正面**

- 形状有 SDK 背书（就是它自己的 RPC 面），不存在「我们发明了一套只有自己认得的 UI 协议」
- **不引入 `pi-tui`**，与终端能力的排除保持一致，依赖面不变
- `docs/02 §3.5` 的成员表得到修正（10 → 9，删 `custom` 与 `extension_ui_input`）

**负面 / 已知风险**

- 使用 `ui.custom(...)` 的扩展在本产品里**静默失效**（拿到 `undefined`）。这是 RPC 模式的既定行为，
  但必须在文档里写清（AGENTS.md：命名不得暗示它做不到的事）——不能对外宣称「支持扩展自定义 UI」
- 默认超时是本仓自加的语义，与 TUI 的「一直等」不同：扩展若依赖长时间等待用户，会拿到 `cancelled`。超时值需可配置并写进文档
- `setWidget` 的工厂形态被忽略，扩展只看到字符串数组形态生效
- `getEditorText` 的返回值取决于宿主快照的同步时机，可能滞后于用户最后一次输入（同步方法本质上无法等 RPC）

## 验证记录

待 B2 落地时补：9 个 method 的往返（含 `undefined` 清除语义）、阻塞型请求的默认超时与 `cancelled` 收尾、
`session_shutdown` 清账、widgets 按 key 覆盖与 reload 清理、`custom()` 返回 `undefined` 而不挂起。
