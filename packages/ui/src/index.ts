/**
 * @ice-ai/ui —— 纯展示组件库（只依赖 protocol 类型与 client hooks，不依赖任何宿主框架）。
 * 三册目录（docs/06 §4）：primitives / chat / inspect；容器组件例外登记见 docs/06 §1（ADR-0019）。
 * 视觉 token 单一来源：./theme.css（Tailwind 消费方式见 docs/06 §2）。
 */

// chat 册（docs/06 §4.2）
export { AssistantTurn, UsageLine, UserBubble } from './chat/assistant-turn';
// chat 册（F5 增补）
export { ChatMinimap, type ChatMinimapProps } from './chat/chat-minimap';
export { CodeBlock } from './chat/code-block';
export { Composer, type ComposerProps } from './chat/composer';
export { ComposerToolbar, type ComposerToolbarProps } from './chat/composer-toolbar';
export { EmptyState, type EmptyStateProps } from './chat/empty-state';
export { MarkdownBody, MarkdownView } from './chat/markdown-view';
export {
  MessageList,
  type MessageListHandle,
  type MessageListProps,
} from './chat/message-list';
export { ProcessGroup } from './chat/process-group';
export { QueueBar, type QueueBarProps } from './chat/queue-bar';
export {
  type SuggestionItem,
  SuggestionMenu,
  type SuggestionMenuProps,
} from './chat/suggestion-menu';
export { SystemRowView, ThinkingRowView } from './chat/thinking-row';
export { ToolRowView, ToolTag, toolTagClass } from './chat/tool-row';
export { TurnWrittenFiles, type TurnWrittenFilesProps } from './chat/turn-written-files';
export {
  ExtensionRequestDialog,
  type ExtensionRequestDialogProps,
} from './extension/extension-request-dialog';
// extension 册（ADR-0012）
export { ExtensionStatusBar } from './extension/extension-status-bar';
export {
  DEFAULT_EXPANDED_WIDGET_LINES,
  ExtensionWidgets,
} from './extension/extension-widgets';
// files 册（docs/06 §4.3）
export { CodeViewer, type CodeViewerProps } from './files/code-viewer';
export { DiffView, type DiffViewProps } from './files/diff-view';
export { FileIcon, type FileIconProps } from './files/file-icon';
export { FileTabs, type FileTabsProps } from './files/file-tabs';
export { FileTree, type FileTreeProps, sortEntries } from './files/file-tree';
export { FileViewer, type FileViewerProps } from './files/file-viewer';
export { ImagePreview, type ImagePreviewProps, nextZoom } from './files/image-preview';
// panels 册（docs/06 §4.4）
export {
  BranchNavigator,
  type BranchNavigatorProps,
  type BranchNodeView,
} from './panels/branch-navigator';
export { PanelShell, type PanelShellProps } from './panels/panel-shell';
export {
  SessionStatsPanel,
  type SessionStatsPanelProps,
} from './panels/session-stats-panel';
export {
  SystemPromptPanel,
  type SystemPromptPanelProps,
} from './panels/system-prompt-panel';
export {
  ToolDefinitionsPanel,
  type ToolDefinitionsPanelProps,
  type ToolDefinitionView,
} from './panels/tool-definitions-panel';
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
// settings 册（docs/06 §4.4）
export {
  DirectoryPicker,
  type DirectoryPickerProps,
} from './settings/directory-picker';
export { GeneralSection, type GeneralSectionProps } from './settings/general-section';
export {
  type ModelItemView,
  ModelsSection,
  type ModelsSectionProps,
} from './settings/models-section';
export {
  type PluginItemView,
  PluginsSection,
  type PluginsSectionProps,
} from './settings/plugins-section';
export {
  SettingsNotice,
  SettingsPanel,
  type SettingsPanelProps,
  SettingsRow,
  type SettingsSectionItem,
  SettingsSectionTitle,
} from './settings/settings-panel';
export {
  type SkillItemView,
  type SkillSearchItemView,
  SkillsSection,
  type SkillsSectionProps,
  type SkillUpdateView,
} from './settings/skills-section';
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
