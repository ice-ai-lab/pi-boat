import { useEffect } from 'react';

/**
 * 「提及」插入通道：侧栏文件树的 `@ 提及` 按钮需要把相对路径写进中栏 Composer 的草稿，
 * 两者分属不同面板、中间没有共同祖先持有草稿。沿用设计规范的注册表模式
 * （同 `use-keyboard-shortcuts` 的 `registerAbortHandler`）：ChatPane 登记处理器，
 * 文件树调用 `insertMention`，无需逐层透传 props（ADR-0019-5 之外的例外，仅此一处）。
 */
let mentionHandler: ((text: string) => void) | null = null;

export function registerMentionHandler(handler: ((text: string) => void) | null): void {
  mentionHandler = handler;
}

export function insertMention(relativePath: string, isDir: boolean): void {
  mentionHandler?.(`@${relativePath}${isDir ? '/' : ''}`);
}

/** ChatPane 用：登记「把 @路径 追加进草稿」的处理器 */
export function useMentionInsertion(insert: (text: string) => void): void {
  useEffect(() => {
    registerMentionHandler(insert);
    return () => registerMentionHandler(null);
  }, [insert]);
}
