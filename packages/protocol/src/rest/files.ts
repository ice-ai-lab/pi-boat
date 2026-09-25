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
 *
 * ## 为什么本文件几乎全是纯类型（ADR-0017）
 *
 * 入参（query / body）用 zod：server 用 `safeParse` 校验后才进 core。
 * 出参只是**类型**：出参没有运行时校验的消费方，schema 属第二份定义。
 */

// ---------------------------------------------------------------------------
// §6.6 家目录 / 默认 cwd / 目录选择器
// ---------------------------------------------------------------------------

/** GET /api/cwd/browse 入参 */
export const CwdBrowseQuerySchema = z.object({
  /** 要浏览的目录；缺省 = 家目录 */
  path: z.string().optional(),
});
export type BrowseEntry = {
  name: string;
  path: string;
  /** 是否可继续下钻（目录且可读） */
  readable: boolean;
};

export type CwdBrowseResponse = {
  path: string;
  parentPath: string | null;
  directories: BrowseEntry[];
  /** Windows 盘符列表；其他平台缺省 */
  drives?: string[];
};

/** POST /api/cwd/validate —— 选定即加入 allowed-roots（本端点是 roots 的唯一来源） */
export const CwdValidateRequestSchema = z.object({
  cwd: z.string().min(1),
});
export type CwdValidateResponse = {
  success: boolean;
  cwd: string;
  projectRoot: string;
  projectKey: string;
};

// ---------------------------------------------------------------------------
// §6.6 文件读写
// ---------------------------------------------------------------------------

/** type=list 的响应（客户端据此渲染文件树/列表） */
export type FileListEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  /** 客户端据此选图标与预览方式（由扩展名推出，不进磁盘） */
  kind?: string;
};

export type FileListResponse = {
  path: string;
  entries: FileListEntry[];
  /** 被忽略的目录名（node_modules / .git …），前端可提示"这些没列" */
  ignored?: string[];
};

export type FileMetaResponse = {
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  /** text / image / binary：决定前端走"编辑器预览"还是"下载" */
  category: 'text' | 'image' | 'binary';
  mimeType?: string;
};

/** type=read / download 直接回文件字节（Content-Type 由服务端判定），无 JSON 形状 */

// ---------------------------------------------------------------------------
// §6.6 上传
// ---------------------------------------------------------------------------

/** type=upload-check：上传前的冲突预检（纯 JSON，不传字节） */
export const FileUploadCheckRequestSchema = z.object({
  fileNames: z.array(z.string()).min(1),
});
export const FILE_UPLOAD_CONFLICT_POLICIES = ['overwrite', 'skip', 'rename'] as const;
export const FileUploadConflictPolicySchema = z.enum(FILE_UPLOAD_CONFLICT_POLICIES);
export type FileUploadConflictPolicy = z.infer<typeof FileUploadConflictPolicySchema>;

// ---------------------------------------------------------------------------
// §6.6 文件索引（模糊搜索）
// ---------------------------------------------------------------------------

export const FileIndexQuerySchema = z.object({
  cwd: z.string().min(1),
  /** 查询串；缺省 = 全量索引（≤5000 条） */
  q: z.string().optional(),
});
export type FileIndexResponse = {
  files: string[];
  /** 索引被截断（超出上限）；前端可提示"只显示前 N 条" */
  truncated: boolean;
};
