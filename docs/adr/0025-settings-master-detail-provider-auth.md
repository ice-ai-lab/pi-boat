# ADR-0025：设置面板主从化——恢复「Web 内管理 API Key」与 provider 用量查询（部分取代 ADR-0014 §2）

- 日期：2026-09-27
- 状态：已接受（Accepted）
- 关联文档：`docs/04-server-design.md` §3.3、`docs/10-frontend-parity-audit.md`（G2 设置主从 / §179 用量面板）、`docs/06-ui-design.md`
- 关联决策：**部分取代 ADR-0014 §2**（登录排除中的「API Key 写入」与「用量查询」两项）；不改变 ADR-0007 安全三闸与 ADR-0011③ 联网纪律

## 背景

设置浮层的模型 / 技能 / 插件三节此前是**单列平铺列表**，与 参考实现 的主从布局（左侧清单 + 右侧详情 +
底部操作条）不一致，且能力上缺一截：没有 provider 维度的 API Key 管理、没有用量 / 余额展示、
插件包没有状态 / 版本 / 已解析资源等详情。用户明确要求按 参考实现 的三张截图改造（2026-01 会话）。

这与 ADR-0014 §2 的两项排除冲突：

1. 「在 Web 里填 API Key」被排除（模型凭据只经 models.json 原文或本机 pi CLI）
2. `POST /api/provider-usage/query`（余额查询）「依赖凭据来源，默认不做」

ADR-0014 当时就写明了恢复成本：**「若日后只想恢复『在 Web 里写 API Key』，加回 api-key 两个方法即可，其余不动」**。
本次正是沿这条低成本路径恢复，OAuth 登录流（`/api/auth/login` 的 SSE 交互、device-code、callback server）**仍不提供**。

## 决策

**1. 恢复 API Key 管理与用量查询，端点收进模型域（不走 `/api/auth/*` 命名）。**

- `GET /api/models/auth-providers`：可用 API Key 登录的 provider 清单。**本地读**；provider 支持哪些
  鉴权方式只读 `provider.auth`（SDK 定义），不按 id 硬编码；models.json 来源的 provider（source 带
  `models_json_*`）不进清单——它们已经在面板的自定义 provider 段里直接编辑
- `PUT /api/models/api-key` + `DELETE /api/models/api-key?provider=`：写 / 删
  `~/.pi/agent/auth.json`。写走 provider 自己的 `auth.apiKey.login()` 拿标准凭据（它知道 key 怎么
  归类），**不**调 `ModelRuntime.login()`——后者持久化后会做一次不设上限的目录联网刷新，慢网络下
  会把保存请求挂住（参考实现 同坑实证）。删除只删 `api_key` 型；OAuth 凭据回 `type_mismatch`
- `POST /api/models/usage`：用量 / 余额查询。provider 白名单 + **官方 origin 校验**（provider 的
  baseUrl 必须与该 provider 的官方用量端点同源，防自定义端点泄漏 key）；用户点「刷新」才联网
  （ADR-0011③ 同口径）

安全三闸不变：这些端点无凭据语义，仍受 Host / Origin / Sec-Fetch-Site 三闸保护；写盘只碰
`~/.pi/agent`（服务自己的配置目录，路由检查清单 §3.3 同口径）。

**2. OAuth 登录流维持排除。** 清单里 `supportsOAuth` 只是展示位；需要 OAuth 的 provider 引导用户去
本机 pi CLI。协议与 core 均未引入 SSE 登录通道。

**3. core 新增 `proper-lockfile` 依赖**（`@ice-ai/core` 唯一新增运行时依赖）：auth.json 的读改写
与 pi 的 AuthStorage 共用同一把文件锁，并发登录 / 删除不会互相覆盖。这是 参考实现 同款实现。

**4. 技能 / 插件 / 模型三节改主从布局**（对齐 参考实现 `ModelsConfig` / `SkillsConfig` / `PluginsConfig`，
复用已在库的 `Config*` 原语与 `.config-*` CSS；i18n key 仅补 `providerUsage.*` 等 20 余条）：

- 模型：左侧 provider 清单（已配置 API Key 的 provider + models.json 自定义 provider + 原文入口 +
  「添加 Provider」选择器），右侧 API KEY 详情（状态 / 换 key / 断开 / 用量 / 可见模型开关）或
  自定义 provider 紧凑编辑；底部保存条写整份 models.json（可见范围引擎不变，ADR-0011）
- 技能：左侧按作用域分组的清单（状态点 = 是否允许模型自动调用）+「添加技能」，右侧详情或安装面板
- 插件：左侧独立扩展 + 按作用域分组的包清单（状态点按 status 着色）+「添加插件」，右侧包详情
  （动作行 / 信息栅格 / 已解析资源）；底部 totals + 检查更新 + 刷新
- `PluginsResponse` 升级：包增加 `status`（loaded/installed/missing/disabled）、`version`、
  `packageName`、`counts`、`resources`；独立扩展从 `string[]` 变为结构化对象（name/path/scope/enabled）；
  totals 扩为四类资源计数

**5. 插件 disable 语义改为「保留来源、清空资源过滤器」**（原为「从 settings 摘除来源」）：

- 原语义下「禁用」会让侧栏行直接消失，用户误以为被删了；主从布局里开关必须让行**留在原地**。
  「移除」（连磁盘副本一起删）语义不变，两者形成「停用 ≠ 卸载」的清晰对照
- 迁移兼容：旧语义禁用过的包（来源已从 settings 摘除）在清单里不再出现，「启用」入口兜底为
  `addSourceToSettings` 重新加回

## 后果

- ADR-0014 §2 从「全部排除」变为「仅 OAuth 登录流排除」；`docs/10` §179 的「用量面板 ⛔ 不做」
  与 §412 的「`providerUsage.*` 全部排除域」随之失效（语言包已补回这 7 个 key）
- core 依赖 +1（proper-lockfile ^4.1.2，pi-coding-agent 的既有传递依赖，无新下载面）
- provider 清单与凭据状态依赖 `ModelRuntime.getProviderAuthStatus()` / `listCredentials()`（SDK 0.87.x
  已导出，无版本升级）
- web 宿主向 SettingsHost 多传 `sessionId`（插件「重新加载会话」），无路由 / 布局改动
