import type { MinimapBar } from '@ice-ai/client';
import { cn } from '../utils/cn';

/**
 * ChatMinimap（docs/06 §8.3）：轮密度条 + 视口区间高亮 + hover 预览 + 点击滚动。
 * ⚠️ 原型用 div 承担点击，这里改 `button`（可键盘访问，docs/06 §10-6）。
 */
export interface ChatMinimapProps {
  bars: MinimapBar[];
  onJump(index: number): void;
}

export function ChatMinimap({ bars, onJump }: ChatMinimapProps) {
  if (bars.length === 0) return null;
  return (
    <div className="group/mm pointer-events-none absolute right-2 top-0 bottom-0 z-20 flex w-3.5 flex-col items-end justify-center gap-[3px]">
      {bars.map((bar) => (
        <button
          key={bar.index}
          type="button"
          title={bar.preview}
          aria-label={`跳转到第 ${bar.index + 1} 轮：${bar.preview}`}
          onClick={() => onJump(bar.index)}
          className={cn(
            'pointer-events-auto h-[3px] w-3.5 shrink-0 rounded-full transition-all hover:w-5',
            bar.tone === 'error' && 'bg-danger',
            bar.tone === 'stopped' && 'bg-warn',
            bar.tone === 'streaming' && 'bg-accent',
            bar.tone === 'normal' && 'bg-line-3',
            bar.active && 'bg-accent w-5',
          )}
        />
      ))}
    </div>
  );
}
