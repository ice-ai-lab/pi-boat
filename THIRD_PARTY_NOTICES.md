# Third-party notices

本仓（pi-boat）包含以下第三方资源。分发时须随附对应许可文本。

## DeepSeek Harness（`deepseek-harness`）

- 位置：`packages/ui/src/code/`（代码块/高亮引擎/文件类型图标/路径标/diff 卡片）与
  `packages/ui/src/files/file-tree.tsx` + `file-tree.module.css`（文件树本体）
- 来源：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
  `packages/client/ui-primitives/src`（CodeBlock、CodeToolbar、DiffBlock、FoldToggle、
  FileTypeIcon、CodeFileIcon、code-file-types、code-file-icon-artwork、PathLabel、
  clipboard、icons）、`packages/client/ui-sidebar-files/src/client`（FilesBody 观感与排序/
  注记逻辑）、2026-09 快照
- 改动：DSW 设计 token 换成 pi-boat token（`--ice-code-*`）；DiffBlock 输入从
  oldText/newText 现算改为 pi-boat 的 unified patch 字符串；Tooltip 简化为原生 `title`；
  文案全部走 pi-boat i18n
- 许可：MIT（Copyright DeepSeek AI）。本仓 `docs/adr/0034` 记录了移植决策

## shiki / @shikijs/langs / @shikijs/themes

- 位置：`packages/ui` 依赖（语法高亮引擎与语法包/主题取色参考）
- 许可：MIT
