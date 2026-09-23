/**
 * `@ice-ai/ui` —— 纯展示组件库（docs/06-ui-design.md）。
 *
 * 边界（docs/06 §1）：
 * 1. 不依赖宿主框架（Electron / Next / 路由 / 查询库）
 * 2. 不取数（M1）：容器与查询留在 `apps/web`，ui 保持可无 Provider 单测
 * 3. 不发明形状：props 类型来自 protocol 与 docs/05 的视图模型
 *
 * 三册目录：`primitives/`（无业务语义）、`chat/`（对话域）、`inspect/`（统计与检视，M2/M3）。
 * 视觉基准：`docs/design/piboat-web-v3.html`；token 单一来源：本包 `theme.css`。
 */

// chat
export { AssistantTurn } from './chat/assistant-turn';
export { CodeBlock } from './chat/code-block';
export { CollapseRow, StoppedTag, ThinkTag, ToolTag } from './chat/collapse-row';
export { Composer } from './chat/composer';
export {
  CHAT_EDGE,
  CHAT_MIN,
  CHAT_WIDTH_STORAGE_KEY,
  ContentWidthControls,
  resolveChatW,
} from './chat/content-width-controls';
export { type DiffLine, DiffView, parseDiff } from './chat/diff-view';
export { EmptyState } from './chat/empty-state';
export { MarkdownView } from './chat/markdown-view';
export { MessageList } from './chat/message-list';
export { MessageMinimap } from './chat/message-minimap';
export { ModeChip, type ToolPreset } from './chat/mode-chip';
export { ModelBadge, ModelTag } from './chat/model-badge';
export { ProcessGroup, SystemRow, TrailRowView } from './chat/process-group';
export { ScrollToBottomButton } from './chat/scroll-to-bottom-button';
export { StatsPills } from './chat/stats-pills';
export { SystemPromptPanel } from './chat/system-prompt-panel';
export { ThinkingRow } from './chat/thinking-row';
export { ToolRow } from './chat/tool-row';
export {
  cacheHitPercent,
  type SessionStatsDisplay,
  UsageLine,
} from './chat/usage-line';
// hooks / utils
export {
  getLiveFollowAttached,
  isAtBottom,
  REATTACH_TOLERANCE,
  shouldShowScrollToLatest,
  TAIL_TOLERANCE,
  useAutoScroll,
} from './hooks/use-auto-scroll';
// inspect
export {
  type FileChange,
  FileDock,
  type FileNode,
} from './inspect/file-dock';
export { SessionListItem } from './inspect/session-list-item';
export { StatsCardGroup, type StatsCardGroupProps } from './inspect/stats-card-group';
export {
  DEFAULT_TOOLS,
  type ToolDefinition,
  ToolList,
} from './inspect/tool-list';
export { WorkspaceMenu } from './inspect/workspace-menu';
export { cn } from './lib/cn';
export {
  type DayGroup,
  formatClock,
  formatCost,
  formatDuration,
  formatRelativeTime,
  formatTokens,
  groupByDay,
} from './lib/format';
// primitives
export { Button, buttonVariants, IconButton } from './primitives/button';
export { Chip } from './primitives/chip';
export { BoatMark, Icon, type IconName } from './primitives/icon';
export { IconSprite } from './primitives/icon-sprite';
export { Popover } from './primitives/popover';
export { ProgressRing } from './primitives/progress-ring';
export { ScrollArea } from './primitives/scroll-area';
export { SegmentedControl } from './primitives/segmented-control';
export { Switch } from './primitives/switch';
export { Textarea } from './primitives/textarea';
export { Toast } from './primitives/toast';
export { Tooltip } from './primitives/tooltip';
