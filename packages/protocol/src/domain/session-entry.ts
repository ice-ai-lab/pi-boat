import type { SessionEntry } from '@earendil-works/pi-coding-agent';

/**
 * 会话文件条目（`.jsonl` 每行，docs/02 §3.1）。
 *
 * **不重新定义**（ADR-0017）：SDK 会话存储层的形状原样转出——其 `SessionEntry`
 * 联合与本仓此前手写的 11 个成员完全一致（含 `context_edit` / `label` / `usage`）。
 * 时间戳为 ISO 字符串（JSON 行格式，区别于消息内的 epoch 毫秒）。
 */
export type {
  BranchSummaryEntry,
  CompactionEntry,
  ContextEditEntry,
  CustomEntry,
  CustomMessageEntry,
  FileEntry,
  ModelChangeEntry,
  SessionEntry,
  SessionHeader,
  SessionInfoEntry,
  SessionMessageEntry,
  ThinkingLevelChangeEntry,
} from '@earendil-works/pi-coding-agent';

/** 分支命名书签（SDK 未单独导出，按 type 从联合提取） */
export type LabelEntry = Extract<SessionEntry, { type: 'label' }>;

/**
 * 用量条目（SDK ≥ 0.86）：记录不进模型上下文但计费的用量（如 `kind: "cache_warm"`
 * 的 prompt 缓存预热）。**统计必须计入**，否则 token / cost 与 SDK `/session` 不一致。
 *
 * SDK 未从包根单独导出它（成员在 `SessionEntry` 联合里），故按 type 提取。
 */
export type UsageEntry = Extract<SessionEntry, { type: 'usage' }>;
