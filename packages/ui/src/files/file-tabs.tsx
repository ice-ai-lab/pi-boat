import type { FileTab } from '@ice-ai/client';
import { getFileName } from '@ice-ai/client';
import { X } from 'lucide-react';
import { FileIcon } from './file-icon';

/**
 * FileTabs：多标签 + 关闭 + 活动态。
 * 视觉按设计规范 `TabBar`：36px 高、`--bg-panel` 底、标签间 1px 右分隔线，
 * 活动标签换 `--bg` 底并加粗，关闭按钮 24×24 圆角 4、hover 才浮底。
 */
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
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        background: 'var(--bg-panel)',
        overflowX: 'auto',
        flexShrink: 0,
        height: 36,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const label = relativePathOf?.(tab.path) ?? getFileName(tab.path);
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            aria-label={label}
            title={tab.path}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onActivate(tab.path);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 36,
              paddingLeft: 12,
              paddingRight: 6,
              borderRight: '1px solid var(--border)',
              background: active ? 'var(--bg)' : 'var(--bg-panel)',
              cursor: 'pointer',
              fontSize: 12,
              color: active ? 'var(--text)' : 'var(--text-muted)',
              whiteSpace: 'nowrap',
              maxWidth: 180,
              minWidth: 80,
              flexShrink: 0,
              userSelect: 'none',
              transition: 'background 0.1s, color 0.1s',
            }}
          >
            <button
              type="button"
              onClick={() => onActivate(tab.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                minWidth: 0,
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'inherit',
                font: 'inherit',
                cursor: 'inherit',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  opacity: active ? 1 : 0.7,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <FileIcon name={tab.path} />
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {label}
              </span>
              {dirtyPaths?.has(tab.path) === true && (
                <span style={{ color: 'var(--accent)', flexShrink: 0 }} title="有未保存的改动">
                  ●
                </span>
              )}
            </button>
            <button
              type="button"
              title="关闭"
              aria-label={`关闭 ${label}`}
              onClick={() => onClose(tab.path)}
              className="flex shrink-0 items-center justify-center rounded-[4px] text-text-dim hover:bg-bg-hover hover:text-text"
              style={{
                width: 24,
                height: 24,
                padding: 0,
                border: 'none',
                background: 'transparent',
              }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
