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
export {
  isAtTail,
  MessageList,
  nextFollowAttached,
} from './chat/message-list';
export { ProcessGroup } from './chat/process-group';
export { SystemRowView, ThinkingRowView } from './chat/thinking-row';
export { ToolRowView, ToolTag, toolTagClass } from './chat/tool-row';
export { Button, type ButtonProps, buttonStyles } from './primitives/button';
export { IconButton, type IconButtonProps } from './primitives/icon-button';
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
export { cn } from './utils/cn';
