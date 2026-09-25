/**
 * 文件类型判定（A 类移植自 pi-web lib/file-types.ts 的子集）。
 *
 * ⚠️ 与本仓后端的边界（docs/07 §9）：DOCX 转 HTML **未实现**，所以
 * `documentPreviewKind('x.docx')` 返回 null（pi-web 返回 'docx'）——DOCX 走下载，
 * 不假装能预览。PDF 可用（浏览器原生 iframe 渲染，后端只回原始字节）。
 */

export type DocumentPreviewKind = 'pdf';

export const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
export const IMAGE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
};

const DOCX_EXTENSIONS = new Set(['docx']);

/** 高亮的语言名（F5 接 shiki 时直接用；现在给 CodeBlock 的 banner 标语言） */
const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  jsonc: 'json',
  md: 'md',
  mdx: 'mdx',
  css: 'css',
  scss: 'scss',
  html: 'html',
  vue: 'vue',
  svelte: 'svelte',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  xml: 'xml',
  svg: 'xml',
  graphql: 'graphql',
  prisma: 'prisma',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

function getBaseName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? '';
}

export function getFileExt(filePath: string): string {
  const base = getBaseName(filePath).toLowerCase();
  if (!base.includes('.')) return '';
  return base.split('.').pop() ?? '';
}

export function getImageMime(filePath: string): string | null {
  return IMAGE_EXT_TO_MIME[getFileExt(filePath)] ?? null;
}

export function isImagePath(filePath: string): boolean {
  return getImageMime(filePath) !== null;
}

/** PDF 可预览；DOCX 不可（后端不做转换，docs/07 §9） */
export function documentPreviewKind(filePath: string): DocumentPreviewKind | null {
  return getFileExt(filePath) === 'pdf' ? 'pdf' : null;
}

export function isDocxPath(filePath: string): boolean {
  return DOCX_EXTENSIONS.has(getFileExt(filePath));
}

/** 无扩展名的常见文件（Dockerfile / Makefile / LICENSE…） */
export function isProbablyTextPath(filePath: string): boolean {
  const base = getBaseName(filePath).toLowerCase();
  const ext = getFileExt(filePath);
  if (ext.length === 0) {
    return ['dockerfile', 'makefile', 'license', 'readme', 'procfile', 'cmakelists.txt'].some(
      (name) => base === name || base.startsWith(`${name}.`),
    );
  }
  return (
    TEXT_EXTENSIONS.has(ext) ||
    ext.startsWith('env') ||
    base.endsWith('.env') ||
    base.startsWith('.env')
  );
}

const TEXT_EXTENSIONS = new Set([
  ...Object.keys(EXT_TO_LANGUAGE),
  'txt',
  'log',
  'csv',
  'tsv',
  'lock',
  'gitignore',
  'editorconfig',
]);

/** 语言标签（CodeBlock banner / shiki 用）；未知返回 'text'。
 *  无扩展名时按整名匹配（Dockerfile / Makefile）。 */
export function getLanguageFromPath(filePath: string): string {
  const ext = getFileExt(filePath);
  if (ext.length > 0) return EXT_TO_LANGUAGE[ext] ?? 'text';
  return EXT_TO_LANGUAGE[getBaseName(filePath).toLowerCase()] ?? 'text';
}

/** 人类可读体积（列表/查看器抬头） */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
