import type { ExtensionWidgetItem } from '@ice-ai/protocol';
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n-provider';
import { AnsiText } from './ansi-text';

/**
 * ExtensionWidgets（ADR-0012）：扩展上报的多行小组件。
 * 按设计规范：
 * - 更新脉冲：快照 diff + `is-updating` + `.extension-widget-update-pulse`（1100ms 空闲清除）
 * - 位置三角：`.extension-widget-placement` + `<svg aria-hidden="true" viewBox="0 0 8 6" data-direction>`
 * - 展开面板（`.extension-widget-panels`）渲染在触发条**之前**
 * - 折叠策略：默认展开行数 >1 且 ≤3 的 widget
 */
export const DEFAULT_EXPANDED_WIDGET_LINES = 3;
export const WIDGET_UPDATE_IDLE_MS = 1100;

export function formatExtensionWidgetContent(lines: string[]): string {
  return lines.join('\n');
}

export function snapshotExtensionWidgetContents(
  widgets: ExtensionWidgetItem[],
): Map<string, string[]> {
  return new Map(widgets.map((widget) => [widget.widgetKey, [...widget.widgetLines]]));
}

export function getUpdatedExtensionWidgetKeys(
  previous: ReadonlyMap<string, readonly string[]> | null,
  next: ReadonlyMap<string, readonly string[]>,
): string[] {
  if (!previous) return [];
  return Array.from(next, ([key, lines]) => {
    const previousLines = previous.get(key);
    if (!previousLines || previousLines.length !== lines.length) {
      return previousLines ? key : null;
    }
    return lines.some((line, index) => line !== previousLines[index]) ? key : null;
  }).filter((key): key is string => key !== null);
}

function getDefaultExpandedWidgetKey(widgets: ExtensionWidgetItem[]): string | null {
  return (
    widgets.find((widget) => {
      const lineCount = widget.widgetLines.length;
      return lineCount > 1 && lineCount <= DEFAULT_EXPANDED_WIDGET_LINES;
    })?.widgetKey ?? null
  );
}

export function getNextExpandedWidgetKey(
  currentKey: string | null,
  requestedKey: string,
): string | null {
  return currentKey === requestedKey ? null : requestedKey;
}

export function ExtensionWidgets({ widgets }: { widgets: ExtensionWidgetItem[] }) {
  const { t } = useI18n();
  const idPrefix = useId();
  const previousContentsRef = useRef<Map<string, string[]> | null>(null);
  const updateClearTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [expandedWidgetKey, setExpandedWidgetKey] = useState<string | null>(() =>
    getDefaultExpandedWidgetKey(widgets),
  );
  const [updatingWidgetKeys, setUpdatingWidgetKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const nextContents = snapshotExtensionWidgetContents(widgets);
    const updatedKeys = getUpdatedExtensionWidgetKeys(previousContentsRef.current, nextContents);
    previousContentsRef.current = nextContents;

    for (const [key, timer] of updateClearTimersRef.current) {
      if (nextContents.has(key)) continue;
      clearTimeout(timer);
      updateClearTimersRef.current.delete(key);
    }

    setUpdatingWidgetKeys((current) => {
      const next = new Set(Array.from(current).filter((key) => nextContents.has(key)));
      for (const key of updatedKeys) next.add(key);
      if (next.size === current.size && Array.from(next).every((key) => current.has(key)))
        return current;
      return next;
    });

    for (const key of updatedKeys) {
      const currentTimer = updateClearTimersRef.current.get(key);
      if (currentTimer) clearTimeout(currentTimer);
      updateClearTimersRef.current.set(
        key,
        setTimeout(() => {
          updateClearTimersRef.current.delete(key);
          setUpdatingWidgetKeys((current) => {
            if (!current.has(key)) return current;
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }, WIDGET_UPDATE_IDLE_MS),
      );
    }
  }, [widgets]);

  useEffect(
    () => () => {
      for (const timer of updateClearTimersRef.current.values()) clearTimeout(timer);
      updateClearTimersRef.current.clear();
    },
    [],
  );

  if (widgets.length === 0) return null;

  const expandedWidget = widgets.find(
    (widget) => widget.widgetKey === expandedWidgetKey && widget.widgetLines.length > 0,
  );

  const toggleWidget = (widget: ExtensionWidgetItem) => {
    setExpandedWidgetKey((current) => getNextExpandedWidgetKey(current, widget.widgetKey));
  };

  return (
    <>
      {expandedWidget && (
        <div className="extension-widget-panels">
          {(() => {
            const widget = expandedWidget;
            const index = widgets.indexOf(widget);
            const triggerId = `${idPrefix}-trigger-${index}`;
            const panelId = `${idPrefix}-panel-${index}`;
            return (
              <section
                key={widget.widgetKey}
                id={panelId}
                className="extension-widget-panel"
                aria-labelledby={triggerId}
              >
                <div className="extension-widget-panel-heading">{widget.widgetKey}</div>
                <pre className="extension-widget-content">
                  <AnsiText text={formatExtensionWidgetContent(widget.widgetLines)} />
                </pre>
              </section>
            );
          })()}
        </div>
      )}
      {/* biome-ignore lint/a11y/useSemanticElements: 触发条容器（设计规范同款 div + aria-label） */}
      <div
        role="group"
        className="extension-widget-triggers"
        aria-label={t('chat.extensionWidgets')}
      >
        {widgets.map((widget, index) => {
          const expandable = widget.widgetLines.length > 0;
          const expanded = expandable && widget.widgetKey === expandedWidget?.widgetKey;
          const updating = updatingWidgetKeys.has(widget.widgetKey);
          const lineCountLabel = t(
            widget.widgetLines.length === 1
              ? 'chat.extensionWidgetLine'
              : 'chat.extensionWidgetLines',
            { count: widget.widgetLines.length },
          );
          const placementLabel = t(
            widget.widgetPlacement === 'belowEditor'
              ? 'chat.extensionWidgetBelow'
              : 'chat.extensionWidgetAbove',
          );
          const triggerId = `${idPrefix}-trigger-${index}`;
          const panelId = `${idPrefix}-panel-${index}`;
          const content = (
            <>
              <span className="extension-widget-update-pulse" aria-hidden="true" />
              <span className="extension-widget-placement" aria-hidden="true">
                <svg
                  aria-hidden="true"
                  className="extension-widget-placement-icon"
                  viewBox="0 0 8 6"
                  width="8"
                  height="6"
                  data-direction={widget.widgetPlacement === 'belowEditor' ? 'down' : 'up'}
                  focusable="false"
                >
                  <path
                    d={widget.widgetPlacement === 'belowEditor' ? 'M0 0h8L4 6z' : 'M4 0l4 6H0z'}
                  />
                </svg>
              </span>
              <span className="extension-widget-key">{widget.widgetKey}</span>
            </>
          );

          return expandable ? (
            <button
              key={widget.widgetKey}
              id={triggerId}
              type="button"
              className={`extension-widget-trigger${expanded ? ' is-expanded' : ''}${updating ? ' is-updating' : ''}`}
              aria-controls={panelId}
              aria-expanded={expanded}
              aria-label={`${placementLabel}: ${widget.widgetKey}, ${lineCountLabel}`}
              title={`${widget.widgetKey} - ${placementLabel} - ${expanded ? t('i18n.collapse') : t('i18n.expand')}`}
              onClick={() => toggleWidget(widget)}
            >
              {content}
            </button>
          ) : (
            // biome-ignore lint/a11y/useSemanticElements: 非可交互挂件触发器（设计规范同款 div）
            <div
              key={widget.widgetKey}
              role="group"
              className={`extension-widget-trigger${updating ? ' is-updating' : ''}`}
              aria-label={`${placementLabel}: ${widget.widgetKey}, ${lineCountLabel}`}
              title={`${widget.widgetKey} - ${placementLabel}`}
            >
              {content}
            </div>
          );
        })}
      </div>
    </>
  );
}
