/**
 * @ice-ai/ui —— 纯展示组件库（只依赖 protocol 类型与 client hooks，不依赖任何宿主框架）。
 * 三册目录（docs/06 §4）：primitives / chat / inspect；容器组件例外登记见 docs/06 §1（ADR-0019）。
 * 视觉 token 单一来源：./theme.css（Tailwind 消费方式见 docs/06 §2）。
 * 本入口只导出宿主（apps/web）实际消费的组件与工具——包内互用的组件不走这里。
 */

// chat 册（docs/06 §4.2）
export { Composer } from './chat/composer';
export { ComposerMetrics } from './chat/composer-metrics';
export { ComposerToolbar } from './chat/composer-toolbar';
export { ContentWidthHandles } from './chat/content-width-handles';
export { EmptyState } from './chat/empty-state';
export { MessageList } from './chat/message-list';
export { QueueBar } from './chat/queue-bar';
export type { SuggestionItem } from './chat/suggestion-menu';
export { WorkspacePlaceholder } from './chat/workspace-placeholder';
// 费用显示币种（同 i18n 的容器例外：状态在 ui、取数由宿主注入）
export {
  type Currency,
  CurrencyProvider,
  currencySymbol,
  formatMoney,
  SUPPORTED_CURRENCIES,
  useCurrency,
} from './currency/currency-provider';
// extension 册（ADR-0012）
export { ExtensionRequestDialog } from './extension/extension-request-dialog';
export { ExtensionStatusBar } from './extension/extension-status-bar';
// files 册（docs/06 §4.3）
export { FileIcon } from './files/file-icon';
export { FileTabs } from './files/file-tabs';
export { FileTree } from './files/file-tree';
export { FileViewer } from './files/file-viewer';
// i18n（docs/06 §1 第 5 处 ui 容器例外）
export { formatRelativeTime } from './i18n/format';
export { I18nProvider, useI18n } from './i18n/i18n-provider';

// panels 册（docs/06 §4.4）
export { BranchNavigator, hasSessionBranches } from './panels/branch-navigator';
export { SessionInfoPopover } from './panels/session-info-popover';
export { SystemPromptPanel } from './panels/system-prompt-panel';
export { ToolDefinitionsPanel } from './panels/tool-definitions-panel';
export { ToastHost, type ToastItem, toastQueueReducer } from './primitives/toast';

// settings 册（docs/06 §4.4）
export { GeneralSection } from './settings/general-section';
export { type ModelItemView, ModelsSection } from './settings/models-section';
export { PluginsSection } from './settings/plugins-section';
export { ProjectTrustDialog } from './settings/project-trust-dialog';
export { SettingsPanel, type SettingsSectionItem } from './settings/settings-panel';
export { SkillsSection } from './settings/skills-section';

// sidebar 册（docs/06 §4.3；T2 重排后结构按设计规范 `SessionSidebar`）
export { Sidebar, type SidebarProject } from './sidebar/sidebar';
export { cn } from './utils/cn';
