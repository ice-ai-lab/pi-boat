import type {
  SessionContext as SdkSessionContext,
  SessionEntry as SdkSessionEntry,
  SessionInfo as SdkSessionInfo,
} from '@earendil-works/pi-coding-agent';
import type { ThinkingLevel } from '../constants';
import type { AgentMessage } from './message';

/**
 * 会话列表项、树与上下文（docs/02 §3.3）。
 *
 * **不重新定义**（ADR-0017）：基础字段全部来自 pi-coding-agent，本文件只表达
 * **两处真实分歧**，不复制字段清单：
 * 1. 时间戳：SDK 用 `Date` 对象，wire 必须可 JSON 化 ⇒ 覆盖为 ISO 字符串
 * 2. PiBoat 扩展：`relation` / `projectRoot` / `projectKey` / `branch` / `isWorktree` /
 *    `transient` / `revision`（服务端合并磁盘扫描与运行时注册表后下发，docs/02 §6.1）
 */

/** wire 层模型引用（`provider/modelId`）；形状即 SDK `SessionContext['model']` 的非空形态 */
export type ModelRef = NonNullable<SdkSessionContext['model']>;

export const SUBAGENT_SESSION_STATUSES = [
  'starting',
  'queued',
  'running',
  'completed',
  'failed',
  'aborted',
  'interrupted',
] as const;
export type SubagentSessionStatus = (typeof SUBAGENT_SESSION_STATUSES)[number];

/** 会话关系：fork 仍为顶层列表项；仅 subagent 形成父子树 */
export type SessionRelation =
  | { kind: 'fork'; originSessionId?: string }
  | {
      kind: 'subagent';
      parentSessionId: string;
      profile?: string;
      description?: string;
      status: SubagentSessionStatus;
    };

export type SessionInfo = Omit<
  SdkSessionInfo,
  // allMessagesText：SDK 供搜索用的全文拼接（可达 MB 级），不上 wire
  'allMessagesText' | 'created' | 'modified'
> & {
  /** 覆盖 SDK 的 Date：wire 上是 ISO 字符串 */
  created: string;
  modified: string;
  relation?: SessionRelation;
  /** 项目分组键（Windows 大小写/分隔符不敏感归一），服务端计算 */
  projectRoot?: string;
  projectKey?: string;
  /** git worktree 检出信息 */
  branch?: string;
  isWorktree?: boolean;
  /** 内存会话尚未落盘（本进程新建、还没有任何条目写进 .jsonl） */
  transient?: boolean;
  /** 会话文件指纹（G2-6 详情视图缓存键）；仅详情/单会话读下发，列表不带 */
  revision?: string;
};

/**
 * 会话树节点条目（wire 投影，ADR-0023）。
 *
 * **为什么不直接用 SDK 的 `SessionEntry`**（ADR-0017 的显式例外）：树只用来做分支导航，
 * 而 SDK 条目的 `message` 里带着 thinking / 工具参数全文 / 工具结果与内联图片——本机 2.2 MB
 * 的会话里树占 2.2 MB（457 节点、平均 4.8 KB），而客户端只用 id / 判别字段 / 角色 / 40 字预览。
 * 同一份正文在 `SessionContext.messages` 里已经发过一次。
 */
export type SessionTreeEntry = {
  id: string;
  /** SDK 条目判别字段（`message` / `compaction` / `model_change` / `custom` / …） */
  type: SdkSessionEntry['type'];
  /** 仅 message 条目：角色 + 标签文本（≤40 字预览；空文本按角色回退） */
  message?: { role: AgentMessage['role']; text: string };
};

/** 会话树节点：`children` 嵌套即父子关系（不重复发 parentId），`entry` 是上面的投影条目 */
export type SessionTreeNode = { entry: SessionTreeEntry; children: SessionTreeNode[] };

/**
 * 会话上下文：messages 与 entryIds 为平行数组（下标一一对应），
 * 供前端做"消息 ↔ 条目"互查；`thinkingLevel` 按协议枚举收窄。
 */
export type SessionContext = Omit<SdkSessionContext, 'messages' | 'thinkingLevel'> & {
  messages: AgentMessage[];
  thinkingLevel: ThinkingLevel;
  entryIds: string[];
  /** 向上翻页：当前窗口最老条目；hasMore=true 时可用 before=oldestEntryId 取更早历史 */
  oldestEntryId?: string;
  hasMore: boolean;
};
