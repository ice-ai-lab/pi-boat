import type { CSSProperties, ReactNode } from 'react';

/**
 * 文件图标（T2-18 / L20 / F14）：按设计规范——
 * Catppuccin SVG 精灵（`/icons/catppuccin/{latte,mocha}/`）+ `mask` 单色化，
 * 跟随应用的克制文字色 `--text-dim`（14px），不显示语言专属彩色。
 */
type CatppuccinIconName =
  | '_file'
  | '_folder'
  | '_folder_open'
  | 'bash'
  | 'config'
  | 'css'
  | 'database'
  | 'docker'
  | 'env'
  | 'git'
  | 'graphql'
  | 'html'
  | 'javascript'
  | 'javascript-react'
  | 'json'
  | 'lock'
  | 'npm-lock'
  | 'bun-lock'
  | 'next'
  | 'eslint'
  | 'markdown'
  | 'ms-word'
  | 'pdf'
  | 'python'
  | 'rust'
  | 'sass'
  | 'terraform'
  | 'toml'
  | 'typescript'
  | 'typescript-react'
  | 'yaml'
  | 'go';

const CATPPUCCIN_ICONS_ROOT = '/icons/catppuccin';

function CatppuccinIcon({ name, size = 14 }: { name: CatppuccinIconName; size?: number }) {
  const style = {
    width: size,
    height: size,
    '--catppuccin-icon-light': `url(${CATPPUCCIN_ICONS_ROOT}/latte/${name}.svg)`,
    '--catppuccin-icon-dark': `url(${CATPPUCCIN_ICONS_ROOT}/mocha/${name}.svg)`,
  } as CSSProperties;

  return <span aria-hidden="true" className="catppuccin-file-icon" style={style} />;
}

function FolderGlyph({ size = 14, open = false }: { size?: number; open?: boolean }) {
  return <CatppuccinIcon name={open ? '_folder_open' : '_folder'} size={size} />;
}

const EXTENSION_ICONS: Record<string, CatppuccinIconName> = {
  ts: 'typescript',
  tsx: 'typescript-react',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript-react',
  py: 'python',
  json: 'json',
  jsonl: 'json',
  css: 'css',
  less: 'css',
  scss: 'sass',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  rs: 'rust',
  go: 'go',
  sql: 'database',
  graphql: 'graphql',
  gql: 'graphql',
  tf: 'terraform',
  hcl: 'terraform',
  docx: 'ms-word',
  pdf: 'pdf',
  lock: 'lock',
};

function getSpecialFileIcon(name: string): CatppuccinIconName | undefined {
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'docker';
  if (name === '.env' || name.startsWith('.env.')) return 'env';
  if (['.gitignore', '.gitattributes', '.gitmodules'].includes(name)) return 'git';
  if (name === 'package-lock.json') return 'npm-lock';
  if (name === 'bun.lock' || name === 'bun.lockb') return 'bun-lock';
  if (['next.config.js', 'next.config.mjs', 'next.config.cjs', 'next.config.ts'].includes(name))
    return 'next';
  if (
    [
      '.eslintrc',
      '.eslintrc.js',
      '.eslintrc.json',
      '.eslintrc.yml',
      'eslint.config.mjs',
      'eslint.config.js',
    ].includes(name)
  )
    return 'eslint';
  if (['yarn.lock', 'pnpm-lock.yaml', 'cargo.lock'].includes(name)) return 'lock';
  if (
    name.endsWith('.config.ts') ||
    name.endsWith('.config.js') ||
    name.endsWith('.config.mjs') ||
    name.endsWith('.config.cjs')
  )
    return 'config';
  return undefined;
}

export function getFileIcon(name: string, size = 14): ReactNode {
  const lower = name.toLowerCase();
  const specialIcon = getSpecialFileIcon(lower);
  if (specialIcon !== undefined) return <CatppuccinIcon name={specialIcon} size={size} />;

  const ext = lower.split('.').pop() ?? '';
  const icon = EXTENSION_ICONS[ext];
  return icon !== undefined ? (
    <CatppuccinIcon name={icon} size={size} />
  ) : (
    <CatppuccinIcon name="_file" size={size} />
  );
}

export interface FileIconProps {
  name: string;
  isDir?: boolean;
  expanded?: boolean;
  className?: string;
}

/** 文件/目录图标（FileTree 消费；等价设计规范的 FolderIcon + getFileIcon 组合） */
export function FileIcon({ name, isDir = false, expanded = false }: FileIconProps) {
  return isDir ? <FolderGlyph open={expanded} /> : getFileIcon(name, 14);
}

export { FileIcon as default };
