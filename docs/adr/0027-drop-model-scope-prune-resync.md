# ADR-0027：删除可见范围的 prune / resync 批量修复操作（修订 ADR-0011①）

- 日期：2026-09-27
- 状态：已接受（Accepted）
- 关联文档：`docs/02-protocol-inventory.md` §6.4；`docs/03-core-design.md` §2.3；`docs/04-server-design.md` §3.3；`docs/07-backend-capability-gap.md` §2 G2-2 / §3.3
- 关联决策：**修订 ADR-0011①**（原决策要求提供 `op:'prune'` / `op:'resync'` 两类显式修复操作）；沿用 ADR-0006 / ADR-0017（形状进 protocol，SDK 类型复用）

## 背景

ADR-0011① 落地时给了「可见范围」两条批量修复写入（`PUT /api/models/enabled` 的 `op:'prune'` /
`op:'resync'`），设置面板对应两个按钮：**清理无效条目**、**修复改名残留**。它们的判定输入是解析诊断
（`[no-match] No models match pattern "xxx"`）。2026-09-27 复核时实测两件事，结论从「两个修复操作」变为
「一个口径错误 + 一个收益窗口极窄」。

**1. `prune` 的判定口径是错的，而且会把用户的选择永久删掉。**

诊断来自 `resolveModelScopeWithDiagnostics()`，它只匹配**当前鉴权通过**的模型。于是「模型在目录里但
provider 暂时拿不到凭据」与「模型真的不存在」在 warnings 里长得一模一样。实测（临时 agent 目录 + 假 provider）：

```
② 前：配了凭据，两条 pattern 都命中
  patterns      = ["acme/acme-one","acme/acme-two"]
  visible(acme) = ["acme:acme-one","acme:acme-two"]
② 中：只是移除了 apiKey（模型还在目录里，只是不可用）
  catalog(acme) = ["acme:acme-one","acme:acme-two"]   ← 目录里明明还在
  visible(acme) = []
  no-match 警告 = 2
② prune 后
  patterns      = []                                   ← 两条都被删了
  visible 总数  = 0 → 6                                ← 空列表 = 「全部可用」语义反转
```

这正是 ADR-0011「已知陷阱 2」点名的坑（判断"目录里有没有"必须用 `getModels()` 而不是 `getAvailable()`）：
toggle 躲过了，`prune` 没躲过。更糟的是 `prune` **没有** last-model 保护——清空后落盘的 `undefined`
等于「不限制」，把「我只留这两个模型」反转成「全部都放出来」，方向与用户意图相反。

**2. `resync` 能修的场景太窄，且大部分被 toggle 顺手覆盖。**

它只对「完全匹配不到 + 同 provider 下恰好一个 id 以旧 id 为前缀/后缀」的改名生效（实测
`acme/acme-one:high` → `acme/acme-one-0711:high` 确实能修好并保住 `:level`）。但：

- 对某 provider 做**任意一次 toggle** 本来就会重写该 provider 的整段 pattern，顺带丢掉它的死条目；
- `provider/**` 这类 glob 改名自愈；
- 面板列表改为按 `catalog`（完整目录）渲染之后，被改名的模型会以「关闭」状态**留在列表里**，用户看得见、
  点一下就回来了（代价是丢掉 `:level` 钉档）；
- 候选不唯一时它按设计不动，所以真正需要它的时刻还要额外满足"唯一候选"。

**3. 只用面板开关的用户永远看不到这两个按钮有用。** toggle 不产生死条目（它重写该 provider 的整段），
死条目只来自：手写/CLI 写的 `enabledModels`、目录变了配置没变、provider 凭据被移除。这三类里
第一类用户自己知道在改什么，第二类有 catalog 列表兜底，第三类点 `prune` 是**破坏性**的。

## 决策

**删除 prune / resync 两条写入路径及其全部消费者，`PUT /api/models/enabled` 只保留 toggle。**

1. core：删 `model-scope.ts` 的 `prunePatterns()` / `resyncPatterns()`、`config-service.ts::updateEnabled`
   里的 op 分支、`index.ts` 的导出
2. protocol：删 `MODELS_ENABLED_OPS` / `ModelsEnabledOpSchema`；`ModelsEnabledUpdateSchema` 去掉 `op`，
   `providerId` / `modelId` / `enabled` 改为**必填**（缺字段由 Zod 直接 400，不再走 core 的 `InvalidScopeEditError`）
3. server：路由注释与错误映射不变（`last-model` / `project-shadow` 两个 409 保留）
4. ui / web：删 `EnabledModelsBlock` 的两个按钮与 `enabled.onPrune` / `enabled.onResync` 两个 prop、
   SettingsHost 的两处 mutate
5. i18n：删 `models.enabledPrune` / `enabledPruneHint` / `enabledResync` / `enabledResyncHint`（三语各 4 条）
6. 测试：删 `model-scope.test.ts` 的 `describe('model-scope：显式修复操作')`（4 个用例）
7. **保留** warnings 的展示（`enabled.warnings` → 面板提示条）："某条 pattern 现在匹配不到"仍然是有用的信息，
   只是不再提供"一键清理"
8. 顺带修正 `docs/02` 里从未存在过的 `409 reason:'no-enabled-models'`（代码只有 `last-model` / `project-shadow`）

## 备选方案

| 候选 | 结论 | 理由 |
|---|---|---|
| 保留两个按钮 | ❌ 放弃 | 背景 3：日常路径下永不生效；`prune` 还是破坏性的（背景 1） |
| 只删 UI 按钮、保留 API | ❌ 放弃 | 留一个没有消费者的 op 面（ADR 规则：零调用方直接删）；且口径错误的 API 留着迟早被别处调用 |
| 修 `prune` 口径（改用 `getModels()` 判"目录里真的没有"）+ 加 last-model 保护，保留两者 | ⚠️ 放弃 | 能修掉破坏性，但修不掉「收益极低」：toggle 与 catalog 列表已覆盖绝大多数场景，只为"整 provider 消失/裸 id 死条目"保留两条写入路径不划算 |
| 把两者降级到「诊断区」（有 no-match 时才出现的提示 + 单个动作） | ⚠️ 放弃 | 相当于保留能力只换入口；且 `prune` 的口径问题与原方案 3 相同 |
| 让刷新目录后自动 prune/resync | ❌ 放弃 | 违反 ADR-0011「普通操作不得隐式重写未触碰的条目」 |

## 后果

**正面**

- 少两条写入路径与两个按钮、12 条 i18n 文案、core 约 50 行 + 4 个用例；`PUT /api/models/enabled` 的入参从
  "三种 op 的可选字段组合"收敛成一条必填三元组
- **消除一个语义反转的 footgun**：不再存在"把所有条目清空 → 变成全部可用"的路径（toggle 有 last-model 保护）
- 面板与引擎的边界更清楚：**面板只做最小编辑**，"配置和目录对不上"靠 warnings 提示 + 目录列表可见性来消化

**负面 / 已知风险**

- 手写/历史的死条目（尤其**裸 model id**，toggle 不会碰它们）只能手工编辑 `settings.json` 清理
- 模型改名后，`enabledModels` 里的旧 id 仍是死的：模型会以「关闭」状态出现在列表里，需要用户自己发现并重新打开，
  且原来钉的 `:level` 档位丢失（`resync` 是唯一能保住后缀的手段，已放弃）
- 若将来发现"改名后需要保住钉档"成为真实痛点，应新增 ADR 重新引入**仅 resync**（口径不含 `getAvailable()` 陷阱），
  而不是恢复本次删掉的两条路径

## 验证记录

```bash
pnpm turbo run lint test typecheck build   # 24/24 tasks
docs/adr/0027 验证时点用例数：core 208（212 - 4 个 prune/resync 用例）、server 73、ui 19、client 104
```

已核对删除后无残留引用：

```bash
grep -rn "prune\|resync\|MODELS_ENABLED_OPS\|ModelsEnabledOpSchema" \
  apps/*/src packages/*/src packages/*/test | grep -v node_modules | grep -v dist
# → 只剩 protocol 里那句“没有 prune / resync（ADR-0027）”注释
```
