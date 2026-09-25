import { getFileExt, isImagePath } from '@ice-ai/client';
import {
  Braces,
  FileCode,
  FileJson,
  File as FileOutlineIcon,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Settings,
  Terminal,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

/** 扩展名 → 图标 + 色调（docs/06 §4.3 FileTree 的图标对照） */
const EXT_ICON: Record<string, { icon: ReactNode; tone: string }> = {
  ts: { icon: <FileCode size={13} />, tone: 'text-tool-read' },
  tsx: { icon: <FileCode size={13} />, tone: 'text-tool-read' },
  js: { icon: <FileCode size={13} />, tone: 'text-warn' },
  jsx: { icon: <FileCode size={13} />, tone: 'text-warn' },
  json: { icon: <FileJson size={13} />, tone: 'text-warn' },
  md: { icon: <FileText size={13} />, tone: 'text-fg-subtle' },
  css: { icon: <Braces size={13} />, tone: 'text-tool-edit' },
  scss: { icon: <Braces size={13} />, tone: 'text-tool-edit' },
  html: { icon: <Braces size={13} />, tone: 'text-tool-edit' },
  sh: { icon: <Terminal size={13} />, tone: 'text-tool-bash' },
  zsh: { icon: <Terminal size={13} />, tone: 'text-tool-bash' },
  yml: { icon: <Settings size={13} />, tone: 'text-fg-subtle' },
  yaml: { icon: <Settings size={13} />, tone: 'text-fg-subtle' },
  toml: { icon: <Settings size={13} />, tone: 'text-fg-subtle' },
};

export interface FileIconProps {
  name: string;
  isDir?: boolean;
  expanded?: boolean;
  className?: string;
}

/** 文件/目录图标（图片与未知扩展走兜底图标） */
export function FileIcon({ name, isDir = false, expanded = false, className }: FileIconProps) {
  if (isDir) {
    return (
      <span className={cn('shrink-0 text-fg-faint', className)}>
        {expanded ? <FolderOpen size={13} /> : <Folder size={13} />}
      </span>
    );
  }
  if (isImagePath(name)) {
    return (
      <span className={cn('shrink-0 text-tool-edit', className)}>
        <ImageIcon size={13} />
      </span>
    );
  }
  const entry = EXT_ICON[getFileExt(name)];
  if (entry !== undefined) {
    return <span className={cn('shrink-0', entry.tone, className)}>{entry.icon}</span>;
  }
  return (
    <span className={cn('shrink-0 text-fg-faint', className)}>
      <FileIconFallback />
    </span>
  );
}

function FileIconFallback() {
  return <FileOutlineIcon size={13} />;
}

export { FileIcon as default };
