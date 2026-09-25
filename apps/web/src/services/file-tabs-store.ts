import {
  activateFileTab,
  closeFileTab,
  EMPTY_FILE_TABS,
  type FileDisplayMode,
  type FileTabsState,
  isImagePath,
  openFileTab,
  resolveInitialDisplayMode,
  setTabDisplayMode,
  toggleTabWrap,
} from '@ice-ai/client';

/**
 * 文件页签 store（web 层）：右栏与侧栏文件树共用一个真相（避免 prop drilling）。
 * 状态归 web（docs/08 §3.3）；纯逻辑复用 client 的 file-viewer-state reducer。
 */
class FileTabsStore {
  private state: FileTabsState = EMPTY_FILE_TABS;
  private listeners = new Set<() => void>();

  getSnapshot(): FileTabsState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  open(path: string, preferDiff = false): void {
    this.commit(
      openFileTab(
        this.state,
        path,
        resolveInitialDisplayMode({ isImage: isImagePath(path), preferDiff }),
      ),
    );
  }

  close(path: string): void {
    this.commit(closeFileTab(this.state, path));
  }

  activate(path: string): void {
    this.commit(activateFileTab(this.state, path));
  }

  setMode(path: string, mode: FileDisplayMode): void {
    this.commit(setTabDisplayMode(this.state, path, mode));
  }

  toggleWrap(path: string): void {
    this.commit(toggleTabWrap(this.state, path));
  }

  /** 切换项目时清空（避免标签指向另一个项目的文件） */
  reset(): void {
    this.commit(EMPTY_FILE_TABS);
  }

  private commit(next: FileTabsState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}

export const fileTabsStore = new FileTabsStore();
