import { execFile } from 'node:child_process';
import { type Dirent, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
  BrowseEntry,
  CwdBrowseResponse,
  CwdValidateResponse,
  FileIndexResponse,
  FileListEntry,
  FileListResponse,
  FileMetaResponse,
  GitDiffResponse,
  GitFileStatus,
  GitStatusResponse,
  WorktreeCreateResponse,
  WorktreeInfo,
  WorktreesResponse,
} from '@ice-ai/protocol';
import type { ProjectResolverLike } from '../read/project-resolver';
import {
  displayPath,
  IGNORED_DIRECTORY_NAMES,
  isSensitivePath,
  type PathDecision,
  PathGuard,
  samePath,
  toPosixPath,
} from './path-guard';

/**
 * 系统域服务（docs/02 §6.6 / §6.7）：文件浏览、文件索引、git、worktree、cwd 选择。
 *
 * 为什么单独一个服务：这些能力的共同点是**直接碰宿主机**（目录、git 子进程），
 * 且都要过同一道 allowed-roots 闸。放在 SessionReadService 里会让"只读会话文件"
 * 的边界糊掉。
 *
 * 三条实现纪律：
 * 1. 所有路径先过 `PathGuard`（含会话引用放行），**决策失败一律不给路径细节**
 *    （错误信息里不回显绝对路径，避免把目录结构告诉调用方）
 * 2. git 输出是 POSIX 相对路径 → Windows 上转原生；路径比较一律 `samePath()`
 * 3. git 子进程全部带超时（仓库巨大或 hook 卡住时不能让请求挂着）
 */

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 32 * 1024 * 1024;

/** 文件索引上限（超过就截断并告诉客户端，避免一次回几十万条） */
const FILE_INDEX_MAX = 5000;
/** git 仓库里 `git ls-files` 的硬上限（monorepo 保护） */
const FILE_INDEX_GIT_HARD_LIMIT = 200_000;
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.css',
  '.scss',
  '.sass',
  '.html',
  '.htm',
  '.xml',
  '.svg',
  '.csv',
  '.tsv',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.php',
  '.lua',
  '.sql',
  '.graphql',
  '.gql',
  '.env',
  '.gitignore',
  '.dockerfile',
  '.lock',
  '.log',
  '.patch',
  '.diff',
]);

const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

export interface SystemServiceOptions {
  /** 路径闸门（allowed-roots 注册表）；缺省新建一份以进程 cwd 为根 */
  guard?: PathGuard;
  /** 项目解析器（cwd/validate 与 worktrees 的项目键）；与列表共用同一实例 */
  resolver?: ProjectResolverLike;
}

/** 会话引用集合（由 server 从读服务取：该会话碰过的文件路径） */
export type SessionReferences = readonly string[];

export class SystemService {
  private readonly guard: PathGuard;
  private readonly resolver: ProjectResolverLike | undefined;

  constructor(options: SystemServiceOptions = {}) {
    this.guard = options.guard ?? new PathGuard();
    this.resolver = options.resolver;
  }

  get pathGuard(): PathGuard {
    return this.guard;
  }

  // ------------------------------------------------------------------
  // §6.6 家目录 / 默认 cwd / 目录选择器
  // ------------------------------------------------------------------

  home(): string {
    return homedir();
  }

  /**
   * 默认 cwd：`~/pi-cwd-YYYYMMDD`（已存在则复用）。
   * 为什么不是 `mkdtemp`：用户会记住这个目录并在里面找自己昨天的工作。
   */
  async defaultCwd(): Promise<string> {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const path = join(homedir(), `pi-cwd-${stamp}`);
    await mkdir(path, { recursive: true });
    return path;
  }

  /**
   * 目录选择器。**浏览不受 allowed-roots 限制**——用户必须能走到任意目录才能选中它
   * （这是选择器的全部意义）；受限的是**读文件内容**，而 `cwd/validate` 会把选中的
   * 目录登记进 roots。
   */
  async browseCwd(rawPath: string | undefined): Promise<CwdBrowseResponse | null> {
    const path = resolve(rawPath ?? homedir());
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(path);
    } catch {
      return null;
    }
    if (!info.isDirectory()) return null;

    const directories: BrowseEntry[] = [];
    try {
      const dirents: Dirent<string>[] = await readdir(path, { withFileTypes: true });
      for (const dirent of dirents) {
        if (!dirent.isDirectory()) continue;
        // 隐藏目录也列（用户在选项目目录时可能需要进 `.config`），但忽略体积型目录
        if (IGNORED_DIRECTORY_NAMES.includes(dirent.name)) continue;
        const child = join(path, dirent.name);
        directories.push({ name: dirent.name, path: child, readable: await isReadable(child) });
      }
    } catch {
      return { path, parentPath: parentOf(path), directories: [] };
    }
    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const parent = parentOf(path);
    return {
      path,
      parentPath: parent,
      directories,
      ...(platform() === 'win32' ? { drives: await windowsDrives() } : {}),
    };
  }

  /**
   * 校验并**登记** cwd（protocol 里 roots 的唯一来源）。
   * 失败时抛 UserInputError 语义（server 映射 400）。
   */
  async validateCwd(cwd: string): Promise<CwdValidateResponse> {
    const path = resolve(expandHome(cwd));
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(path);
    } catch {
      return { success: false, cwd: path, projectRoot: path, projectKey: '' };
    }
    if (!info.isDirectory()) {
      return { success: false, cwd: path, projectRoot: path, projectKey: '' };
    }

    this.guard.addRoot(path);
    const resolution = await this.resolver?.resolve(path);
    return {
      success: true,
      cwd: path,
      projectRoot: resolution?.projectRoot ?? path,
      projectKey: resolution?.projectKey ?? path,
    };
  }

  // ------------------------------------------------------------------
  // §6.6 文件
  // ------------------------------------------------------------------

  /** 文件访问决策（server 用它把拒绝映射成 403，且不回显路径） */
  authorizeFile(path: string, references: SessionReferences = []): PathDecision {
    return this.guard.checkWithSessionReference(path, references);
  }

  async listDirectory(path: string): Promise<FileListResponse | null> {
    // type=list **不适用**会话引用放行（协议明文）：列目录会暴露整个目录结构，
    // 而"某个文件被引用过"根本推不出"它的兄弟文件也该可见"——所以这里只走
    // `check()` 而不是 `checkWithSessionReference()`
    const decision = this.guard.check(path);
    if (!decision.allowed) return null;

    let dirents: Dirent<string>[];
    try {
      dirents = await readdir(decision.path, { withFileTypes: true });
    } catch {
      return null;
    }

    const entries: FileListEntry[] = [];
    const ignored: string[] = [];
    for (const dirent of dirents) {
      if (IGNORED_DIRECTORY_NAMES.includes(dirent.name)) {
        ignored.push(dirent.name);
        continue;
      }
      const child = join(decision.path, dirent.name);
      // 敏感路径（.ssh / .aws …）连**存在性**都不列：读被 check() 挡住，
      // 但列出名字仍然等于告诉调用方凭据放在哪
      if (isSensitivePath(child)) continue;
      const isDirectory = dirent.isDirectory();
      if (isDirectory) {
        entries.push({ name: dirent.name, path: child, type: 'directory' });
        continue;
      }
      const info = await stat(child).catch(() => null);
      entries.push({
        name: dirent.name,
        path: child,
        type: 'file',
        ...(info !== null ? { size: info.size, modified: info.mtime.toISOString() } : {}),
        kind: fileKind(dirent.name),
      });
    }
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return { path: decision.path, entries, ...(ignored.length > 0 ? { ignored } : {}) };
  }

  async meta(path: string, references: SessionReferences = []): Promise<FileMetaResponse | null> {
    const decision = this.guard.checkWithSessionReference(path, references);
    if (!decision.allowed) return null;
    const info = await stat(decision.path).catch(() => null);
    if (info === null) return null;
    const category = fileCategory(decision.path);
    const mime = IMAGE_EXTENSIONS[extname(decision.path).toLowerCase()];
    return {
      path: decision.path,
      type: info.isDirectory() ? 'directory' : 'file',
      size: info.size,
      modified: info.mtime.toISOString(),
      category,
      ...(mime !== undefined ? { mimeType: mime } : {}),
    };
  }

  /**
   * 读文件（type=read / download）。二进制或超大文本也照发——由 server 决定
   * Content-Type 与 disposition；`meta` 已经告诉过前端它是什么。
   */
  async readFile(
    path: string,
    references: SessionReferences = [],
  ): Promise<{ data: Buffer; mimeType: string; name: string } | null> {
    const decision = this.guard.checkWithSessionReference(path, references);
    if (!decision.allowed) return null;
    const info = await stat(decision.path).catch(() => null);
    if (info === null || !info.isFile()) return null;
    const data = await readFile(decision.path).catch(() => null);
    if (data === null) return null;
    return {
      data,
      mimeType:
        IMAGE_EXTENSIONS[extname(decision.path).toLowerCase()] ?? 'application/octet-stream',
      name: basename(decision.path),
    };
  }

  /** 上传冲突预检 */
  async checkUploadConflicts(
    directory: string,
    fileNames: readonly string[],
  ): Promise<Array<{ name: string; exists: boolean }>> {
    const decision = this.guard.check(directory);
    if (!decision.allowed) return fileNames.map((name) => ({ name, exists: false }));
    const results: Array<{ name: string; exists: boolean }> = [];
    for (const name of fileNames) {
      const safe = sanitizeUploadName(name);
      if (safe === null) {
        results.push({ name, exists: false });
        continue;
      }
      const exists = await stat(join(decision.path, safe)).then(
        () => true,
        () => false,
      );
      results.push({ name, exists });
    }
    return results;
  }

  /**
   * 落盘上传文件。
   * 文件名清洗（不给 `../` 与绝对路径任何机会）+ 冲突策略（overwrite/skip/rename）。
   * 体积上限由 server 在执行前判定（流式读时才知道总量）。
   */
  async saveUpload(
    directory: string,
    name: string,
    data: Uint8Array,
    policy: 'overwrite' | 'skip' | 'rename' = 'rename',
  ): Promise<{ path: string; size: number; finalName: string } | { skipped: string } | null> {
    const decision = this.guard.check(directory);
    if (!decision.allowed) return null;
    const safe = sanitizeUploadName(name);
    if (safe === null) return null;

    let target = join(decision.path, safe);
    const exists = await stat(target).then(
      () => true,
      () => false,
    );
    if (exists && policy === 'skip') return { skipped: safe };
    if (exists && policy === 'rename') target = uniqueName(decision.path, safe);

    await writeFile(target, data);
    return { path: target, size: data.byteLength, finalName: basename(target) };
  }

  // ------------------------------------------------------------------
  // §6.6 文件索引（模糊搜索）
  // ------------------------------------------------------------------

  /**
   * 文件索引：git 仓库走 `git ls-files`（快且天然尊重 .gitignore），
   * 否则退回递归遍历（有深度与条目上限）。结果按模糊匹配打分排序。
   */
  async fileIndex(cwd: string, query?: string): Promise<FileIndexResponse> {
    const decision = this.guard.check(cwd);
    if (!decision.allowed) return { files: [], truncated: false };
    const root = decision.path;

    const gitFiles = await this.gitTrackedFiles(root);
    const all =
      gitFiles !== null
        ? gitFiles.slice(0, FILE_INDEX_GIT_HARD_LIMIT)
        : await walkFiles(root, FILE_INDEX_MAX * 4);

    if (query === undefined || query.trim() === '') {
      return { files: all.slice(0, FILE_INDEX_MAX), truncated: all.length > FILE_INDEX_MAX };
    }
    const scored = all
      .map((file) => ({ file, score: fuzzyScore(file, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.length - b.file.length)
      .slice(0, FILE_INDEX_MAX)
      .map((entry) => entry.file);
    return { files: scored, truncated: false };
  }

  private async gitTrackedFiles(root: string): Promise<string[] | null> {
    try {
      const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      });
      return stdout.split('\0').filter((line) => line !== '');
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // §6.7 git
  // ------------------------------------------------------------------

  async gitStatus(cwd: string): Promise<GitStatusResponse> {
    const decision = this.guard.check(cwd);
    if (!decision.allowed) {
      return emptyGitStatus();
    }
    const root = await this.gitRoot(decision.path);
    if (root === null) return emptyGitStatus();

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        { cwd: root, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
      );
      const files = parsePorcelain(stdout);
      const branch = await this.gitBranch(root);
      const { additions, deletions } = await this.gitNumstat(root);
      return {
        isGitRepository: true,
        repositoryRoot: root,
        branch,
        files,
        additions,
        deletions,
      };
    } catch {
      return emptyGitStatus();
    }
  }

  async gitDiff(cwd: string, path: string, staged: boolean): Promise<GitDiffResponse> {
    const decision = this.guard.check(cwd);
    if (!decision.allowed) return { supported: false, reason: 'access-denied' };
    const root = await this.gitRoot(decision.path);
    if (root === null) return { supported: false, reason: 'not-a-git-repository' };

    const status = await this.gitStatus(root);
    const target = status.files.find((file) => samePath(join(root, file.path), join(root, path)));
    if (target === undefined) return { supported: false, reason: 'file-not-changed' };

    try {
      const args = ['diff', '--patch', '--no-color', ...(staged ? ['--cached'] : []), '--', path];
      const { stdout } = await execFileAsync('git', args, {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      });
      if (stdout.trim() === '')
        return { supported: false, status: target.kind, reason: 'no-textual-diff' };
      return { supported: true, status: target.kind, patch: stdout };
    } catch {
      return { supported: false, status: target.kind, reason: 'diff-failed' };
    }
  }

  private async gitRoot(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
        cwd,
        timeout: GIT_TIMEOUT_MS,
      });
      const root = stdout.trim();
      return root === '' ? null : root;
    } catch {
      return null;
    }
  }

  private async gitBranch(root: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
      });
      const branch = stdout.trim();
      return branch === '' || branch === 'HEAD' ? null : branch;
    } catch {
      return null;
    }
  }

  private async gitNumstat(root: string): Promise<{ additions: number; deletions: number }> {
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--numstat'], {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      });
      let additions = 0;
      let deletions = 0;
      for (const line of stdout.split('\n')) {
        const [added, removed] = line.split('\t');
        // 二进制文件是 `-\t-\tpath`：跳过而不是当成 0（NaN 会污染总计）
        if (added === undefined || removed === undefined) continue;
        const a = Number.parseInt(added, 10);
        const d = Number.parseInt(removed, 10);
        if (Number.isNaN(a) || Number.isNaN(d)) continue;
        additions += a;
        deletions += d;
      }
      return { additions, deletions };
    } catch {
      return { additions: 0, deletions: 0 };
    }
  }

  // ------------------------------------------------------------------
  // §6.7 worktrees
  // ------------------------------------------------------------------

  async worktrees(cwd: string): Promise<WorktreesResponse> {
    const decision = this.guard.check(cwd);
    const fallbackRoot = decision.allowed ? decision.path : resolve(cwd);
    const resolution = await this.resolver?.resolve(fallbackRoot);
    const projectRoot = resolution?.projectRoot ?? fallbackRoot;

    const root = await this.gitRoot(fallbackRoot);
    if (root === null) {
      return {
        projectRoot,
        projectKey: resolution?.projectKey ?? projectRoot,
        isGit: false,
        isTopLevel: true,
        currentWorktreePath: null,
        worktrees: [],
      };
    }

    const list = await this.parseWorktreeList(root);
    const current = list.find((worktree) => samePath(worktree.path, fallbackRoot));
    return {
      projectRoot: resolution?.projectRoot ?? root,
      projectKey: resolution?.projectKey ?? root,
      isGit: true,
      isTopLevel: samePath(root, fallbackRoot),
      currentWorktreePath: current?.path ?? null,
      worktrees: list,
    };
  }

  async createWorktree(
    cwd: string,
    branch: string,
    basePath?: string,
  ): Promise<WorktreeCreateResponse> {
    const decision = this.guard.check(cwd);
    if (!decision.allowed) throw new SystemAccessError('Access denied');
    const root = await this.gitRoot(decision.path);
    if (root === null) throw new UserInputErrorLite('Not a git repository');

    const base = basePath ?? join(dirname(root), `${basename(root)}.worktrees`);
    await mkdir(base, { recursive: true });
    const target = join(base, sanitizeBranchName(branch));

    // 分支已存在 → 检出；否则 `-b` 新建（两条路径的差异是 git 的语义，不该我们在外面猜）
    const branchExists = await this.branchExists(root, branch);
    const args = branchExists
      ? ['worktree', 'add', target, branch]
      : ['worktree', 'add', '-b', branch, target];
    try {
      await execFileAsync('git', args, { cwd: root, timeout: GIT_TIMEOUT_MS });
    } catch (error) {
      throw new UserInputErrorLite(
        `Failed to create worktree: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : ''}`,
      );
    }
    this.guard.addRoot(target);
    return { path: target, branch };
  }

  /**
   * 删除 worktree。`force` 缺省时**先查脏**：有改动就 409 让用户确认——
   * `git worktree remove` 不加 `--force` 本身也会拒，但我们提前拦能给出更明确的
   * 错误（哪几个文件脏），而不是让用户对着 git 的报错猜。
   */
  async removeWorktree(
    cwd: string,
    path: string,
    force: boolean,
  ): Promise<{ dirty: string[] } | null> {
    const decision = this.guard.check(cwd);
    if (!decision.allowed) throw new SystemAccessError('Access denied');
    const root = await this.gitRoot(decision.path);
    if (root === null) throw new UserInputErrorLite('Not a git repository');

    if (!force) {
      const dirty = await this.dirtyFiles(path);
      if (dirty.length > 0) return { dirty };
    }
    try {
      await execFileAsync('git', ['worktree', 'remove', ...(force ? ['--force'] : []), path], {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
      });
    } catch (error) {
      throw new UserInputErrorLite(
        `Failed to remove worktree: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : ''}`,
      );
    }
    return null;
  }

  private async dirtyFiles(path: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1'], {
        cwd: path,
        timeout: GIT_TIMEOUT_MS,
      });
      return stdout
        .split('\n')
        .map((line) => line.slice(3).trim())
        .filter((line) => line !== '');
    } catch {
      return [];
    }
  }

  private async branchExists(root: string, branch: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', `refs/heads/${branch}`], {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async parseWorktreeList(root: string): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
        cwd: root,
        timeout: GIT_TIMEOUT_MS,
      });
      const entries: WorktreeInfo[] = [];
      let current: Partial<WorktreeInfo> = {};
      const flush = () => {
        if (current.path === undefined) return;
        entries.push({
          path: current.path,
          branch: current.branch ?? null,
          head: current.head ?? null,
          bare: current.bare ?? false,
          current: samePath(current.path, root),
        });
      };
      for (const line of stdout.split('\n')) {
        if (line.startsWith('worktree ')) {
          flush();
          current = { path: line.slice('worktree '.length).trim() };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice('HEAD '.length).trim().slice(0, 8);
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
        } else if (line.trim() === 'bare') {
          current.bare = true;
        } else if (line.startsWith('detached')) {
          current.branch = null;
        }
      }
      flush();
      return entries;
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// 错误与工具
// ---------------------------------------------------------------------------

/** 路径不在 allowed-roots → server 409/403 */
export class SystemAccessError extends Error {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'SystemAccessError';
  }
}

/** 用户输入问题（不是 git 仓库 / worktree 建失败）→ server 400 */
export class UserInputErrorLite extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserInputErrorLite';
  }
}

function emptyGitStatus(): GitStatusResponse {
  return {
    isGitRepository: false,
    repositoryRoot: null,
    branch: null,
    files: [],
    additions: 0,
    deletions: 0,
  };
}

/**
 * 解析 `git status --porcelain=v1 -z`。
 *
 * `-z` 把条目用 NUL 分隔（路径不会被引号转义，中文/空格都安全），
 * 但**重命名条目会多带一个 NUL 段**（新路径后紧跟原路径），因此不能简单地线性切分。
 */
function parsePorcelain(stdout: string): GitFileStatus[] {
  const parts = stdout.split('\0');
  const files: GitFileStatus[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const entry = parts[index];
    if (entry === undefined || entry.length < 4) continue;
    const x = entry[0] ?? ' ';
    const y = entry[1] ?? ' ';
    const path = entry.slice(3);
    if (path === '') continue;
    const kind = classifyStatus(x, y);
    const fromPath = x === 'R' || y === 'R' ? parts[index + 1] : undefined;
    if (fromPath !== undefined) index += 1;
    files.push({
      path: toPosixPath(path),
      ...(fromPath !== undefined && fromPath !== '' ? { fromPath: toPosixPath(fromPath) } : {}),
      kind,
      staged: x !== ' ' && x !== '?',
    });
  }
  return files;
}

function classifyStatus(x: string, y: string): GitFileStatus['kind'] {
  if (x === '?' && y === '?') return 'untracked';
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D'))
    return 'conflict';
  if (x === 'R' || y === 'R') return 'renamed';
  if (x === 'A' || y === 'A') return 'added';
  if (x === 'D' || y === 'D') return 'deleted';
  return 'modified';
}

function fileCategory(path: string): FileMetaResponse['category'] {
  const ext = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS[ext] !== undefined) return 'image';
  if (TEXT_EXTENSIONS.has(ext) || basename(path).startsWith('.')) return 'text';
  return 'binary';
}

function fileKind(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === '') return basename(name).startsWith('.') ? 'config' : 'file';
  return ext.slice(1);
}

/** 文件名清洗：只取 basename，拒掉空名与 `.`/`..` */
function sanitizeUploadName(name: string): string | null {
  // 只取 basename（`../` 与绝对路径就此失效），再完全符剥掉控制字符与分隔符
  // （不写进正则字符类：控制字符范围在正则里既难读又会被 lint 拦）
  const base = [...basename(name)]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f && char !== '/' && char !== '\\\\';
    })
    .join('');
  if (base === '' || base === '.' || base === '..') return null;
  return base;
}

/** `report.pdf` → `report (2).pdf`（不覆盖已有文件） */
function uniqueName(directory: string, name: string): string {
  const parsed = parse(name);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = join(directory, `${parsed.name} (${index})${parsed.ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return join(directory, `${parsed.name}-${Date.now()}${parsed.ext}`);
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

function parentOf(path: string): string | null {
  const parent = dirname(path);
  return parent === path ? null : parent;
}

async function windowsDrives(): Promise<string[]> {
  const drives: string[] = [];
  for (let code = 65; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (existsSync(drive)) drives.push(drive);
  }
  return drives;
}

/** 递归遍历（git 不可用时）：深度与条目都有上限 */
async function walkFiles(root: string, limit: number): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];
  while (queue.length > 0 && files.length < limit) {
    const current = queue.shift();
    if (current === undefined) break;
    let dirents: Dirent<string>[];
    try {
      dirents = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.') || IGNORED_DIRECTORY_NAMES.includes(dirent.name)) continue;
      const child = join(current, dirent.name);
      if (dirent.isDirectory()) queue.push(child);
      else files.push(relativePosix(root, child));
      if (files.length >= limit) break;
    }
  }
  return files;
}

function relativePosix(root: string, path: string): string {
  return toPosixPath(path.slice(root.length + 1));
}

/**
 * 模糊匹配打分：连续子序列匹配 + 词首加成 + 路径越短分越高。
 * 只为排序，不做过滤（返回 0 表示不匹配）。
 */
export function fuzzyScore(file: string, query: string): number {
  const target = file.toLowerCase();
  const needle = query.toLowerCase();
  let score = 0;
  let index = 0;
  let streak = 0;
  for (const char of needle) {
    const found = target.indexOf(char, index);
    if (found === -1) return 0;
    streak = found === index ? streak + 1 : 0;
    // 词首（路径分隔符/下划线/点之后）命中权重更高
    const previous = target[found - 1];
    const atBoundary =
      found === 0 || previous === '/' || previous === '_' || previous === '-' || previous === '.';
    score += 1 + streak + (atBoundary ? 2 : 0);
    index = found + 1;
  }
  return score + Math.max(0, 40 - file.length) / 10;
}

function sanitizeBranchName(branch: string): string {
  return branch.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'worktree';
}

function expandHome(path: string): string {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return join(homedir(), path.slice(2));
  return path;
}

export { displayPath };
