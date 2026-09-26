import type { ExtensionWidgetItem } from '@ice-ai/protocol';
import { useState } from 'react';

/**
 * ExtensionWidgets（ADR-0012）：扩展上报的多行小组件。
 * 结构/类名照抄 pi-web 的扩展货架（ADR-0020）：
 * `.extension-status-shelf` 内是 35px 的 `.extension-widget-triggers` 触发条，
 * 展开内容进 `.extension-widget-panels > .extension-widget-panel`（`--bg-panel` 底）。
 * 折叠策略移植 pi-web：默认展开 ≤3 行的 widget。
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
  const expandedWidget = widgets.find((widget) => widget.widgetKey === expandedKey);
  return (
    <div className="extension-status-shelf">
      <div className="extension-widget-triggers">
        {widgets.map((widget) => {
          const expanded = expandedKey === widget.widgetKey;
          return (
            <button
              key={widget.widgetKey}
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpandedKey(expanded ? null : widget.widgetKey)}
              title={widget.widgetKey}
              className={`extension-widget-trigger${expanded ? ' is-expanded' : ''}`}
            >
              <span className="extension-widget-key">{widget.widgetKey}</span>
              <span style={{ flexShrink: 0, color: 'var(--text-dim)' }}>
                {widget.widgetLines.length} 行
              </span>
            </button>
          );
        })}
      </div>
      {expandedWidget !== undefined && (
        <div className="extension-widget-panels">
          <div className="extension-widget-panel">
            <div className="extension-widget-panel-heading">{expandedWidget.widgetKey}</div>
            <pre className="extension-widget-content">{expandedWidget.widgetLines.join('\n')}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
