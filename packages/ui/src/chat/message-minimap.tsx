import type { RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '../lib/cn';

/**
 * 右缘消息 minimap（原型 `.minimap` + `.mm-bar` + `.mm-tip`）。
 *
 * 算法照原型 `buildMinimap()`：把 `.chat-col` 的直接子节点各画一条 3px 横杠，
 * `top = offsetTop / scrollHeight`；hover 出预览气泡，点击滚到该块。
 * `revision` 变化（turns 增长）时重建。
 */
export interface MessageMinimapProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  revision?: unknown;
  className?: string;
}

interface Bar {
  top: number;
  preview: string;
}

export function MessageMinimap({
  scrollRef,
  contentRef,
  revision,
  className,
}: MessageMinimapProps) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [hover, setHover] = useState<number | null>(null);

  const rebuild = useCallback(() => {
    const content = contentRef.current;
    const scroll = scrollRef.current;
    if (content === null || scroll === null) return;
    const total = Math.max(scroll.scrollHeight, 1);
    setBars(
      [...content.children].map((child) => ({
        top: Math.min(0.98, (child as HTMLElement).offsetTop / total) * 100,
        preview: (child.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      })),
    );
  }, [contentRef, scrollRef]);

  // revision 是「内容变化信号」：仅用于触发重建，值本身不参与计算
  useEffect(() => {
    void revision;
    const scroll = scrollRef.current;
    const content = contentRef.current;
    rebuild();
    const onScroll = () => {
      const el = scrollRef.current;
      if (el === null) return;
      const total = Math.max(el.scrollHeight, 1);
      setRange([el.scrollTop / total, (el.scrollTop + el.clientHeight) / total]);
    };
    onScroll();
    scroll?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', rebuild);
    // turns 会异步到达：childList 变化时重建（比只靠 revision 更稳）
    const observer = content === null ? null : new MutationObserver(rebuild);
    observer?.observe(content as Node, { childList: true, subtree: true, characterData: true });
    return () => {
      scroll?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', rebuild);
      observer?.disconnect();
    };
  }, [scrollRef, contentRef, rebuild, revision]);

  if (bars.length === 0) return null;

  const scrollToBlock = (index: number): void => {
    setHover(null);
    const target = contentRef.current?.children[index] as HTMLElement | undefined;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={cn('minimap', className)}>
      {hover === null ? null : (
        <div className="mm-tip" style={{ top: `${bars[hover]?.top ?? 0}%` }}>
          {bars[hover]?.preview}
        </div>
      )}
      {bars.map((bar, index) => {
        const at = bar.top / 100 >= range[0] && bar.top / 100 <= range[1];
        return (
          <button
            type="button"
            // biome-ignore lint/suspicious/noArrayIndexKey: 块顺序即身份
            key={index}
            className={cn('mm-bar', at && 'at')}
            style={{ top: `${bar.top}%` }}
            aria-label={bar.preview === '' ? `跳转到第 ${index + 1} 段` : bar.preview}
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onClick={() => scrollToBlock(index)}
          />
        );
      })}
    </div>
  );
}
