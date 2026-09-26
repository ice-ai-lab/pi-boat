import { clampPanelWidth } from '@ice-ai/client';
import {
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * 可拖拽面板（**逐字移植自 pi-web `hooks/useResizablePanel.ts`**；ADR-0020 布局结构照抄）。
 *
 * 行为：指针拖拽 / 键盘（方向键 12px、Shift 32px、Home/End 两端、Enter 复位）/ 双击复位 /
 * 宽度落 localStorage / 窗口 resize 与面板开合时重新夹紧 / 拖拽期间接管 body 光标与选中。
 * 宽度写进 `cssVariable`（`--sidebar-width` / `--right-panel-width`），CSS 负责动画。
 */
interface DragState {
  pointerId: number;
  startPosition: number;
  startWidth: number;
  target: HTMLDivElement;
  previousCursor: string;
  previousUserSelect: string;
}

interface UseResizablePanelOptions {
  ariaLabel: string;
  axis?: 'horizontal' | 'vertical';
  cssVariable: `--${string}`;
  defaultWidth: number;
  getDefaultWidth?: () => number;
  getMaxWidth: () => number;
  growthDirection: 'left' | 'right' | 'up' | 'down';
  maxWidth: number;
  minWidth: number;
  storageKey: string;
  widthRef: MutableRefObject<number>;
}

interface CommitOptions {
  forcePersist?: boolean;
  persist?: boolean;
}

function readStoredWidth(storageKey: string): number | null {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return null;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredWidth(storageKey: string, width: number): void {
  try {
    window.localStorage.setItem(storageKey, String(width));
  } catch {
    // 存储不可用时拖拽仍可用
  }
}

export function useResizablePanel(options: UseResizablePanelOptions) {
  const {
    ariaLabel,
    axis = 'horizontal',
    cssVariable,
    defaultWidth,
    getDefaultWidth,
    getMaxWidth,
    growthDirection,
    maxWidth,
    minWidth,
    storageKey,
    widthRef,
  } = options;
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const restoredRef = useRef(false);
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveMaxWidth = useCallback(
    () => Math.min(maxWidth, Math.max(minWidth, getMaxWidth())),
    [getMaxWidth, maxWidth, minWidth],
  );

  const clampWidth = useCallback(
    (candidate: number) => clampPanelWidth(candidate, minWidth, effectiveMaxWidth()),
    [effectiveMaxWidth, minWidth],
  );

  const applyLiveWidth = useCallback(
    (nextWidth: number) => {
      widthRef.current = nextWidth;
      panelRef.current?.style.setProperty(cssVariable, `${nextWidth}px`);
    },
    [cssVariable, widthRef],
  );

  const commitWidth = useCallback(
    (candidate: number, commitOptions: CommitOptions = {}) => {
      const { forcePersist = false, persist = true } = commitOptions;
      const nextWidth = clampWidth(candidate);
      const changed = nextWidth !== widthRef.current;
      applyLiveWidth(nextWidth);
      setWidth(nextWidth);
      if (persist && (changed || forcePersist)) writeStoredWidth(storageKey, nextWidth);
      return nextWidth;
    },
    [applyLiveWidth, clampWidth, storageKey, widthRef],
  );

  const restoreBodyState = useCallback((drag: DragState) => {
    document.body.style.cursor = drag.previousCursor;
    document.body.style.userSelect = drag.previousUserSelect;
  }, []);

  const finishResize = useCallback(
    (pointerId: number) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== pointerId) return;
      dragRef.current = null;
      restoreBodyState(drag);
      setIsResizing(false);
      commitWidth(widthRef.current, { forcePersist: true });

      try {
        if (drag.target.hasPointerCapture(pointerId)) {
          drag.target.releasePointerCapture(pointerId);
        }
      } catch {
        // 指针取消后浏览器可能已自动释放
      }
    },
    [commitWidth, restoreBodyState, widthRef],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const activeDrag = dragRef.current;
      if (activeDrag) finishResize(activeDrag.pointerId);

      const target = event.currentTarget;
      target.focus({ preventScroll: true });
      target.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startPosition: axis === 'vertical' ? event.clientY : event.clientX,
        startWidth: widthRef.current,
        target,
        previousCursor: document.body.style.cursor,
        previousUserSelect: document.body.style.userSelect,
      };
      document.body.style.cursor = axis === 'vertical' ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
      setIsResizing(true);
    },
    [axis, finishResize, widthRef],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        finishResize(event.pointerId);
        return;
      }
      event.preventDefault();

      const direction = growthDirection === 'right' || growthDirection === 'down' ? 1 : -1;
      const position = axis === 'vertical' ? event.clientY : event.clientX;
      const nextWidth = clampWidth(drag.startWidth + (position - drag.startPosition) * direction);
      applyLiveWidth(nextWidth);
      event.currentTarget.setAttribute('aria-valuenow', String(nextWidth));
      event.currentTarget.setAttribute('aria-valuetext', `${nextWidth} px`);
    },
    [applyLiveWidth, axis, clampWidth, finishResize, growthDirection],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      finishResize(event.pointerId);
    },
    [finishResize],
  );

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      finishResize(event.pointerId);
    },
    [finishResize],
  );

  const onLostPointerCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      finishResize(event.pointerId);
    },
    [finishResize],
  );

  const resetWidth = useCallback(() => {
    const nextDefault = getDefaultWidth?.() ?? defaultWidth;
    commitWidth(nextDefault, { forcePersist: true });
  }, [commitWidth, defaultWidth, getDefaultWidth]);

  const reclampWidth = useCallback(() => {
    commitWidth(widthRef.current);
  }, [commitWidth, widthRef]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 32 : 12;
      const positiveDirection = growthDirection === 'right' || growthDirection === 'down';
      const positiveKey = axis === 'vertical' ? 'ArrowDown' : 'ArrowRight';
      const negativeKey = axis === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
      const growKey = positiveDirection ? positiveKey : negativeKey;
      const shrinkKey = positiveDirection ? negativeKey : positiveKey;

      if (event.key === growKey) {
        event.preventDefault();
        commitWidth(widthRef.current + step, { forcePersist: true });
      } else if (event.key === shrinkKey) {
        event.preventDefault();
        commitWidth(widthRef.current - step, { forcePersist: true });
      } else if (event.key === 'Home') {
        event.preventDefault();
        commitWidth(minWidth, { forcePersist: true });
      } else if (event.key === 'End') {
        event.preventDefault();
        commitWidth(effectiveMaxWidth(), { forcePersist: true });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        resetWidth();
      }
    },
    [axis, commitWidth, effectiveMaxWidth, growthDirection, minWidth, resetWidth, widthRef],
  );

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const storedWidth = readStoredWidth(storageKey);
    const candidate = storedWidth ?? getDefaultWidth?.() ?? defaultWidth;
    const restoredWidth = commitWidth(candidate, { persist: false });
    if (storedWidth !== null && storedWidth !== restoredWidth) {
      writeStoredWidth(storageKey, restoredWidth);
    }
  }, [commitWidth, defaultWidth, getDefaultWidth, storageKey]);

  useEffect(() => {
    if (!restoredRef.current) return;
    commitWidth(widthRef.current);

    const onResize = () => {
      commitWidth(widthRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [commitWidth, widthRef]);

  useEffect(() => {
    if (!isResizing) return;
    const cancelResize = () => {
      const drag = dragRef.current;
      if (drag) finishResize(drag.pointerId);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') cancelResize();
    };
    window.addEventListener('blur', cancelResize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', cancelResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [finishResize, isResizing]);

  useEffect(() => {
    return () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      restoreBodyState(drag);
    };
  }, [restoreBodyState]);

  return {
    isResizing,
    panelRef,
    reclampWidth,
    resetWidth,
    separatorProps: {
      'aria-label': ariaLabel,
      'aria-orientation': axis === 'vertical' ? ('horizontal' as const) : ('vertical' as const),
      'aria-valuemax': mounted ? effectiveMaxWidth() : maxWidth,
      'aria-valuemin': minWidth,
      'aria-valuenow': width,
      'aria-valuetext': `${width} px`,
      onDoubleClick: resetWidth,
      onKeyDown,
      onLostPointerCapture,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      role: 'separator' as const,
      tabIndex: 0,
    },
    width,
  };
}
