import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

/**
 * 会话目录元数据扫描（ADR-0008 性能分层的第一层；项目域与会话域共用的磁盘原语，
 * 2026-09-22 自 SessionReadService 按领域拆出）。
 *
 * 只做 readdir + stat（及项目清单专用的首行头读取），不解析会话正文——本机实测
 * 32 会话 / 7 目录约 0.15 ms，对比 listAll 解析正文 57–110 ms。两个消费方：
 * - SessionReadService：列表缓存的指纹键 + listFingerprint 端点
 * - ProjectReadService：项目清单的目录/文件枚举
 *
 * 指纹 = 所有项目目录名 + 每个 .jsonl 的 (相对路径, size, mtime)。目录里新增/删除
 * 会话、追加写入、改名都会改变它；空目录的增删也在内。**没有单调性，只比较相等**
 * （命名教训见 ADR-0008：刻意不叫 version）。
 */

export interface SessionFileMeta {
  path: string;
  /** 文件名（ISO 时间戳前缀 ⇒ 字典序 = 时间序） */
  name: string;
  size: number;
  mtimeMs: number;
}

export interface ProjectDirScan {
  /** 项目目录名（encoded-cwd，编码有损，仅作诊断/指纹用） */
  dirName: string;
  /** 已按文件名降序（最新在前）；空目录为 [] */
  files: SessionFileMeta[];
}

export interface SessionsDirScan {
  projects: ProjectDirScan[];
  fingerprint: string;
}

/** 会话根目录缺省值：sessionsRoot ?? sessionDir ?? SDK 默认 ~/.pi/agent/sessions */
export function resolveSessionsRoot(options: {
  sessionDir?: string;
  sessionsRoot?: string;
}): string {
  return options.sessionsRoot ?? options.sessionDir ?? join(getAgentDir(), 'sessions');
}

/**
 * 目录元数据扫描：项目目录 → .jsonl 文件（size/mtime），根目录不可读时返回空扫描
 * （首次启动尚无会话目录是正常态，不是错误）。
 */
export async function scanSessionsDir(sessionsRoot: string): Promise<SessionsDirScan> {
  let dirents: Dirent[];
  try {
    dirents = await readdir(sessionsRoot, { withFileTypes: true });
  } catch {
    return { projects: [], fingerprint: fingerprintOf([]) };
  }

  const projects: ProjectDirScan[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory() && !dirent.isSymbolicLink()) continue;
    const files = await listJsonlFiles(join(sessionsRoot, dirent.name));
    projects.push({ dirName: dirent.name, files });
  }
  // 根目录下直接放 .jsonl（注入的单项目目录、历史布局）也算一个项目
  const rootFiles = await statJsonlFiles(
    sessionsRoot,
    dirents.filter((d) => d.isFile() && d.name.endsWith('.jsonl')).map((d) => d.name),
  );
  if (rootFiles.length > 0) projects.push({ dirName: '.', files: rootFiles });

  return { projects, fingerprint: fingerprintOf(projects) };
}

/** 首行头最大读取字节（SessionHeader 极小，8KB 足够且不会因多字节字符截断出问题） */
const HEADER_READ_BYTES = 8192;

/**
 * 只读会话文件首行头取 cwd（首行即 SessionHeader）——比 listAll 读全文便宜两个
 * 数量级；项目清单用（每目录一次）。头部损坏 / 无 cwd（极旧会话）→ 空串，交给
 * 上层跳过。
 */
export async function readSessionCwd(path: string): Promise<string> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, 'r');
    const buffer = Buffer.allocUnsafe(HEADER_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytesRead).toString('utf8').split('\n', 1)[0] ?? '';
    const parsed: unknown = JSON.parse(firstLine);
    const cwd = (parsed as { cwd?: unknown }).cwd;
    return typeof cwd === 'string' ? cwd : '';
  } catch {
    return '';
  }
}

async function listJsonlFiles(dir: string): Promise<SessionFileMeta[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.jsonl'));
  } catch {
    return [];
  }
  return statJsonlFiles(dir, names);
}

async function statJsonlFiles(dir: string, names: string[]): Promise<SessionFileMeta[]> {
  const metas = await Promise.all(
    names.map(async (name): Promise<SessionFileMeta | null> => {
      const path = join(dir, name);
      try {
        const info = await stat(path);
        return { path, name, size: info.size, mtimeMs: info.mtimeMs };
      } catch {
        return null; // 扫描期间被删除
      }
    }),
  );
  return metas
    .filter((meta): meta is SessionFileMeta => meta !== null)
    .sort((a, b) => b.name.localeCompare(a.name));
}

function fingerprintOf(projects: ProjectDirScan[]): string {
  const parts: string[] = [];
  for (const project of projects) {
    parts.push(`dir:${project.dirName}`);
    for (const file of project.files) {
      parts.push(
        `${project.dirName}/${file.name}\u0000${file.size}\u0000${Math.round(file.mtimeMs)}`,
      );
    }
  }
  parts.sort();
  return createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 16);
}
