/**
 * 文件路径工具（A 类移植自 pi-web lib/file-paths.ts）。
 * 关键点：UNC 路径（`\\\\host\\share`）的 `//` 前缀会被 URL 路由 308 归一掉，
 * 因此必须把它折进**第一个路径段**（`%2F%2Fhost`），不能拆段重组（docs/07 §7 文件/路径条）。
 */

export function normalizeFilePathSlashes(filePath: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\')) {
    return filePath.replace(/\\/g, '/');
  }
  return filePath;
}

/** 把绝对路径编成 `/api/files/<...>` 的通配段（逐段 encodeURIComponent） */
/**
 * 把绝对路径编成 `/api/files/<...>` 的通配段（逐段 encodeURIComponent）。
 *
 * ⚠️ 与 pi-web 的关键差异：**前导斜杠必须折进首段**（编成 `%2F`）。
 * 本仓服务端把「首段无斜杠」的路径当作**相对 server cwd** 解析（server 测试即用
 * `/api/files//repo/...` 形式），而 Hono 会把裸 `//` 前缀 308 归一掉
 * （docs/07 §7 文件/路径条）——所以唯一稳妥写法是 `%2F` 开头：
 * - 绝对路径 `/repo/a.ts` → `%2Frepo/a.ts`
 * - UNC `//host/share/a` → `%2F%2Fhost/share/a`（折进首段，不拆段重组）
 */
export function encodeFilePathForApi(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return '';
  if (normalized.startsWith('//')) {
    segments[0] = `//${segments[0]}`;
  } else if (normalized.startsWith('/')) {
    segments[0] = `/${segments[0]}`;
  }
  return segments.map(encodeURIComponent).join('/');
}

export function getFileName(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath).replace(/\/+$/, '');
  return normalized.split('/').pop() ?? normalized;
}

export function getFileDirectory(filePath: string): string {
  const normalized = normalizeFilePathSlashes(filePath).replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash < 0) return '';
  if (lastSlash === 0) return '/';
  if (lastSlash === 2 && /^[a-zA-Z]:\//.test(normalized)) return normalized.slice(0, 3);
  return normalized.slice(0, lastSlash);
}

/** 相对 cwd 的展示路径（树/标签用）；不在 cwd 内则原样返回 */
export function getRelativeFilePath(filePath: string, cwd?: string): string {
  if (cwd === undefined || cwd.length === 0) return filePath;
  const normalizedFile = normalizeFilePathSlashes(filePath);
  const normalizedCwd = normalizeFilePathSlashes(cwd).replace(/\/$/, '');
  if (normalizedFile.startsWith(`${normalizedCwd}/`)) {
    return normalizedFile.slice(normalizedCwd.length + 1);
  }
  return filePath;
}

export function joinFilePath(parent: string, child: string): string {
  return `${normalizeFilePathSlashes(parent).replace(/\/$/, '')}/${child}`;
}

/** 面包屑段（相对路径逐级拆分，供文件树标题展示） */
export function pathBreadcrumbs(relativePath: string): string[] {
  return relativePath.split('/').filter((segment) => segment.length > 0);
}
