# ADR-0010：前端视觉按原型逐字落地（修订 ADR-0009 的样式面）

- 日期：2026-09-23
- 状态：已接受（Accepted）
- 关联文档：`docs/adr/0009`（本 ADR 修订其「样式」一项）· `docs/06-ui-design.md` · 视觉基准 `docs/design/piboat-web-v3.html`

## 背景

M1 落地时，`packages/ui` 用 Tailwind 工具类「重写」了原型 `docs/design/piboat-web-v3.html` 的视觉：
token 抽到 `theme.css`、布局用工具类、图标用 lucide 映射、markdown 另抄一份 `chat.css`。
验收时发现成品与原型差距明显——字体、markdown 排版、组件间距与圆角、图标轮廓、整体布局
（三栏退成两栏、无 minimap / 宽度把手 / 浮层 / 深色主题）都对不上。

根因不是「漏了几个类」，而是**用第二套表达重画同一张图**：任何翻译都会引入偏差，而 `docs/06 §2`
早写明原型是「唯一视觉基准」。用户明确要求「完全按原型开发、不要自己重新设计」。

## 决策

| 项 | 值 |
|---|---|
| 样式来源 | **原型 `<style>` 逐字移植** 到 `packages/ui/src/styles/prototype.css`，类名与原型一致（`.sidebar`/`.chat-col`/`.md`/`.disc`/…），作为视觉唯一来源；Tailwind 只留少量工具类（token 与几个新件的布局） |
| Tailwind | 保留 `@theme inline` token 映射与 `utilities.css`，但**不引入 `preflight.css`** ——原型自带 reset；preflight 的 `button{font:inherit}` 会把按钮 `line-height` 变成继承值，原型里是 UA 的 `normal` |
| 图标 | 弃 lucide 映射，改回原型 SVG sprite（`IconSprite` + `<use href="#i-*">`，31 个 `#i-*` 逐字） |
| 字体 | 原型 `--font` / `--mono` 照抄；补上原型引用了却**未定义**的 `--font-noto-mono`（未定义会让整条 `font-family` 在计算值阶段失效，原型里的等宽文本实际不是等宽） |
| markdown | 直接用原型 `.md` / `.tbl` / `.codeblk` / `.diff` 规则；删掉重写的 `chat.css` |
| 深色主题 | **启用**（原型 `[data-theme="dark"]` 变量本就完整），左栏底栏加切换入口；主题持久化 `piboat.theme` |
| 界面骨架 | 前移原型的三栏骨架与交互件：右栏文件 dock（默认收起）、右缘 minimap、内容宽度把手（`--chat-w`）、左右栏拖拽 handle、系统/工具/统计浮层、footer 统计 pills |
| 系统提示词 | 回到原型的 `.pop` 锚定浮层（**修订 `docs/06 §11.2` 的「整宽面板」决定**）；仍删掉原型的「版本 r42 / 约 700 tokens」（前端无 tokenizer，硬凑会误导），改显示真实字符数 |
| 未接入数据 | 右栏文件/变更来自 M3 的 `/api/files` 与 git 域——**只落地结构与样式，显示未接入说明，不放假文件树**（AGENTS.md：没有的东西不画） |

## 理由

1. **偏差是翻译的必然产物。** 同一套间距/圆角/字重，经「原型 → 语义 token → 工具类」两跳后，
   每一跳都可能差 0.5px 或一个断点；逐字移植把可对账性拉回 1:1（类名与原型同名，可直接比对）。
2. **原型是唯一基准，不是灵感来源。** `docs/06 §2` 已把「签名细节」（0.5px hairline、superellipse、
   毛玻璃、细滚动条、sticky 输入卡渐变）列为必须保留项；工具类重写难以保证这些细节不漂。
3. **深色主题照抄零成本。** 变量块早已随原型进入 `theme.css`，入口只是一次 `data-theme` 切换；
   原先「M1 不启用」的取舍在「按原型交付」的要求下不再成立。

## 被否决的方案

| 方案 | 否决理由 |
|---|---|
| 继续用 Tailwind 重写并逐个修偏差 | 已证明偏差面超出可穷举范围；且第二套表达会持续漂移 |
| 改原型去迁就实现 | 用户要求「不要自己重新设计」，原型为基准 |
| 右栏文件树用假数据充数 | AGENTS.md 禁止「暗示它做不到的事」；且会误导验收 |

## 后果

### 正面
- web 与原型可逐类名对账；字体、markdown、布局一次到位
- 深色主题、minimap、宽度把手、浮层等原型的完整体验回到产品里
- 输入卡/折叠行/工具标签等旧件自动继承原型全部规则，不再各自维护微调

### 负面 / 风险
- **两套样式来源并存**：Tailwind 工具类仍可用于新件，容易再次「重画」；规则是「原型已有的组件一律用原型类名」
- 不做 `preflight`，Tailwind 工具类若依赖其默认（如 `border` 宽度/样式）需显式声明；`hairline` 等 utility 已覆盖现有用法
- `prototype.css` 逐字移植，原型自身的瑕疵（如 `.diff` 的 `+/-` 落在行号格）也一并保留；这是「不改原型」的自觉取舍
- 右栏 dock 目前是空壳（M3 数据到位前不产生价值），但结构与样式已就位

### 风险与对策
- **原型 CSS 与 Tailwind 冲突**：`prototype.css` 无 `@layer`，天然压过 Tailwind 的 layer，冲突面可控；
  若将来 Tailwind 工具类需要覆盖原型，需显式提高选择器或改原型（后者须用户确认）
- **Biome 对原型 CSS 报格式/重复属性**：该文件已在 `biome.json` 的 `files.includes` 中排除（逐字移植，不参与格式化）
