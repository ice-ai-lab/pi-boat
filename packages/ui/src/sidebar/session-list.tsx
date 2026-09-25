import {
  getSessionListHeight,
  getSessionListIndices,
  SESSION_LIST_ITEM_HEIGHT,
} from '@ice-ai/client';
import type { SessionInfo } from '@ice-ai/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionRow } from './session-row';

/**
 * SessionList（窗口化，A 类移植自 pi-web SessionSidebar 的列表实现）：
 * 只挂载可视切片 + overscan，几千会话也不卡（docs/08 §2.1 窗口化条目）。
 */
export interface SessionListProps {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  runningSessionIds: ReadonlySet<string>;
  onSelect(sessionId: string): void;
  onRename(sessionId: string, name: string): void;
  onDelete(sessionId: string): void;
}

export function SessionList({
  sessions,
  activeSessionId,
  runningSessionIds,
  onSelect,
  onRename,
  onDelete,
}: SessionListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const setRef = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element;
  }, []);

  // 视口高度随容器尺寸变化（拖拽侧栏宽度/窗口缩放）
  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const update = () => setViewportHeight(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const indices = getSessionListIndices(sessions.length, scrollTop, viewportHeight);

  return (
    <div
      ref={setRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1"
    >
      <div style={{ height: getSessionListHeight(sessions.length), position: 'relative' }}>
        {indices.map((index) => {
          const session = sessions[index];
          if (session === undefined) return null;
          return (
            <div
              key={session.id}
              style={{
                position: 'absolute',
                top: index * SESSION_LIST_ITEM_HEIGHT,
                left: 0,
                right: 0,
              }}
            >
              <SessionRow
                session={session}
                active={session.id === activeSessionId}
                running={runningSessionIds.has(session.id)}
                onSelect={() => onSelect(session.id)}
                onRename={(name) => onRename(session.id, name)}
                onDelete={() => onDelete(session.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
