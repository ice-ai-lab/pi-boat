import { z } from 'zod';

/**
 * ⑤ REST 资源——文件系统域（docs/02 §6.6；访问控制语义见 docs/04 §6）。
 *
 * ## 协议级访问控制（不是实现细节）
 *
 * 本服务握有宿主机文件系统全部权限，而威胁模型是"用户浏览器里的任意网页"
 * （ADR-0007）。因此文件域有一条**协议级**规则：
 *
 * > 只有位于 **allowed-roots** 内的路径可读；roots 之外的文件若被某个会话引用
 * > （工具读过的产物，如生成的图片），凭 `sessionId` 可读。
 *
 * `sessionId` 就是这条规则的开关，所以它是协议的一部分而不是内部参数——
 * 少了它，整个文件域要么不可用（全拒），要么就是任意文件读（全放）。
 *
 * allowed-roots 的来源：进程启动时的 cwd（本服务被谁拉起就服务谁）+ 用户经
 * `POST /api/cwd/validate` 显式确认过的目录。**不接受**来自请求的任意路径。
 */

// ---------------------------------------------------------------------------
// §6.6 家目录 / 默认 cwd / 目录选择器
// ---------------------------------------------------------------------------

export const HomeResponseSchema = z.object({ home: z.string() });
export type HomeResponse = z.infer<typeof HomeResponseSchema>;

export const DefaultCwdResponseSchema = z.object({ cwd: z.string() });
export type DefaultCwdResponse = z.infer<typeof DefaultCwdResponseSchema>;

export const CwdBrowseQuerySchema = z.object({
  /** 要浏览的目录；缺省 = 家目录 */
  path: z.string().optional(),
});
export type CwdBrowseQuery = z.infer<typeof CwdBrowseQuerySchema>;

export const BrowseEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  /** 是否可继续下钻（目录且可读） */
  readable: z.boolean(),
});
export type BrowseEntry = z.infer<typeof BrowseEntrySchema>;

export const CwdBrowseResponseSchema = z.object({
  path: z.string(),
  parentPath: z.string().nullable(),
  directories: z.array(BrowseEntrySchema),
  /** Windows 盘符列表；其他平台缺省 */
  drives: z.array(z.string()).optional(),
});
export type CwdBrowseResponse = z.infer<typeof CwdBrowseResponseSchema>;

/** POST /api/cwd/validate —— 选定即加入 allowed-roots（本端点是 roots 的唯一来源） */
export const CwdValidateRequestSchema = z.object({
  cwd: z.string().min(1),
});
export type CwdValidateRequest = z.infer<typeof CwdValidateRequestSchema>;

export const CwdValidateResponseSchema = z.object({
  success: z.boolean(),
  cwd: z.string(),
  projectRoot: z.string(),
  projectKey: z.string(),
});
export type CwdValidateResponse = z.infer<typeof CwdValidateResponseSchema>;

// ---------------------------------------------------------------------------
// §6.6 文件读写
// ---------------------------------------------------------------------------

export const FILE_REQUEST_TYPES = ['list', 'read', 'download', 'meta', 'preview'] as const;
export const FileRequestTypeSchema = z.enum(FILE_REQUEST_TYPES);
export type FileRequestType = z.infer<typeof FileRequestTypeSchema>;

export const FileQuerySchema = z.object({
  type: FileRequestTypeSchema,
  /** 会话引用放行：roots 之外的路径若被该会话引用则可读（type=list 不适用） */
  sessionId: z.string().optional(),
});
export type FileQuery = z.infer<typeof FileQuerySchema>;

/** type=list 的响应（客户端据此渲染文件树/列表） */
export const FileListEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number().optional(),
  modified: z.string().optional(),
  /** 客户端据此选图标与预览方式（由扩展名推出，不进磁盘） */
  kind: z.string().optional(),
});
export type FileListEntry = z.infer<typeof FileListEntrySchema>;

export const FileListResponseSchema = z.object({
  path: z.string(),
  entries: z.array(FileListEntrySchema),
  /** 被忽略的目录名（node_modules / .git …），前端可提示"这些没列" */
  ignored: z.array(z.string()).optional(),
});
export type FileListResponse = z.infer<typeof FileListResponseSchema>;

export const FileMetaResponseSchema = z.object({
  path: z.string(),
  type: z.enum(['file', 'directory']),
  size: z.number(),
  modified: z.string(),
  /** text / image / binary：决定前端走"编辑器预览"还是"下载" */
  category: z.enum(['text', 'image', 'binary']),
  mimeType: z.string().optional(),
});
export type FileMetaResponse = z.infer<typeof FileMetaResponseSchema>;

export const FileReadQuerySchema = z.object({
  sessionId: z.string().optional(),
});
export type FileReadQuery = z.infer<typeof FileReadQuerySchema>;

/** type=read / download 直接回文件字节（Content-Type 由服务端判定），无 JSON schema */

// ---------------------------------------------------------------------------
// §6.6 上传
// ---------------------------------------------------------------------------

export const FILE_UPLOAD_TYPES = ['upload', 'upload-check'] as const;
export const FileUploadTypeSchema = z.enum(FILE_UPLOAD_TYPES);
export type FileUploadType = z.infer<typeof FileUploadTypeSchema>;

/** type=upload-check：上传前的冲突预检（纯 JSON，不传字节） */
export const FileUploadCheckRequestSchema = z.object({
  fileNames: z.array(z.string()).min(1),
});
export type FileUploadCheckRequest = z.infer<typeof FileUploadCheckRequestSchema>;

export const FileUploadConflictSchema = z.object({
  name: z.string(),
  /** 目标已存在 ⇒ 需要用户选 overwrite / skip / rename */
  exists: z.boolean(),
});
export type FileUploadConflict = z.infer<typeof FileUploadConflictSchema>;

export const FileUploadCheckResponseSchema = z.object({
  conflicts: z.array(FileUploadConflictSchema),
});
export type FileUploadCheckResponse = z.infer<typeof FileUploadCheckResponseSchema>;

export const FILE_UPLOAD_CONFLICT_POLICIES = ['overwrite', 'skip', 'rename'] as const;
export const FileUploadConflictPolicySchema = z.enum(FILE_UPLOAD_CONFLICT_POLICIES);
export type FileUploadConflictPolicy = z.infer<typeof FileUploadConflictPolicySchema>;

export const FileUploadResultSchema = z.object({
  path: z.string(),
  size: z.number(),
  /** 冲突策略为 rename 时实际落盘的名字 */
  finalName: z.string().optional(),
});
export const FileUploadResponseSchema = z.object({
  uploaded: z.array(FileUploadResultSchema),
  skipped: z.array(z.string()),
});
export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;

// ---------------------------------------------------------------------------
// §6.6 文件索引（模糊搜索）
// ---------------------------------------------------------------------------

export const FileIndexQuerySchema = z.object({
  cwd: z.string().min(1),
  /** 查询串；缺省 = 全量索引（≤5000 条） */
  q: z.string().optional(),
});
export type FileIndexQuery = z.infer<typeof FileIndexQuerySchema>;

export const FileIndexResponseSchema = z.object({
  files: z.array(z.string()),
  /** 索引被截断（超出上限）；前端可提示"只显示前 N 条" */
  truncated: z.boolean(),
});
export type FileIndexResponse = z.infer<typeof FileIndexResponseSchema>;
