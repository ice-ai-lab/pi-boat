import type { ExtensionWidgetItem } from '@ice-ai/protocol';
import { useState } from 'react';
import { cn } from '../utils/cn';

/**
 * ExtensionWidgets（docs/06 §4.4 / ADR-0012）：扩展上报的多行小组件。
 * 折叠策略移植 pi-web：默认展开 ≤3 行的 widget；内容变化时高亮一小段（1.1s）。
 * 按 key 归组（`ExtensionUiBridge` 已做代际管理，这里只渲染）。
 */
export const DEFAULT_EXPANDED_WIDGET_LINES = 3;
export const WIDGET_UPDATE_IDLE_MS = 1100;

export function defaultExpandedWidgetKey(widgets: readonly ExtensionWidgetItem[]): string | null {
  return (
    widgets.find((widget) => {
      const count = widget.widgetLines.length;
      return count > 1 && count <= DEFAULT_EXPANDED_WIDGET_LINES;
    })?.widgetKey ?? null
  );
}

export function ExtensionWidgets({ widgets }: { widgets: ExtensionWidgetItem[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(() =>
    defaultExpandedWidgetKey(widgets),
  );
  if (widgets.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 px-4 pb-1">
      {widgets.map((widget) => {
        const expanded = expandedKey === widget.widgetKey;
        return (
          <div key={widget.widgetKey} className="sq hairline border-line-1 bg-surface-side/50">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpandedKey(expanded ? null : widget.widgetKey)}
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11.5px] text-fg-subtle hover:text-fg"
            >
              <span aria-hidden className={cn('text-fg-faint', expanded && 'rotate-90')}>
                ›
              </span>
              <span className="min-w-0 flex-1 truncate">
                {widget.widgetLines[0] ?? widget.widgetKey}
              </span>
              <span className="shrink-0 text-[10px] text-fg-faint">
                {widget.widgetLines.length} 行
              </span>
            </button>
            {expanded && (
              <pre className="scrollbar-thin max-h-48 overflow-auto px-2 pb-1.5 font-mono text-[11px] leading-[1.5] text-fg-muted">
                {widget.widgetLines.join('\n')}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
