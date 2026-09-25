import type { StatsSummary } from '@ice-ai/client';
import { formatCost, formatDurationMs, formatTokens } from '@ice-ai/client';
import { cn } from '../utils/cn';
import { PanelShell } from './panel-shell';

/**
 * SessionStatsPanel（docs/06 §4.3）：token / 花费 / 压缩统计 + 性能四项。
 * 性能四项只在**本进程跑过**的会话上有值（冷会话为 null → 不展示，而不是显示 0，docs/02 §11.1）。
 */
export interface SessionStatsPanelProps {
  summary: StatsSummary | null;
  /** 会话信息（条目数 / 文件 / 分支 / 关系） */
  info: {
    sessionId: string;
    filePath: string;
    messageCount: number;
    branch?: string;
    isWorktree?: boolean;
    model?: string;
    created: string;
    modified: string;
  };
  contextPercent: number | null;
  loading: boolean;
  onClose(): void;
  onReload?(): void;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="sq hairline border-line-1 bg-surface-side/60 px-3 py-2">
      <p className="text-[10.5px] text-fg-faint">{label}</p>
      <p className="mt-0.5 font-mono text-[15px] text-fg">{value}</p>
      {hint !== undefined && <p className="text-[10.5px] text-fg-faint">{hint}</p>}
    </div>
  );
}

export function SessionStatsPanel({
  summary,
  info,
  contextPercent,
  loading,
  onClose,
  onReload,
}: SessionStatsPanelProps) {
  return (
    <PanelShell
      title="会话统计"
      hint={info.sessionId.slice(0, 8)}
      onClose={onClose}
      actions={
        onReload === undefined ? undefined : (
          <button
            type="button"
            onClick={onReload}
            className="sq px-2 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg"
          >
            刷新
          </button>
        )
      }
    >
      {loading && <p className="py-2 text-[12px] text-fg-faint">加载中…</p>}
      {summary !== null && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="输入 tokens" value={formatTokens(summary.input)} />
            <StatCard label="输出 tokens" value={formatTokens(summary.output)} />
            <StatCard label="缓存读" value={formatTokens(summary.cacheRead)} />
            <StatCard label="花费" value={formatCost(summary.cost)} />
          </div>
          {contextPercent !== null && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-fg-subtle">
                <span>上下文占用</span>
                <span className="font-mono">{contextPercent.toFixed(1)}%</span>
              </div>
              <div className="sq h-1.5 overflow-hidden bg-line-2">
                <div
                  className={cn(
                    'h-full transition-all',
                    contextPercent > 85
                      ? 'bg-danger'
                      : contextPercent > 60
                        ? 'bg-warn'
                        : 'bg-accent',
                  )}
                  style={{ width: `${Math.min(100, contextPercent)}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard
              label="轮数"
              value={summary.rounds === null ? '—' : String(summary.rounds)}
              hint={summary.rounds === null ? '本进程未运行过' : undefined}
            />
            <StatCard label="步数" value={summary.steps === null ? '—' : String(summary.steps)} />
            <StatCard
              label="模型耗时"
              value={summary.llmMs === null ? '—' : formatDurationMs(summary.llmMs)}
            />
            <StatCard
              label="工具耗时"
              value={summary.toolMs === null ? '—' : formatDurationMs(summary.toolMs)}
            />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-fg-faint">
            <span>
              生成速度{' '}
              {summary.tokensPerSecond === null ? '—' : `${summary.tokensPerSecond.toFixed(1)} t/s`}
            </span>
            <span>消息 {info.messageCount} 条</span>
            {info.branch !== undefined && <span>分支 {info.branch}</span>}
            {info.model !== undefined && <span className="font-mono">{info.model}</span>}
          </div>
        </>
      )}
      <div className="mt-3 flex flex-col gap-0.5">
        <span className="text-[11px] text-fg-faint">会话文件</span>
        <span className="break-all font-mono text-[11px] text-fg-subtle">{info.filePath}</span>
      </div>
    </PanelShell>
  );
}
