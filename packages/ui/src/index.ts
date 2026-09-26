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
export { ToolRowView } from './chat/tool-row';
export { TurnWrittenFiles, type TurnWrittenFilesProps } from './chat/turn-written-files';
export { WorkspacePlaceholder } from './chat/workspace-placeholder';
export { stripAnsi } from './extension/ansi';
// extension 册（ADR-0012）
export { AnsiText } from './extension/ansi-text';
export {
  ExtensionRequestDialog,
  type ExtensionRequestDialogProps,
} from './extension/extension-request-dialog';
export {
  ExtensionStatusBar,
  formatExtensionStatusLine,
  sanitizeExtensionStatusText,
} from './extension/extension-status-bar';
export {
  DEFAULT_EXPANDED_WIDGET_LINES,
  ExtensionWidgets,
  formatExtensionWidgetContent,
  snapshotExtensionWidgetContents,
  WIDGET_UPDATE_IDLE_MS,
} from './extension/extension-widgets';
// files 册（docs/06 §4.3）
export { CodeViewer, type CodeViewerProps } from './files/code-viewer';
export { DiffView, type DiffViewProps } from './files/diff-view';
export { FileIcon, type FileIconProps } from './files/file-icon';
export { FileTabs, type FileTabsProps } from './files/file-tabs';
export { FileTree, type FileTreeProps, sortEntries } from './files/file-tree';
export { FileViewer, type FileViewerProps } from './files/file-viewer';
export { ImagePreview, type ImagePreviewProps, nextZoom } from './files/image-preview';
// i18n（docs/06 §1 第 5 处 ui 容器例外）
export {
  formatRelativeTime,
  formatUpdatedTime,
  interpolateMessage,
  translateMessage,
} from './i18n/format';
export { I18nProvider, useI18n } from './i18n/i18n-provider';
export { getLocalePlugin, getSupportedLocales, resolveBrowserLocale } from './i18n/registry';
export type { Locale, LocalePlugin, TranslationParams } from './i18n/types';
// panels 册（docs/06 §4.4）
export {
  BranchNavigator,
  buildActivePath,
  compressChain,
  hasSessionBranches,
  selectTopLevelBranches,
} from './panels/branch-navigator';
export { PanelShell, type PanelShellProps } from './panels/panel-shell';
export {
  SessionInfoPopover,
  type SessionInfoPopoverProps,
} from './panels/session-info-popover';
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
  ProjectTrustDialog,
  type ProjectTrustDialogProps,
} from './settings/project-trust-dialog';
export {
  SettingsNotice,
  SettingsPanel,
  type SettingsPanelProps,
  SettingsRow,
  SettingsSectionIcon,
  type SettingsSectionItem,
  SettingsSectionTitle,
  ThemeOptions,
} from './settings/settings-panel';
export {
  ConfigButton,
  ConfigDetail,
  ConfigDetailActions,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigDetailStack,
  ConfigDetailTitle,
  ConfigEmptyState,
  ConfigField,
  ConfigFooter,
  ConfigListAction,
  ConfigPanelShell,
  ConfigSectionTitle,
  ConfigSidebar,
  ConfigSidebarGroupLabel,
  ConfigSidebarItem,
  ConfigSidebarList,
  ConfigSidebarText,
  ConfigSplitView,
  ConfigStatusDot,
  ConfigSwitch,
} from './settings/settings-ui';
export {
  type SkillItemView,
  type SkillSearchItemView,
  SkillsSection,
  type SkillsSectionProps,
  type SkillUpdateView,
} from './settings/skills-section';
export { ThemeIcon } from './settings/theme-icon';
export {
  SessionSearch,
  type SessionSearchProps,
} from './sidebar/session-search';
// sidebar 册（docs/06 §4.3；T2 重排后结构按设计规范 `SessionSidebar`）
export {
  displayCwd,
  getSessionListIndices,
  Sidebar,
  type SidebarProject,
  type SidebarProps,
  type SidebarWorktreeState,
} from './sidebar/sidebar';
export { cn } from './utils/cn';
export { useScrollbarVisibility } from './utils/use-scrollbar-visibility';
