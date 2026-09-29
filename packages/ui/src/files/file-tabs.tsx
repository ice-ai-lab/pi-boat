import type { FileTab } from '@ice-ai/client';
import { getFileName } from '@ice-ai/client';
import { X } from 'lucide-react';
import { FileIcon } from './file-icon';
import styles from './file-tabs.module.css';

/**
 * FileTabs：多标签 + 关闭 + 活动态。
 * 2026 视觉对齐 dsh-file-explorer：36px 条内放 28px 圆角（8）胶囊标签，
 * 活动标签换实色底（`--bg`）并加粗，关闭按钮 20×20 圆角 6、hover 才浮底。
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
    <div role="tablist" className={styles.bar}>
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
            className={`${styles.tab}${active ? ` ${styles.tabActive}` : ''}`}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onActivate(tab.path);
              }
            }}
          >
            <button type="button" className={styles.main} onClick={() => onActivate(tab.path)}>
              <span className={styles.icon}>
                <FileIcon name={tab.path} />
              </span>
              <span className={styles.label}>{label}</span>
              {dirtyPaths?.has(tab.path) === true && (
                <span className={styles.dirty} title="有未保存的改动">
                  ●
                </span>
              )}
            </button>
            <button
              type="button"
              title="关闭"
              aria-label={`关闭 ${label}`}
              onClick={() => onClose(tab.path)}
              className={styles.close}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
