import type { ExtensionStatusItem } from '@ice-ai/protocol';

/**
 * ExtensionStatusBar（ADR-0012）：扩展上报的状态项（状态栏短文本）。
 * 视觉照抄 pi-web 的 `.extension-status-line`：35px 高、mono 11px、上描边。
 * 只展示——写状态的是扩展自己经 SDK 的 setStatus，前端仅订阅 `extensionStatuses`。
 */
export function ExtensionStatusBar({ statuses }: { statuses: ExtensionStatusItem[] }) {
  if (statuses.length === 0) return null;
  return (
    <div className="extension-status-line" style={{ borderTop: '1px solid var(--border)' }}>
      <span className="extension-status-text">
        {statuses.map((status) => (
          <span key={status.statusKey} title={status.statusKey}>
            {status.statusText}
          </span>
        ))}
      </span>
    </div>
  );
}
