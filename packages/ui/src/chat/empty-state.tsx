import { FolderOpen, Loader2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '../primitives/button';

/**
 * EmptyState（docs/06 §4.2）：hero + M1 承载 cwd 输入（原型 #heroSlot）。
 * 提交前只做字符串级校验（非空、绝对路径），存在性由 core 校验（400 → 展示错误）。
 */
export interface EmptyStateProps {
  onStart(cwd: string): void;
  starting: boolean;
  /** 上次使用的 cwd（startup-preferences，ADR-0019-4） */
  initialCwd?: string;
  error?: string | null;
}

export function EmptyState({ onStart, starting, initialCwd = '', error }: EmptyStateProps) {
  const [cwd, setCwd] = useState(initialCwd);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = cwd.trim();
    if (trimmed.length > 0 && !starting) onStart(trimmed);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
      <div className="flex w-(--chat-w) max-w-full flex-col items-center text-center">
        <p aria-hidden className="animate-[pb-float_4s_ease-in-out_infinite] text-5xl">
          🚢
        </p>
        <h2 className="mt-4 text-lg font-semibold text-fg">PiBoat</h2>
        <p className="mt-1.5 text-[13px] text-fg-subtle">输入一个工作目录，开始一段新的航行</p>
        <form onSubmit={submit} className="mt-6 flex w-full max-w-md items-center gap-2">
          <div className="sq hairline flex h-9 min-w-0 flex-1 items-center gap-2 border-line-2 bg-surface-raised px-3">
            <FolderOpen size={14} className="shrink-0 text-fg-faint" />
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="/path/to/project（绝对路径）"
              spellCheck={false}
              autoComplete="off"
              disabled={starting}
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
            />
          </div>
          <Button type="submit" variant="primary" disabled={starting || cwd.trim().length === 0}>
            {starting ? <Loader2 size={14} className="animate-spin" /> : '开始'}
          </Button>
        </form>
        {error !== undefined && error !== null && error.length > 0 && (
          <p className="sq mt-3 bg-danger-soft px-3 py-1.5 text-[12px] text-danger">{error}</p>
        )}
        <p className="mt-8 text-[11px] text-fg-faint">PiBoat · 一期（F1 对话 MVP）</p>
      </div>
    </div>
  );
}
