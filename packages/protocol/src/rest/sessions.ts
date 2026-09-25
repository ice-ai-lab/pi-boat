import { z } from 'zod';
import type { ThinkingLevel } from '../constants';
import type { AgentMessage } from '../domain/message';
import type { ModelRef, SessionInfo, SessionTreeNode } from '../domain/session-info';
import type { SessionStatsInfo } from '../domain/state';

/**
 * 会话上下文窗口（`GET /api/sessions/:id` 的 `context` 与 `.../context` 的响应）。
 *
 * ⚠️ **不是** SDK 的 `SessionContext`（它只有 messages/thinkingLevel/model）：
 * 本仓额外下发分页三件（平行数组 `entryIds` + `oldestEntryId` + `hasMore`），
 * 客户端靠它做历史渲染与向上翻页（docs/02 §6.3）。消息已由 core 逐条投影
 * 展开（compaction → 分隔条）并跳过转录 system 消息（与实时路径同口径）。
 */
export interface SessionContextResponse {
  /** 与 entryIds 平行：候选消息中第 i 条属于哪个条目 */
  messages: AgentMessage[];
  entryIds: string[];
  thinkingLevel: ThinkingLevel;
  model: ModelRef | null;
  /** 本页最老条目 id（向上翻页游标 `before`） */
  oldestEntryId?: string;
  hasMore: boolean;
}

/**
 * ⑤ REST 资源——会话域（docs/02 §6.1 列表/搜索 / §6.2 详情与生命周期 / §6.3 分页与惰性加载）。
 * agent 运行时域（/api/agent/*）拆至 ./agent——按 core 双服务边界分域（2026-09-22）。
 * 只定义请求/响应契约，**不导出路径常量**——路由字面量归 server／client 各自持有，
 * 无消费方的常量视同期货（docs/02 §3「不养期货」）。
 */

// ---------------------------------------------------------------------------
// §6.1 会话列表
// ---------------------------------------------------------------------------

/**
 * GET /api/sessions?force=1&projectKey=…（磁盘扫描与运行时注册表合并）
 *
 * - `force=1`：跳过服务端列表缓存（并清空项目解析缓存）。
 *   缓存按**会话目录指纹**（每个 .jsonl 的 size+mtime）失效，因此磁盘侧变动
 *   （其他进程写入、首条消息落盘、改名）会自动命中失效；不需要只靠 force。
 * - `projectKey`：只返回该项目的会话（分组键见 rest/projects）
 *
 * ⚠️ `registryVersion` 只反映**运行时注册表**的结构性变动（create/dispose）。
 * 磁盘扫描侧的变动看 `listFingerprint`（会话目录指纹）——它才回答“列表内容变了吗”。
 *
 * 命名：`listFingerprint` 不叫 `listVersion`/`sessionListVersion`——
 * ① `sessionListVersion` 已于 2026-09-21（`36720e9`）因“名字暗示了它做不到的事”改名为
 *    `registryVersion`（它只是注册表计数器，不反映磁盘侧变化），不要复活那个名字；
 * ② 指纹**无单调性**（文件回退会让它变回旧值），不是版本号，只能比较相等。
 */
export const SessionListQuerySchema = z.object({
  force: z.literal('1').optional(),
  projectKey: z.string().min(1).optional(),
  /**
   * 快路径：跳过**项目解析**（每 cwd 一次 git 子进程）只回会话本身。
   * 结果里 `projectRoot`/`projectKey`/`branch` 缺省——侧栏首次挂载用它先把列表显示出来，
   * 之后再拉全量补上分组（ADR-0008 性能分层的第二级）。
   */
  summary: z.literal('1').optional(),
});
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

export type SessionListResponse = {
  sessions: SessionInfo[];
  /** 运行时注册表版本号：每次 create/dispose +1 */
  registryVersion: number;
  /** 会话目录指纹：磁盘侧内容（会话增删/改名/写入）变化时改变，客户端据此重建列表。
   *  不透明字符串，无单调性（**只比较相等**，不要拿它排序/做差）。 */
  listFingerprint: string;
  runningSessionIds: string[];
  /** 已抑制完成通知的会话（避免轮询刷新期间重复弹通知） */
  completionNotificationSuppressedSessionIds: string[];
};

/** GET /api/sessions/search?q —— q ≤ 200 字符，结果复用列表项渲染 */
export const SessionSearchRequestSchema = z.object({
  q: z.string().max(200),
});
export type SessionSearchResponse = {
  sessions: SessionInfo[];
};

// ---------------------------------------------------------------------------
// §6.2 会话详情与生命周期
// ---------------------------------------------------------------------------

/** GET /api/sessions/:id?force=1 —— 强制全量重读（并做外部写入探测，ADR-0013b） */
export const SessionDetailQuerySchema = z.object({
  force: z.literal('1').optional(),
});

/** GET /api/sessions/:id（tail 默认 50，上限 1000） */
export type SessionDetailResponse = {
  sessionId: string;
  filePath: string;
  info: SessionInfo;
  leafId: string | null;
  tree: SessionTreeNode[];
  context: SessionContextResponse;
  stats: SessionStatsInfo;
  totalActiveMs: number;
  toolNames?: string[];
  /**
   * 外部写入探测结果（ADR-0013b，仅 `force=1` 时做）：为 true 时本进程的 runtime
   * 是用磁盘最新内容重建过的，客户端应重新拉历史（内存态已丢：半截消息、队列）。
   * 非强制读一律缺省（**不在 run 期间换 runtime**，否则会丢流）。
   */
  wrapperRebuilt?: boolean;
};

/** PATCH /api/sessions/:id —— 改名（历史未运行会话直接追加 session_info 行） */
export const SessionRenameRequestSchema = z.object({
  name: z.string(),
});

/** DELETE /api/sessions/:id —— 级联删除全部 subagent 子会话，返回受影响 id */

/** POST /api/sessions/:id/auto-name —— LLM 生成会话名 */
export const SessionAutoNameRequestSchema = z.object({
  /** 生成用的 cwd（决定用哪份项目设置与默认模型）；缺省 = 会话自己的 cwd */
  cwd: z.string().optional(),
  /** 只回名字，不落盘（前端先预览） */
  dryRun: z.boolean().optional(),
});

export type SessionAutoNameResponse = {
  title: string;
  usage?: unknown;
};

// ---------------------------------------------------------------------------
// §6.3 历史分页与惰性加载
// ---------------------------------------------------------------------------

/**
 * GET /api/sessions/:id/context 查询参数：
 * - leafId：从该叶向根回溯（缺省 = 当前 leaf）
 * - before：客户端已有最老条目 id（excludeLeaf 向上翻页；不在会话中/即根 → 空页）
 * - tail：窗口大小（默认 50，上限 1000；只计 user/assistant/压缩分隔条，toolResult 不吃预算）
 * - deferMedia：工具结果图片以占位符下发
 *
 * 行为保证：历史分页不做压缩过滤——压缩前条目照常可翻（compaction 投影为
 * compactionSummary 分隔条，不是翻页终点）；LLM 上下文投影（SDK
 * buildContextEntries）是另一回事，不用于本接口。
 */
export const SessionContextQuerySchema = z.object({
  leafId: z.string().optional(),
  before: z.string().optional(),
  tail: z.number().int().min(1).max(1000).optional(),
  deferMedia: z.boolean().optional(),
});
export type SessionContextQuery = z.infer<typeof SessionContextQuerySchema>;

/** GET /api/sessions/:id/export?inline=1 —— HTML 导出（attachment / inline） */
export const SessionExportQuerySchema = z.object({
  /** inline=1：浏览器内联渲染（预览）；缺省 = 附件下载 */
  inline: z.literal('1').optional(),
});
export type SessionExportQuery = z.infer<typeof SessionExportQuerySchema>;

/** GET /api/sessions/:id/entries/:entryId/thinking?blockIndex —— 全量推理文本 */
export const EntryThinkingQuerySchema = z.object({
  blockIndex: z.number().int().min(0),
});
export type EntryThinkingResponse = {
  thinking: string;
};

/** GET /api/sessions/:id/entries/:entryId/tool-result-image?blockIndex —— 二进制图片（无 JSON schema） */
export const ToolResultImageQuerySchema = z.object({
  blockIndex: z.number().int().min(0),
});
