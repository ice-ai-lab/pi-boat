import type { ExtensionStatusItem, ExtensionWidgetItem } from '@ice-ai/protocol';
import { stripAnsi } from './ansi';
import { AnsiText } from './ansi-text';
import { ExtensionWidgets } from './extension-widgets';

/** 逐字移植 pi-web `components/ExtensionStatusBar.tsx` 的文本清洗 */
export function sanitizeExtensionStatusText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' ').replace(/ +/g, ' ').trim())
    .join('\n')
    .trim();
}

export function formatExtensionStatusLine(statuses: ExtensionStatusItem[]): string {
  return [...statuses]
    .sort((a, b) => a.statusKey.localeCompare(b.statusKey))
    .map(({ statusText }) => sanitizeExtensionStatusText(statusText))
    .join(' ');
}

/**
 * 扩展货架（ADR-0020）：**单一** `.extension-status-shelf`，widgets 在前、status 在后。
 * 逐字移植 pi-web `components/ExtensionStatusBar.tsx`。
 */
export function ExtensionStatusBar({
  statuses,
  widgets = [],
}: {
  statuses: ExtensionStatusItem[];
  widgets?: ExtensionWidgetItem[];
}) {
  if (statuses.length === 0 && widgets.length === 0) return null;

  const statusLine = formatExtensionStatusLine(statuses);
  const plainStatusLine = stripAnsi(statusLine);

  return (
    <div
      className={`extension-status-shelf${widgets.length > 0 ? ' has-widgets' : ''}${statuses.length > 0 ? ' has-status' : ''}`}
    >
      {widgets.length > 0 && <ExtensionWidgets widgets={widgets} />}
      {statuses.length > 0 && (
        <div
          role="status"
          className="extension-status-line"
          aria-label={plainStatusLine}
          title={plainStatusLine}
        >
          <span className="extension-status-text">
            <AnsiText text={statusLine} />
          </span>
        </div>
      )}
    </div>
  );
}
