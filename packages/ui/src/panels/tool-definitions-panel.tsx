import { Check } from 'lucide-react';
import { cn } from '../utils/cn';
import { PanelShell } from './panel-shell';

/** 工具项（协议 ToolInfo 的展示子集） */
export interface ToolDefinitionView {
  name: string;
  description: string;
  /** 出现在当前激活工具集里 */
  active: boolean;
}

/**
 * ToolDefinitionsPanel（docs/06 §4.4）：工具清单 + 激活标记。
 * 预设切换在输入卡控制条上（ComposerToolbar），这里只读展示。
 */
export interface ToolDefinitionsPanelProps {
  tools: ToolDefinitionView[];
  loading: boolean;
  onClose(): void;
  onReload?(): void;
}

export function ToolDefinitionsPanel({
  tools,
  loading,
  onClose,
  onReload,
}: ToolDefinitionsPanelProps) {
  const activeCount = tools.filter((tool) => tool.active).length;
  return (
    <PanelShell
      title="工具"
      hint={`${activeCount}/${tools.length} 个已激活`}
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
      {loading && <p className="py-2 text-[12px] text-fg-faint">加载中…</p>}
      {!loading && tools.length === 0 && (
        <p className="py-2 text-[12px] text-fg-faint">没有可用工具（可能是纯聊天会话）</p>
      )}
      <div className="flex flex-col">
        {tools.map((tool) => (
          <div
            key={tool.name}
            className="hairline-b flex items-start gap-2 border-line-1 py-2 last:border-b-0"
          >
            <span
              className={cn(
                'sq mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center',
                tool.active ? 'bg-success-soft text-success' : 'bg-surface-side text-fg-faint',
              )}
              title={tool.active ? '已激活' : '未激活'}
            >
              {tool.active ? <Check size={10} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block font-mono text-[12px]',
                  tool.active ? 'text-fg' : 'text-fg-faint',
                )}
              >
                {tool.name}
              </span>
              <span className="mt-0.5 block text-[11.5px] text-fg-faint">{tool.description}</span>
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
