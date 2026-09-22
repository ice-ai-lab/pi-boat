import {
  Icon,
  Popover,
  StatsCardGroup,
  type StatsCardGroupProps,
  SystemPromptPanel,
  ToolList,
} from '@ice-ai/ui';
import { type ReactNode, useEffect, useRef } from 'react';
import { useAppState } from '../lib/app-state';

/**
 * 中栏头部（原型 `.conv-header` + `.tab-row`）。
 *
 * 结构：`[展开侧边栏（仅折叠时）] [对话 vtab] [系统/工具/统计 chips] [右栏切换]`。
 * 原型的 `#convTitle` 默认 `hide`，这里同样只放在 DOM 里（不占位）。
 */
export interface ConvHeaderProps {
  title?: string;
  /** `.tools-bar` 内容（chips + 浮层），由路由按数据提供 */
  tools?: ReactNode;
}

export function ConvHeader({ title, tools }: ConvHeaderProps) {
  const { sidebarCollapsed, toggleSidebar, toggleRightbar } = useAppState();

  return (
    <header className="conv-header">
      {title === undefined ? null : (
        <h1 id="convTitle" className="hide">
          {title}
        </h1>
      )}
      <div className="tab-row">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="icon-btn"
            title="展开侧边栏"
            aria-label="展开侧边栏"
            onClick={toggleSidebar}
          >
            <Icon name="panel" size={16} />
          </button>
        ) : null}
        <nav className="view-tabs">
          <button type="button" className="vtab on">
            对话
          </button>
        </nav>
        {tools === undefined ? null : <div className="tools-bar">{tools}</div>}
        <div className="tab-right">
          <button
            type="button"
            className="icon-btn"
            title="切换文件面板"
            aria-label="切换文件面板"
            onClick={toggleRightbar}
          >
            <Icon name="panel" size={16} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>
      </div>
    </header>
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

/** 系统 / 工具 / 统计三个 chips 与浮层（原型 `.tools-bar` + `.pop`） */
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
  const chip = (name: PopName, icon: 'book' | 'wrench' | 'gauge', label: string): ReactNode => (
    <button
      type="button"
      className={open === name ? 'hchip on' : 'hchip'}
      aria-pressed={open === name}
      onClick={() => toggle(name)}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );

  return (
    <div className="tools-bar" ref={barRef}>
      {chip('sys', 'book', '系统')}
      {chip('tools', 'wrench', '工具')}
      {chip('stats', 'gauge', '统计')}

      <Popover
        open={open === 'sys'}
        onOpenChange={(value) => onOpenChange(value ? 'sys' : null)}
        icon="book"
        title="系统提示词"
        sub={
          systemPrompt === null || systemPrompt === ''
            ? undefined
            : `${systemPrompt.length.toLocaleString()} 字符`
        }
        width={560}
      >
        <SystemPromptPanel
          prompt={systemPrompt}
          loading={systemLoading}
          {...(onCopyPrompt === undefined ? {} : { onCopy: onCopyPrompt })}
        />
      </Popover>

      <Popover
        open={open === 'tools'}
        onOpenChange={(value) => onOpenChange(value ? 'tools' : null)}
        icon="wrench"
        title="工具定义"
        sub="M1 只读（预设切换归 core，M2）"
        width={560}
      >
        <ToolList />
      </Popover>

      <Popover
        open={open === 'stats'}
        onOpenChange={(value) => onOpenChange(value ? 'stats' : null)}
        icon="gauge"
        title="会话统计"
        width={680}
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
