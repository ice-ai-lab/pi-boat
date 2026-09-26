import { searchSessions } from '@ice-ai/client';
import type { SessionInfo, SessionSearchResponse } from '@ice-ai/protocol';
import { type ReactNode, useEffect, useState } from 'react';
import { formatRelativeTime } from '../i18n/format';
import { useI18n } from '../i18n/i18n-provider';

/**
 * 会话搜索结果（T2-3，逐字移植 pi-web `components/SessionSearch.tsx`）：
 * 打开且有查询时**替换**会话列表——三段式（标题 / cwd+时间 / 正文片段 + `<mark>` 高亮）
 * + `role=\"status\"` 计数行；300ms 防抖，只随查询变化重发。
 */
export interface SessionSearchProps {
  open: boolean;
  query: string;
  children: ReactNode;
  selectedSessionId: string | null;
  onSelectSession: (session: SessionInfo, entryId?: string, blockIndex?: number) => void;
}

export function SessionSearch({
  open,
  query,
  children,
  selectedSessionId,
  onSelectSession,
}: SessionSearchProps) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<{
    query: string;
    response?: SessionSearchResponse;
    failed?: boolean;
  }>({ query: '' });
  const search = query.trim();
  const response = state.query === search ? state.response : undefined;
  const failed = state.query === search && state.failed;

  // 只随查询变化重发：不依赖列表版本，避免结果正在被阅读时被轮询刷新重排
  useEffect(() => {
    if (!open || !search) return;
    const controller = new AbortController();
    setState({ query: search });
    const timer = setTimeout(() => {
      searchSessions(search)
        .then((data) => {
          if (!controller.signal.aborted) setState({ query: search, response: data });
        })
        .catch(() => {
          if (!controller.signal.aborted) setState({ query: search, failed: true });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, search]);

  return !open || !search ? (
    children
  ) : (
    <div className="min-h-20 flex-1 overflow-y-auto" aria-busy={!response && !failed}>
      <div role="status" className="px-3 py-2 text-xs text-text-muted">
        {failed
          ? t('sidebar.sessionSearchFailed')
          : !response
            ? t('sidebar.sessionSearching')
            : response.results.length === 0
              ? t('sidebar.sessionSearchEmpty')
              : t('sidebar.sessionSearchCount', { count: response.results.length })}
      </div>
      {response?.truncated && (
        <div role="status" className="px-3 pb-2 text-xs text-text-muted">
          {t('sidebar.sessionSearchPartial')}
        </div>
      )}
      {response?.results.map(({ session, entryId, blockIndex, before, match, after }) => (
        <button
          key={session.id}
          type="button"
          onClick={() => onSelectSession(session, entryId ?? undefined, blockIndex ?? undefined)}
          aria-current={session.id === selectedSessionId ? 'true' : undefined}
          className={`block w-full cursor-pointer border-b border-border px-3 py-2 text-left hover:bg-bg-hover focus-visible:outline-2 focus-visible:outline-accent ${session.id === selectedSessionId ? 'bg-bg-selected' : ''}`}
        >
          <span className="block truncate text-xs font-medium text-text">
            {session.name || session.firstMessage}
          </span>
          <span className="mt-1 flex min-w-0 gap-2 text-[10px] text-text-dim">
            <span className="min-w-0 flex-1 truncate" title={session.cwd}>
              {session.cwd}
            </span>
            <span className="shrink-0">{formatRelativeTime(session.modified, locale)}</span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed wrap-anywhere text-text-muted">
            {before}
            <mark className="rounded-sm bg-accent/20 text-text">{match}</mark>
            {after}
          </span>
        </button>
      ))}
    </div>
  );
}
