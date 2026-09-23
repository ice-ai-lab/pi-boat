import {
  DEFAULT_TOOLS,
  formatCost,
  formatTokens,
  Icon,
  Popover,
  ProgressRing,
  type SessionStatsDisplay,
  StatsCardGroup,
  type StatsCardGroupProps,
  SystemPromptPanel,
  ToolList,
} from '@ice-ai/ui';
import { type ReactNode, useEffect, useRef } from 'react';
import { useAppState } from '../lib/app-state';

/**
 * 中栏头部（原型 `.head` 三段网格：`.head-l` / `.metrics` / `.head-r`）。
 *
 * `metrics` 是中列指标（`HeaderMetrics`），`tools` 是右列 chips + 浮层，均由路由按数据提供。
 */
export interface ConvHeaderProps {
  title?: string;
  /** 会话是否运行中（`.live` 徽章） */
  running?: boolean;
  /** 中列指标（原型 `.metrics`），由路由用 `HeaderMetrics` 组装 */
  metrics?: ReactNode;
  /** 右列 chips + 浮层（`HeaderTools`） */
  tools?: ReactNode;
}

export function ConvHeader({ title, running = false, metrics, tools }: ConvHeaderProps) {
  const { sidebarCollapsed, toggleSidebar, toggleRightbar } = useAppState();

  return (
    <header className="head">
      <div className="head-l">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="ico-btn"
            title="展开侧边栏"
            aria-label="展开侧边栏"
            onClick={toggleSidebar}
          >
            <Icon name="panel" size={15} />
          </button>
        ) : null}
        <span className="vtab">对话</span>
        {title === undefined ? null : <span className="head-title">{title}</span>}
        {running ? (
          <span className="live">
            <span className="pdot" />
            进行中
          </span>
        ) : null}
      </div>
      {metrics}
      <div className="head-r">
        {tools}
        <span className="vr" />
        <button
          type="button"
          className="ico-btn"
          title="切换文件面板"
          aria-label="切换文件面板"
          onClick={toggleRightbar}
        >
          <Icon name="panel" size={15} />
        </button>
      </div>
    </header>
  );
}

/** token 数缩写（原型 `.num` 风格）统一走 ui 的 `formatTokens`：12 / 12.4k / 1.2m */

export interface HeaderMetricsProps {
  tokens?: SessionStatsDisplay;
  /** 点击打开统计浮层（pop 状态由路由持有） */
  onOpenStats: () => void;
}

/** 中列指标（原型 `.metrics`）：in · out · cache · $ 与上下文占用环，点击开统计浮层。 */
export function HeaderMetrics({ tokens, onOpenStats }: HeaderMetricsProps) {
  const pct = tokens === undefined ? 0 : (tokens.contextPercent ?? 0);
  const num = (value: number | undefined): string => formatTokens(value) ?? '—';
  return (
    <button
      type="button"
      className="metrics"
      id="metricsBtn"
      onClick={onOpenStats}
      title="会话统计"
    >
      <span>
        <b className="num">{num(tokens?.input)}</b> in
      </span>
      <span className="sep">·</span>
      <span>
        <b className="num">{num(tokens?.output)}</b> out
      </span>
      <span className="sep">·</span>
      <span>
        <b className="num">{num(tokens?.cacheRead)}</b> cache
      </span>
      <span className="sep">·</span>
      <span>
        <b className="num">{formatCost(tokens?.cost) ?? '—'}</b>
      </span>
      <ProgressRing value={pct} />
      <b className="num">{Math.round(pct)}%</b>
    </button>
  );
}

export interface HeaderToolsProps {
  systemPrompt: string | null;
  systemLoading?: boolean;
  onCopyPrompt?: () => void;
  stats?: StatsCardGroupProps;
  /** 受控：会话页的统计 pills 也要能打开统计浮层，故状态由路由持有 */
  open: PopName | null;
  onOpenChange: (name: PopName | null) => void;
}

export type PopName = 'sys' | 'tools' | 'stats';

/** 系统 / 工具 / 统计三个 chips 与浮层（原型 `.head-r` 里的 `.chip` + `.pop`） */
export function HeaderTools({
  systemPrompt,
  systemLoading = false,
  onCopyPrompt,
  stats,
  open,
  onOpenChange,
}: HeaderToolsProps) {
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (barRef.current?.contains(event.target as Node) === true) return;
      if (target?.closest('[data-x]') !== null) return;
      onOpenChange(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  const toggle = (name: PopName): void => onOpenChange(open === name ? null : name);
  const chip = (name: PopName, icon: 'sys' | 'wrench', label: string): ReactNode => (
    <button
      type="button"
      className={open === name ? 'chip on' : 'chip'}
      aria-pressed={open === name}
      onClick={() => toggle(name)}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );

  return (
    <div className="head-tools" ref={barRef}>
      {chip('sys', 'sys', '系统')}
      {chip('tools', 'wrench', '工具')}

      <Popover
        id="popSys"
        open={open === 'sys'}
        onOpenChange={(value) => onOpenChange(value ? 'sys' : null)}
        title="系统提示词"
      >
        <SystemPromptPanel
          prompt={systemPrompt}
          loading={systemLoading}
          {...(onCopyPrompt === undefined ? {} : { onCopy: onCopyPrompt })}
        />
      </Popover>

      <Popover
        id="popTools"
        open={open === 'tools'}
        onOpenChange={(value) => onOpenChange(value ? 'tools' : null)}
        title={`工具 · ${DEFAULT_TOOLS.filter((tool) => tool.enabled).length} 已启用`}
      >
        <ToolList />
      </Popover>

      <Popover
        id="popStats"
        open={open === 'stats'}
        onOpenChange={(value) => onOpenChange(value ? 'stats' : null)}
        title="会话统计"
        bodyClassName={null}
      >
        {stats === undefined ? (
          <p style={{ fontSize: 12, color: 'var(--t3)' }}>还没有会话数据。</p>
        ) : (
          <StatsCardGroup {...stats} />
        )}
      </Popover>
    </div>
  );
}
