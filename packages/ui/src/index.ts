/**
 * @ice-ai/ui —— 纯展示组件库（只依赖 protocol 类型与 client hooks，不依赖任何宿主框架）。
 * 三册目录（docs/06 §4）：primitives / chat / inspect；容器组件例外登记见 docs/06 §1（ADR-0019）。
 * 视觉 token 单一来源：./theme.css（Tailwind 消费方式见 docs/06 §2）。
 */

// chat 册（docs/06 §4.2）
export { AssistantTurn, UsageLine, UserBubble } from './chat/assistant-turn';
export { CodeBlock } from './chat/code-block';
export { Composer, type ComposerProps } from './chat/composer';
export { EmptyState, type EmptyStateProps } from './chat/empty-state';
export { MarkdownBody, MarkdownView } from './chat/markdown-view';
export { MessageList, type MessageListProps } from './chat/message-list';
export { ProcessGroup } from './chat/process-group';
export { SystemRowView, ThinkingRowView } from './chat/thinking-row';
export { ToolRowView, ToolTag, toolTagClass } from './chat/tool-row';
// files 册（docs/06 §4.3）
export { CodeViewer, type CodeViewerProps } from './files/code-viewer';
export { DiffView, type DiffViewProps } from './files/diff-view';
export { FileIcon, type FileIconProps } from './files/file-icon';
export { FileTabs, type FileTabsProps } from './files/file-tabs';
export { FileTree, type FileTreeProps, sortEntries } from './files/file-tree';
export { FileViewer, type FileViewerProps } from './files/file-viewer';
export { ImagePreview, type ImagePreviewProps, nextZoom } from './files/image-preview';
export { Button, type ButtonProps, buttonStyles } from './primitives/button';
export { IconButton, type IconButtonProps } from './primitives/icon-button';
export { Input } from './primitives/input';
export { isDismissTarget, Popover, type PopoverProps } from './primitives/popover';
export { ScrollArea, type ScrollAreaProps } from './primitives/scroll-area';
export {
  clampTextareaHeight,
  Textarea,
  type TextareaProps,
} from './primitives/textarea';
export {
  TOAST_MAX_VISIBLE,
  type ToastAction,
  ToastHost,
  type ToastItem,
  toastQueueReducer,
} from './primitives/toast';
// sidebar 册（docs/06 §4.3）
export {
  ProjectPicker,
  type ProjectPickerProps,
  shortenProjectPath,
} from './sidebar/project-picker';
export { SessionList, type SessionListProps } from './sidebar/session-list';
export { SESSION_ROW_HEIGHT, SessionRow, type SessionRowProps } from './sidebar/session-row';
export {
  SessionSearch,
  type SessionSearchProps,
  useDebouncedValue,
} from './sidebar/session-search';
export { Sidebar, type SidebarProps } from './sidebar/sidebar';
export { cn } from './utils/cn';
