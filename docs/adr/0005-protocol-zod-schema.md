# ADR-0005：protocol 保留 Zod schema 作为类型单一真相源

- 日期：2026-09-20
- 状态：已接受（Accepted）
- 关联文档：`docs/01-overview.md` §3.1 / §5.5；`docs/02-protocol-inventory.md` §1.3 铁律 1、4；AGENTS.md「packages/protocol」

## 背景

M1 协议层成型后出现一次针对 zod 必要性的质疑，依据是一个可验证的事实：**生产代码中没有任何 schema 校验调用**。

现状核查（2026-09-20，全仓 grep，排除 node_modules / dist）：

| 位置 | 消费方式 | 数量 |
|---|---|---|
| `packages/protocol/src/**` | schema 定义 + `z.infer` 派生全部类型 | 13 个文件 |
| `packages/protocol/test/**`、`packages/core/test/**` | `.parse()` / `.safeParse()` 断言 | 34 处 |
| 生产代码（core / server / client / ui 的 src） | schema 校验调用 | **0 处** |

即 zod 当前的实际角色是**类型定义源**与**测试工具**；"运行时校验"能力尚未接线（server 至今仅有 `/api/health`）。质疑由此成立：若永不接线，zod 就只是"带额外样板的类型别名"。

但 schema 已承担三类手写 type 无法表达的东西：

1. **大规模判别联合**：`ClientAgentEventSchema` 29 变体、`SessionEntrySchema` 9 变体、`AgentMessageSchema` 5 角色、`JsonAssistantMessageEventSchema` 12 种子事件（`packages/protocol/src/events/client-agent-event.ts`、`src/domain/session-entry.ts`、`src/domain/message.ts`）
2. **递归结构**：`SessionTreeNodeSchema` 以 `z.lazy` 表达自引用（`packages/protocol/src/domain/session-info.ts:72`）
3. **跨字段约束**：`provider` / `modelId` 必须同时出现或同时缺省（`packages/protocol/src/commands/agent-command.ts:148` 的 `.refine`）

## 决策

**保留 zod**（不改为纯 TS type），同时钉定以下边界：

| 项 | 决策 |
|---|---|
| 单一真相源 | 全部 wire / 领域类型由 schema `z.infer` 派生；禁止手写 type 与 schema 并存 |
| protocol 运行时边界 | 运行时依赖白名单 = `zod`（唯一）；运行时逻辑白名单 = `normalizeToolCalls()` + schema 定义本身。新增白名单外内容须新 ADR |
| 校验位置 | 校验只落边界（见下方计划），核心业务路径不重复校验 |
| 移动端路线 | 维持 §5.5 路线：schema → zod-openapi 导出 OpenAPI 供客户端代码生成，不引第三方生成器 |
| 重审触发条件 | **若 M2 结束时下方三条边界仍未接线校验，本 ADR 应重审**（届时 zod 将确证为纯样板负担） |

### 校验接线计划（三条边界）

| 边界 | 时点 | 做法 |
|---|---|---|
| REST 入参（`/api/*` body / query / params） | 随 M1 路由落地 | schema 校验通过后才进 core；新路由须同时提交入参 schema（并入 AGENTS.md 的「新增路由检查清单」） |
| 会话文件解析（core 读 `.jsonl`） | M1 | 逐行 `FileEntrySchema` 校验，坏行跳过并计数上报，不整体失败——该文件可被旧版本写入或手工编辑，是最需要运行时校验的入口 |
| SSE wire（client 逐帧消费） | M1 | `ClientAgentEventSchema.safeParse` 逐帧校验；失败帧记录后丢弃（不 crash），作为 SDK 事件漂移的运行时探针（与 `PROTOCOL_VERSION` 的非运行时定位不冲突，见 `src/constants.ts:6`） |

## 理由

- **运行时校验在本项目是真实需求而非假设**：server 握有宿主机文件系统全权限（AGENTS.md 路由检查清单）、会话文件是外部可变的输入源、§5.5 的 LAN 接入规划意味着输入不总是可信
- **单一真相源**：类型与运行时形状同源，变体增改只动一处；纯 type 方案要校验就必须手写第二份真相，两份必然漂移
- **测试基建已就位**：34 处 parse 断言已覆盖全部导出 schema 的正 / 负例，接线时 schema 侧零返工
- 上游同类做法佐证：pi SDK 自身在协议层使用 TypeBox（schema 即类型 + 校验 + 文档）

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 纯 TS type，删除 zod | ❌ 放弃 | 失去四样：边界校验、34 处运行时测试断言、OpenAPI / 客户端生成路线、单一真相源 |
| 纯 type + 手写 type guard | ❌ 放弃 | 29 + 9 + 12 + 5 个变体的守卫代码量数倍于 schema，且"新增变体漏改守卫"编译器不可见 |
| 换 TypeBox（上游同款） | ❌ 放弃 | JSON Schema 原生对齐是优点，但全部 schema 需重写，迁移成本 > 收益；zod 生态（zod-openapi）更成熟 |
| 换 Valibot / ArkType | ❌ 放弃 | 体积 / 性能收益在本地工具场景不可感，同样需全量重写 |
| 保留但永不接线（现状延长） | ❌ 放弃 | 由「重审触发条件」兜底——这是需要被消除的临时态，不是稳态 |

## 后果

**正面**

- 类型与运行时形状永远同源，变体增改只动一处
- 边界校验基建齐备（schema 完整 + 测试覆盖），接线成本低
- 保住 §5.5 的移动端代码生成路线

**负面 / 已知风险**

- schema 样板量显著大于纯 type（29 变体事件、5 角色消息）；其校验价值在接线前处于"未兑现"状态——**这是本决策的主要风险，由重审触发条件兜底**
- 承担 zod 大版本升级成本（zod 4 → 5 时需评估）；纯 type 方案无此成本
- 需同步修订既有文档表述：`docs/01-overview.md` §3.1「零运行时依赖」应改为「运行时依赖白名单 = zod」；`docs/02-protocol-inventory.md` 铁律 4「同时给 TS type 与 Zod schema」应改为「type 由 schema 派生」（代码现状即 `z.infer`，此处文档滞后）

## 验证记录

```bash
# 2026-09-20 · 现状核查
rg 'Schema\.(safe)?[Pp]arse' packages --glob '!**/test/**' --glob '!**/dist/**'   → 0 处（生产代码无校验调用）
rg 'Schema\.(safe)?[Pp]arse' packages --glob '**/test/**'                          → 34 处
rg -l "from 'zod'" packages/protocol/src                                           → 13 个文件
rg 'z\.lazy\(|\.refine\(' packages/protocol/src                                    → session-info.ts:72 / agent-command.ts:148
zod 依赖声明                                                                        → 仅 packages/protocol（^4.6.5）
```
