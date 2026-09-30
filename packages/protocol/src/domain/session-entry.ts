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
