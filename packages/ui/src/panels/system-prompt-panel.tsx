import { PanelShell } from './panel-shell';

/**
 * SystemPromptPanel（docs/06 §11.2）：整宽面板 + `pre-wrap` + 等宽。
 * 展示的是 pi 的**结构化 prompt**（不是某次请求实际下发的），故不标「实际下发」、
 * 不加版本号/token 估算（ADR-0015）。两态文案：加载中 / 尚未加载。
 */
export interface SystemPromptPanelProps {
  prompt: string | null;
  loading: boolean;
  onClose(): void;
  onReload?(): void;
}

export function SystemPromptPanel({ prompt, loading, onClose, onReload }: SystemPromptPanelProps) {
  return (
    <PanelShell
      title="系统提示词"
      hint="pi 的结构化 prompt（非某次请求实际下发）"
      onClose={onClose}
      actions={
        onReload === undefined ? undefined : (
          <button
            type="button"
            onClick={onReload}
            className="sq px-2 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg"
          >
            重新读取
          </button>
        )
      }
    >
      {loading && <p className="py-2 text-[12px] text-fg-faint">正在加载…</p>}
      {!loading && prompt === null && (
        <p className="py-2 text-[12px] text-fg-faint">尚未加载（冷会话需先恢复运行时）</p>
      )}
      {!loading && prompt !== null && (
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.6] text-fg-muted">
          {prompt}
        </pre>
      )}
    </PanelShell>
  );
}
