import {
  EMPTY_CURSOR,
  type HistoryCursor,
  historyNext,
  historyPrev,
  pushHistory,
} from '@ice-ai/client';
import { useCallback, useEffect, useState } from 'react';

/**
 * 输入历史（F5）：按会话持久化到 localStorage（上限 100 条，见 client 的 pushHistory）。
 * ↑↓ 导航由 ChatPane 的 onKeyDown 驱动，这里只持有状态。
 */
export function useInputHistory(sessionId: string | null) {
  const storageKey = `piboat:input-history:${sessionId ?? 'none'}`;
  const [history, setHistory] = useState<string[]>(() => readHistory(storageKey));
  const [cursor, setCursor] = useState<HistoryCursor>(EMPTY_CURSOR);

  // 会话切换（含「URL → 会话」的异步到位）：重读该会话的历史。
  // 不能只靠 useState 初始化——首帧 sessionId 还是 null，键会落在 none 上。
  useEffect(() => {
    setHistory(readHistory(storageKey));
    setCursor(EMPTY_CURSOR);
  }, [storageKey]);

  const remember = useCallback(
    (text: string) => {
      setHistory((previous) => {
        const next = pushHistory(previous, text);
        writeHistory(storageKey, next);
        return next;
      });
      setCursor(EMPTY_CURSOR);
    },
    [storageKey],
  );

  const prevValue = useCallback(
    (draft: string) => {
      const result = historyPrev(history, cursor, draft);
      setCursor(result.cursor);
      return result.value;
    },
    [history, cursor],
  );

  const nextValue = useCallback(
    (draft: string) => {
      const result = historyNext(history, cursor, draft);
      setCursor(result.cursor);
      return result.value;
    },
    [history, cursor],
  );

  const resetCursor = useCallback(() => setCursor(EMPTY_CURSOR), []);

  return { history, cursor, remember, prevValue, nextValue, resetCursor };
}

function readHistory(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeHistory(key: string, history: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(history));
  } catch {
    // best-effort
  }
}
