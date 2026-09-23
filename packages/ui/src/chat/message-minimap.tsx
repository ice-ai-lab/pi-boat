import { type RefObject, useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';

/**
 * 会话 minimap（原型 `.minimap` + `.mmbar` + `.mmtip`）：右缘一列 3px 竖条，
 * 每条对应一轮对话，**条高 ≈ 该轮实际高度占比**（`turnHeight / viewportHeight`），
 * 末轮流式中的条带 `.live` 脉动；悬停浮出 `.mmtip`（标题 + 元信息），点击滚动到该轮。
 *
 * 测量逻辑：监听滚动容器 resize/scroll 与轮数量变化，读 `data-turn-id` 元素的
 * `offsetHeight`，按可视高度归一到 [10, 72]px 区间。
 */
export interface MessageMinimapProps {
  /** 滚动容器（`.conv-scroll`）；条目标为其中 `[data-turn-id]` 元素 */
  viewportRef: RefObject<HTMLElement | null>;
  /** 轮摘要（用于条高与浮层文案；id 必须与 DOM 的 data-turn-id 一致） */
  turns: Array<{
    id: string;
    title: string;
    toolCallCount?: number;
    durationMs?: number;
  }>;
  /** 末轮是否流式中（live 条） */
  liveTail?: boolean;
  className?: string;
}

interface Bar {
  id: string;
  height: number;
  title: string;
  meta: string;
}

export function MessageMinimap({
  viewportRef,
  turns,
  liveTail = false,
  className,
}: MessageMinimapProps) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [hover, setHover] = useState<{ index: number; top: number } | null>(null);

  const measure = () => {
    const vp = viewportRef.current;
    if (vp === null) return;
    const vh = vp.clientHeight || 1;
    const next: Bar[] = [];
    for (const turn of turns) {
      const el = vp.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(turn.id)}"]`);
      const raw = el === null ? 24 : el.offsetHeight;
      next.push({
        id: turn.id,
        height: Math.max(10, Math.min(72, Math.round((raw / vh) * 100))),
        title: turn.title,
        meta: [
          turn.toolCallCount === undefined ? null : `${turn.toolCallCount} 工具调用`,
          formatDuration(turn.durationMs),
        ]
          .filter((part): part is string => part !== null)
          .join(' · '),
      });
    }
    setBars(next);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: turns 变化即重新测量
  useEffect(() => {
    measure();
    const vp = viewportRef.current;
    if (vp === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(vp);
    return () => observer.disconnect();
  }, [turns, viewportRef]);

  if (bars.length === 0) return null;

  const tip = hover === null ? null : (bars[hover.index] ?? null);

  const scrollTo = (id: string) => {
    const vp = viewportRef.current;
    const el = vp?.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(id)}"]`);
    if (vp === null || vp === undefined || el === null || el === undefined) return;
    vp.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
  };

  return (
    <nav className={cn('minimap', className)} aria-label="会话导航">
      {bars.map((bar, index) => (
        <button
          key={bar.id}
          type="button"
          aria-label={bar.title}
          className={cn('mmbar', liveTail && index === bars.length - 1 && 'live')}
          style={{ height: `${bar.height}px` }}
          onClick={() => scrollTo(bar.id)}
          onMouseEnter={(event) => setHover({ index, top: event.currentTarget.offsetTop })}
          onMouseLeave={() => setHover(null)}
        />
      ))}
      <div
        id="mmtip"
        className={cn('mmtip', hover !== null && 'show')}
        style={hover === null ? undefined : { top: `${Math.max(0, hover.top - 8)}px` }}
      >
        <div className="t1">{tip?.title ?? ''}</div>
        <div className="t2">{tip?.meta ?? ''}</div>
      </div>
    </nav>
  );
}
