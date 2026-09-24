import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * 文件访问闸门（docs/02 §6.6、docs/04 §6 检查清单①）。
 *
 * 为什么这是**协议级**语义而不是实现细节：本服务握有宿主机文件系统全部权限，
 * 而 ADR-0007 之后没有凭据兜底——用户浏览器里的任意网页都能向
 * `http://127.0.0.1:9527` 发请求（三闸只挡跨站，不挡本机上的其他页面）。
 * 因此"能读哪些文件"必须是白名单，而不是"除了黑名单都能读"。
 *
 * 三道判据（依次）：
 * 1. **allowed-roots**：进程启动时的 cwd + 用户经 `/api/cwd/validate` 显式确认过的目录
 * 2. **会话引用放行**：roots 之外的文件若被某个会话引用（工具读写过的产物）则可读
 * 3. **点文件/敏感路径**：`.ssh`、`.aws`、`.env` 之类即使在 roots 内也拒
 *
 * roots **不接受**来自请求的任意路径：唯一的写入入口是 `cwd/validate`，而用户在那里
 * 看到的是自己刚在目录选择器里点出来的东西——这就是"显式确认"。
 */

/** 即使在 roots 内也拒绝的路径片段（凭据存放处，没有任何产品理由要经 HTTP 读它们） */
const SENSITIVE_SEGMENTS = [
  '.ssh',
  '.aws',
  '.gnupg',
  '.kube',
  '.docker/config.json',
  '.netrc',
  '.git-credentials',
  '.npmrc',
  '.pypirc',
];

/** 列目录时跳过的目录（体积大且无意义，客户端会卡在渲染上） */
export const IGNORED_DIRECTORY_NAMES = [
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
];

export type PathDecision =
  | { allowed: true; path: string }
  | { allowed: false; reason: 'outside-roots' | 'sensitive' | 'invalid' };

/** 跨平台路径同一性（Windows 大小写/分隔符不敏感）——**永远不要用 `===` 比路径** */
export function samePath(a: string, b: string): boolean {
  const left = normalizeForCompare(a);
  const right = normalizeForCompare(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function normalizeForCompare(path: string): string {
  return resolve(path).replace(/\\/g, '/').replace(/\/+$/, '');
}

/** 是否在某个 root 之内（含 root 自身）；用路径段边界比较，防 `/repo-evil` 混进 `/repo` */
export function isInsideRoot(path: string, root: string): boolean {
  const target = normalizeForCompare(path);
  const base = normalizeForCompare(root);
  if (target === base) return true;
  return target.startsWith(base.endsWith('/') ? base : `${base}/`);
}

export class PathGuard {
  private readonly roots = new Set<string>();

  constructor(initialRoots: readonly string[] = [process.cwd()]) {
    for (const root of initialRoots) this.addRoot(root);
  }

  /** 加一个 root（`cwd/validate` 的唯一写入路径）；失败（路径不存在）则忽略 */
  addRoot(path: string): void {
    const resolved = safeRealpath(expandTilde(path));
    if (resolved !== null) this.roots.add(resolved);
  }

  get allowedRoots(): string[] {
    return [...this.roots];
  }

  /** 主判据：allowed-roots 内且不在敏感路径上 */
  check(path: string): PathDecision {
    const resolved = safeRealpath(expandTilde(path)) ?? resolve(expandTilde(path));
    if (isSensitive(resolved)) return { allowed: false, reason: 'sensitive' };
    for (const root of this.roots) {
      if (isInsideRoot(resolved, root)) return { allowed: true, path: resolved };
    }
    return { allowed: false, reason: 'outside-roots' };
  }

  /**
   * 会话引用放行（`sessionId` 参数的意义所在）：roots 之外的文件若被该会话引用则可读。
   *
   * `referencedPaths` 由调用方从会话条目里抽（工具调用的 path 参数、工具结果里的
   * 文件路径），这里只做包含判定——抽路径是读会话文件的活，属于 core 的读服务。
   */
  checkWithSessionReference(path: string, referencedPaths: readonly string[]): PathDecision {
    const direct = this.check(path);
    if (direct.allowed) return direct;
    if (!direct.allowed && direct.reason === 'sensitive') return direct; // 引用也不能读凭据
    const resolved = resolve(expandTilde(path));
    for (const referenced of referencedPaths) {
      if (samePath(referenced, resolved)) return { allowed: true, path: resolved };
    }
    return { allowed: false, reason: 'outside-roots' };
  }
}

/** `~` / `~/x` 展开（协议允许用户输入带 `~` 的 cwd） */
export function expandTilde(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2));
  return path;
}

/** 是否落在敏感路径上（导出给列目录用：连**存在性**都不该暴露） */
export function isSensitivePath(path: string): boolean {
  return isSensitive(path);
}

function isSensitive(path: string): boolean {
  const unified = path.replace(/\\/g, '/');
  return SENSITIVE_SEGMENTS.some(
    (segment) =>
      unified.includes(`/${segment}/`) || unified.endsWith(`/${segment}`) || unified === segment,
  );
}

function safeRealpath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/** 相对 roots 的展示路径（前端把长绝对路径收起来时用） */
export function displayPath(path: string, root: string): string {
  const rel = relative(root, path);
  if (rel === '') return basename(root);
  return isAbsolute(rel) ? path : rel;
}

/** 路径分隔符统一成 POSIX（git 输出与前端展示都按 POSIX） */
export function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}
