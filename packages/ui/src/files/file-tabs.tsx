import type { FileTab } from '@ice-ai/client';
import { getFileName } from '@ice-ai/client';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';
import { FileIcon } from './file-icon';

/** FileTabs（docs/06 §4.3 DockTabs 的文件实例）：多标签 + 关闭 + 活动态 */
export interface FileTabsProps {
  tabs: FileTab[];
  activePath: string | null;
  /** 展示用相对路径（省略则显示文件名） */
  relativePathOf?(path: string): string;
  dirtyPaths?: ReadonlySet<string>;
  onActivate(path: string): void;
  onClose(path: string): void;
}

export function FileTabs({
  tabs,
  activePath,
  relativePathOf,
  dirtyPaths,
  onActivate,
  onClose,
}: FileTabsProps) {
  if (tabs.length === 0) return null;
  return (
    <div className="hairline-b scrollbar-thin flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-line-2 px-1">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const label = relativePathOf?.(tab.path) ?? getFileName(tab.path);
        return (
          <div
            key={tab.path}
            className={cn(
              'group/tab flex shrink-0 items-center gap-1 py-1.5 pl-2.5 pr-1.5',
              active ? 'bg-surface text-fg' : 'text-fg-subtle hover:bg-hover',
            )}
          >
            <button
              type="button"
              title={tab.path}
              onClick={() => onActivate(tab.path)}
              aria-current={active}
              className="flex max-w-[220px] items-center gap-1.5 text-[12px]"
            >
              <FileIcon name={tab.path} />
              <span className="truncate">{label}</span>
              {dirtyPaths?.has(tab.path) === true && (
                <span className="text-accent" title="有未保存的改动">
                  ●
                </span>
              )}
            </button>
            <button
              type="button"
              title="关闭"
              aria-label={`关闭 ${label}`}
              onClick={() => onClose(tab.path)}
              className="sq flex h-5 w-5 items-center justify-center text-fg-faint opacity-0 hover:bg-hover hover:text-fg group-hover/tab:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
