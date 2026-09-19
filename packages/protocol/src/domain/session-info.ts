import { z } from 'zod';
import { ThinkingLevelSchema } from '../constants';
import { type AgentMessage, AgentMessageSchema } from './message';
import { type SessionEntry, SessionEntrySchema } from './session-entry';

/**
 * 会话列表项与树（docs/02 §3.3）。
 * SessionInfo 基础字段对齐 SDK 0.85.1 `core/session-manager.ts`，
 * relation/projectRoot/projectKey/branch/transient 为 PiBoat wire 扩展
 * （服务端合并磁盘扫描与运行时注册表后下发，docs/02 §6.1）。
 */

/** wire 层模型引用：只投影 provider/modelId，SDK Model 完整定义不泄漏出 core */
export const ModelRefSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
});
export type ModelRef = z.infer<typeof ModelRefSchema>;

export const SUBAGENT_SESSION_STATUSES = [
  'starting',
  'queued',
  'running',
  'completed',
  'failed',
  'aborted',
  'interrupted',
] as const;
export const SubagentSessionStatusSchema = z.enum(SUBAGENT_SESSION_STATUSES);
export type SubagentSessionStatus = z.infer<typeof SubagentSessionStatusSchema>;

/** 会话关系：fork 仍为顶层列表项；仅 subagent 形成父子树 */
export const SessionRelationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fork'),
    originSessionId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('subagent'),
    parentSessionId: z.string(),
    profile: z.string().optional(),
    description: z.string().optional(),
    status: SubagentSessionStatusSchema,
  }),
]);
export type SessionRelation = z.infer<typeof SessionRelationSchema>;

export const SessionInfoSchema = z.object({
  path: z.string(),
  id: z.string(),
  /** 会话启动时的工作目录；旧会话为空串 */
  cwd: z.string(),
  /** session_info 条目里的用户命名 */
  name: z.string().optional(),
  created: z.string(),
  modified: z.string(),
  messageCount: z.number(),
  firstMessage: z.string(),
  relation: SessionRelationSchema.optional(),
  /** 项目分组键（Windows 大小写/分隔符不敏感归一），服务端计算 */
  projectRoot: z.string().optional(),
  projectKey: z.string().optional(),
  /** git worktree 检出信息 */
  branch: z.string().optional(),
  isWorktree: z.boolean().optional(),
  /** 内存会话尚未落盘 */
  transient: z.boolean().optional(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

/** 会话树节点（对齐 SDK SessionTreeNode + PiBoat 压缩/分支预览扩展） */
export const SessionTreeNodeSchema: z.ZodType<SessionTreeNode> = z.lazy(() =>
  z.object({
    entry: SessionEntrySchema,
    children: z.array(SessionTreeNodeSchema),
    label: z.string().optional(),
    labelTimestamp: z.string().optional(),
    /** PiBoat 扩展：已被压缩吞并的条目 id（UI 高亮"此段已压缩"） */
    compressedEntryIds: z.array(z.string()).optional(),
    /** PiBoat 扩展：未走分支的预览文本 */
    branchPreview: z.string().optional(),
  }),
);
export interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
  labelTimestamp?: string;
  compressedEntryIds?: string[];
  branchPreview?: string;
}

/**
 * 会话上下文（对齐 SDK SessionContext + PiBoat 分页扩展）：
 * messages 与 entryIds 为平行数组（下标一一对应），供前端做"消息 ↔ 条目"互查。
 */
export const SessionContextSchema = z.object({
  messages: z.array(AgentMessageSchema),
  entryIds: z.array(z.string()),
  thinkingLevel: ThinkingLevelSchema,
  model: ModelRefSchema.nullable(),
  /** 向上翻页：当前窗口最老条目；hasMore=true 时可用 before=oldestEntryId 取更早历史 */
  oldestEntryId: z.string().optional(),
  hasMore: z.boolean(),
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

/** SessionContext.messages 的元素类型直通（避免 z.infer 循环引用） */
export type ContextMessage = AgentMessage;
