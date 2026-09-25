import { FilePlus2 } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * TurnWrittenFiles（docs/06 §4.2）：本轮写出的文件（从写类工具参数抽取，web 层算好传入）。
 * 点击文件在右栏打开（宿主回传）。
 */
export interface TurnWrittenFilesProps {
  paths: string[];
  onOpen(path: string): void;
  /** 展示用短路径（缩到相对 cwd） */
  displayPath?(path: string): string;
  className?: string;
}

export function TurnWrittenFiles({ paths, onOpen, displayPath, className }: TurnWrittenFilesProps) {
  if (paths.length === 0) return null;
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="flex items-center gap-1 text-[10.5px] text-fg-faint">
        <FilePlus2 size={11} />
        本轮改动 {paths.length} 个文件
      </span>
      {paths.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => onOpen(path)}
          title={path}
          className="sq truncate px-1.5 py-0.5 text-left font-mono text-[11px] text-fg-subtle hover:bg-hover hover:text-fg"
        >
          {displayPath?.(path) ?? path}
        </button>
      ))}
    </div>
  );
}
