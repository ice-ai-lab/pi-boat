import type {
  CwdValidateResponse,
  FileIndexResponse,
  FileListResponse,
  FileMetaResponse,
} from '@ice-ai/protocol';
import { encodeFilePathForApi } from '../files/file-paths';
import { getJson, http } from '../http';

/**
 * 文件域端点（docs/02 §6.6）。路径走通配段（逐段编码，UNC 折进首段，见 file-paths）。
 * 字节流（read/download/preview）用 URL 拼接（<img>/<iframe>/<a download> 直接消费），
 * 不经 Axios——避免把二进制塞进 JSON 通道。
 */

export type FileByteType = 'read' | 'download' | 'preview';

/** 字节流 URL（`sessionId` = 引用放行开关：roots 之外但被该会话读过的文件） */
export function fileByteUrl(
  path: string,
  type: FileByteType = 'read',
  sessionId?: string | null,
): string {
  const params = new URLSearchParams({ type });
  if (sessionId !== undefined && sessionId !== null) params.set('sessionId', sessionId);
  return `/api/files/${encodeFilePathForApi(path)}?${params.toString()}`;
}

/**
 * POST /api/cwd/validate —— **allowed-roots 的唯一写入入口**（docs/07 §3.5）。
 * 文件域（list/read/meta/upload）与 worktree 都受 roots 约束，所以任何"用户选择的
 * 工作目录"都要先过这里：建会话、打开既有会话、在侧栏选项目。
 * 入参路径存在且为目录才 success（失败是业务结果，不是传输错误）。
 */
export function validateCwd(cwd: string): Promise<CwdValidateResponse> {
  return http.post<CwdValidateResponse>('/cwd/validate', { cwd }).then((res) => res.data);
}

/** GET /api/files/<path>?type=list */
export function listDirectory(path: string): Promise<FileListResponse> {
  return getJson<FileListResponse>(`/files/${encodeFilePathForApi(path)}?type=list`);
}

/** GET /api/files/<path>?type=meta */
export function getFileMeta(path: string, sessionId?: string | null): Promise<FileMetaResponse> {
  const params = new URLSearchParams({ type: 'meta' });
  if (sessionId !== undefined && sessionId !== null) params.set('sessionId', sessionId);
  return getJson<FileMetaResponse>(`/files/${encodeFilePathForApi(path)}?${params.toString()}`);
}

/** GET /api/files/<path>?type=read —— 文本内容（二进制请走 fileByteUrl） */
export async function readFileText(path: string, sessionId?: string | null): Promise<string> {
  const res = await http.get<string>(fileByteUrl(path, 'read', sessionId), {
    responseType: 'text',
    transformResponse: [(data: string) => data],
  });
  return res.data;
}

/** GET /api/file-index?cwd=&q= —— git 仓库走 tracked 文件（G2-7 之外的索引域） */
export function getFileIndex(cwd: string, q?: string): Promise<FileIndexResponse> {
  const params = new URLSearchParams({ cwd });
  if (q !== undefined && q.length > 0) params.set('q', q);
  return getJson<FileIndexResponse>(`/file-index?${params.toString()}`);
}

export interface UploadResult {
  uploaded: { path: string; size: number; finalName?: string }[];
  skipped: string[];
}

/** POST /api/files/<dir>?type=upload&conflict= —— multipart 上传（冲突策略 rename/overwrite/skip） */
export async function uploadFiles(
  directory: string,
  files: File[],
  conflict: 'rename' | 'overwrite' | 'skip' = 'rename',
): Promise<UploadResult> {
  const form = new FormData();
  for (const file of files) form.append('files', file, file.name);
  const res = await http.post<UploadResult>(
    `/files/${encodeFilePathForApi(directory)}?type=upload&conflict=${conflict}`,
    form,
  );
  return res.data;
}

/** POST /api/files/<dir>?type=upload-check —— 上传前冲突预检（纯 JSON） */
export function checkUploadConflicts(
  directory: string,
  fileNames: string[],
): Promise<{ conflicts: string[] }> {
  return http
    .post<{ conflicts: string[] }>(`/files/${encodeFilePathForApi(directory)}?type=upload-check`, {
      fileNames,
    })
    .then((res) => res.data);
}
