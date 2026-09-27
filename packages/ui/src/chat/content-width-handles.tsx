import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  type RefObject,
  useCallback,
  useRef,
} from 'react';
import styles from './chat.module.css';

/**
 * ContentWidthHandles：内容列两侧的宽度拖拽把手（设计规范 §8.4 `ContentWidthControls`，
 * 算法参照 deepseek-harness `ConversationWidthControls`）。
 *
 * - 双侧**全高** 12px 热区，位于内容列边缘外 24px（列宽不足时自动收窄到 0 → 不可点）
 * - hover / 拖动显示 2px 光条，光条跟随指针 Y（`--chat-handle-y`，±36px 渐隐）
 * - 拖动一侧 = **对称**改宽（内容居中，故总宽变化是指针位移的 2 倍）
 * - 滚轮落在把手上转发给消息滚动容器（`[data-chat-scroll]`）
 *
 * 组件只管指针几何，夹取与持久化由宿主负责（`onChange` 高频、`onCommit` 落盘）。
 */
export interface ContentWidthHandlesProps {
  /** 当前**实际**内容宽（px），作为拖动基准 */
  width: number;
  /** 拖动中（可能每帧触发）：宿主只更新宽度，不落盘 */
  onChange(width: number): void;
  /** 松手：宿主持久化 */
  onCommit(width: number): void;
  /** 无障碍标签 */
  label: string;
}

/** 对称改宽：内容居中，指针外移 dx ⇒ 总宽 +2dx */
function dragWidth(side: 'left' | 'right', base: number, dx: number): number {
  return base + (side === 'right' ? dx : -dx) * 2;
}

function cancelFrame(frame: RefObject<number | null>): void {
  if (frame.current !== null) {
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }
}

/** One pointer-captured width handle (left or right of the content column). */
function WidthHandle(props: {
  side: 'left' | 'right';
  label: string;
  onStart(): number;
  onDrag(width: number): void;
  onCommit(width: number): void;
  onEnd(): void;
}) {
  const dragging = useRef(false);
  const base = useRef(0);
  const origin = useRef(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);
  // 回调放进 ref：拖动过程中宿主重渲染不会让 pointerup 用到旧 width
  const callbacks = useRef(props);
  callbacks.current = props;

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = event.clientX;
    latest.current = event.clientX;
    base.current = callbacks.current.onStart();
    dragging.current = true;
    event.currentTarget.toggleAttribute('data-dragging', true);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const box = element.getBoundingClientRect();
    // 光条跟随指针 Y（hover 与拖动都跟）
    element.style.setProperty('--chat-handle-y', `${event.clientY - box.top}px`);
    if (!dragging.current) return;
    if (!element.hasPointerCapture(event.pointerId)) return;
    latest.current = event.clientX;
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null;
      const dx = latest.current - origin.current;
      callbacks.current.onDrag(dragWidth(callbacks.current.side, base.current, dx));
    });
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    dragging.current = false;
    event.currentTarget.toggleAttribute('data-dragging', false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    cancelFrame(frame);
    latest.current = event.clientX;
    // 只是点一下（没位移）不该用夹取后的显示值覆盖更宽的偏好
    if (latest.current !== origin.current) {
      const dx = latest.current - origin.current;
      callbacks.current.onCommit(dragWidth(callbacks.current.side, base.current, dx));
    }
    callbacks.current.onEnd();
  }, []);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.toggleAttribute('data-dragging', false);
    cancelFrame(frame);
    callbacks.current.onEnd();
  }, []);

  /** 滚轮落在把手上：转发给消息滚动容器（把手自身不滚动） */
  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.deltaY === 0) return;
    const scrollport =
      event.currentTarget.parentElement?.querySelector<HTMLElement>('[data-chat-scroll]');
    if (scrollport === null || scrollport === undefined) return;
    const line = Number.parseFloat(getComputedStyle(scrollport).lineHeight);
    const factor = event.deltaMode === 1 ? (Number.isFinite(line) ? line : 16) : 1;
    scrollport.scrollBy({ top: event.deltaY * factor });
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: <hr> 的命中盒不撑满（高度按 UA 规则为 0），热区必须用 div
    <div
      className={styles.widthHandle}
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      data-side={props.side}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onWheel={onWheel}
    />
  );
}

export function ContentWidthHandles({
  width,
  onChange,
  onCommit,
  label,
}: ContentWidthHandlesProps) {
  const onStart = useCallback((): number => width, [width]);
  const onEnd = useCallback((): void => {}, []);
  return (
    <>
      {(['left', 'right'] as const).map((side) => (
        <WidthHandle
          key={side}
          side={side}
          label={label}
          onStart={onStart}
          onDrag={onChange}
          onCommit={onCommit}
          onEnd={onEnd}
        />
      ))}
    </>
  );
}
