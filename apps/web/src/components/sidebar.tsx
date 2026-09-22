import { deleteSession, renameSession } from '@ice-ai/client';
import { getApiClient, queryKeys, useSessionsQuery } from '@ice-ai/client/react';
import { cn, groupByDay, Icon, SessionListItem, WorkspaceMenu } from '@ice-ai/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAppState } from '../lib/app-state';
import { describeApiError } from '../lib/errors';
import { useToast } from '../lib/toast';

/**
 * 左侧栏（原型 `.sidebar`）：
 * 品牌行 → 新会话 + 搜索 → **文件夹空间** → 会话列表（按日分组，hover 出重命名/删除）→ 底栏。
 *
 * 会话数据走 `GET /api/sessions?projectKey=`（ADR-0008）。搜索是**当前列表内的客户端过滤**。
 */
export function Sidebar() {
  const {
    projects,
    projectsLoading,
    workspaceKey,
    selectWorkspace,
    toggleSidebar,
    theme,
    toggleTheme,
  } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();

  const sessionsQuery = useSessionsQuery(workspaceKey === null ? {} : { projectKey: workspaceKey });
  const sessions = sessionsQuery.data?.sessions ?? [];
  const runningIds = new Set(sessionsQuery.data?.runningSessionIds ?? []);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const needle = query.trim().toLowerCase();
  const visible =
    needle === ''
      ? sessions
      : sessions.filter((session) =>
          `${session.name ?? ''} ${session.firstMessage} ${session.cwd}`
            .toLowerCase()
            .includes(needle),
        );
  const groups = groupByDay(visible);
  const runningCount = visible.filter((session) => runningIds.has(session.id)).length;

  const activeSessionId = /^\/session\/([^/]+)/.exec(location.pathname)?.[1] ?? null;

  const invalidateList = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
  };

  const rename = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      renameSession(getApiClient(), input.id, { name: input.name }),
    onSuccess: () => {
      invalidateList();
      toast('已重命名');
    },
    onError: (cause) => toast(describeApiError(cause)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSession(getApiClient(), id),
    onSuccess: (result) => {
      invalidateList();
      toast(`已删除 ${result.deletedIds.length} 个会话`);
      if (activeSessionId !== null && result.deletedIds.includes(activeSessionId)) navigate('/');
    },
    onError: (cause) => toast(describeApiError(cause)),
  });

  const onRename = (sessionId: string, current: string): void => {
    const next = window.prompt('重命名会话', current);
    if (next === null || next.trim() === '' || next === current) return;
    rename.mutate({ id: sessionId, name: next.trim() });
  };

  const onDelete = (sessionId: string, title: string): void => {
    if (!window.confirm(`删除会话「${title === '' ? sessionId : title}」？子会话会一并删除。`))
      return;
    remove.mutate(sessionId);
  };

  return (
    <aside className="sidebar">
      <div className="sb-top">
        <div className="brand">
          <Icon name="boat" size={20} className="mark" />
          PiBoat
        </div>
        <button
          type="button"
          className="icon-btn"
          title="收起侧边栏"
          aria-label="收起侧边栏"
          onClick={toggleSidebar}
        >
          <Icon name="panel" size={16} />
        </button>
      </div>

      <div className="sb-scroll">
        <div className="sb-new-row">
          <button type="button" className="new-session sq" onClick={() => navigate('/')}>
            <Icon name="plus" size={14} />
            新会话
          </button>
          <button
            type="button"
            className={cn('search-toggle sq', searchOpen && 'on')}
            title="搜索会话"
            aria-label="搜索会话"
            aria-pressed={searchOpen}
            onClick={() => {
              const next = !searchOpen;
              setSearchOpen(next);
              if (!next) setQuery('');
            }}
          >
            <Icon name="search" size={16} />
          </button>
        </div>

        {/* 文件夹空间（原型 #wsBtn/#wsMenu）：默认是最近一次对话所在的项目 */}
        <WorkspaceMenu
          projects={projects}
          activeKey={workspaceKey}
          loading={projectsLoading}
          onSelect={(projectKey) => {
            selectWorkspace(projectKey);
            toast(
              `已切换空间：${projects.find((p) => p.projectKey === projectKey)?.cwd ?? projectKey}`,
            );
          }}
          onSelectCustom={() => {
            navigate('/');
            toast('在中间输入自定义工作目录');
          }}
        />

        {searchOpen ? (
          <div className="sb-search">
            <Icon name="search" size={14} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索会话…"
              aria-label="搜索会话关键词"
              spellCheck={false}
            />
          </div>
        ) : null}

        <div className="list-label">
          <span>会话</span>
          {runningCount === 0 ? null : (
            <span className="run-hint">
              <i />
              {runningCount} 个会话运行中
            </span>
          )}
        </div>

        {sessionsQuery.isError ? (
          <p style={{ padding: '4px 4px 8px', fontSize: 11.5, color: 'var(--red)' }}>
            {describeApiError(sessionsQuery.error)}
          </p>
        ) : null}

        {sessionsQuery.isPending ? (
          <p style={{ padding: '4px 4px', fontSize: 11.5, color: 'var(--t4)' }}>正在读取会话…</p>
        ) : null}

        {!sessionsQuery.isPending && visible.length === 0 ? (
          <p style={{ padding: '4px 4px', fontSize: 11.5, color: 'var(--t4)' }}>
            {needle === '' ? '这个文件夹空间还没有会话' : '没有匹配的会话'}
          </p>
        ) : null}

        {groups.map((group, index) => (
          <div key={group.label}>
            {/* 首组的标题就是上面的「会话」（原型同形） */}
            {groups.length > 1 && index > 0 ? (
              <div className="list-label">
                <span>{group.label}</span>
              </div>
            ) : null}
            {group.items.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                active={session.id === activeSessionId}
                running={runningIds.has(session.id)}
                onSelect={() => navigate(`/session/${session.id}`)}
                onRename={() => onRename(session.id, session.name ?? session.firstMessage ?? '')}
                onDelete={() => onDelete(session.id, session.name ?? session.firstMessage ?? '')}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <button type="button" className="icon-btn" title="模型（M2）" disabled>
          <Icon name="spark" size={16} />
        </button>
        <button type="button" className="icon-btn" title="技能（M2）" disabled>
          <Icon name="book" size={16} />
        </button>
        <button type="button" className="icon-btn" title="设置（M2）" disabled>
          <Icon name="gear" size={16} />
        </button>
        <span className="grow" />
        <button
          type="button"
          className="icon-btn"
          title="切换主题"
          aria-label="切换主题"
          onClick={toggleTheme}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <span className="ver num">v{__APP_VERSION__}</span>
      </div>
    </aside>
  );
}
