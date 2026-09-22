import { deleteSession, renameSession } from '@ice-ai/client';
import { getApiClient, queryKeys, useSessionsQuery } from '@ice-ai/client/react';
import { cn, groupByDay, Icon, IconButton, SessionListItem, WorkspaceMenu } from '@ice-ai/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAppState } from '../lib/app-state';
import { describeApiError } from '../lib/errors';
import { useToast } from '../lib/toast';

/**
 * 左侧栏（原型 `.sidebar`，docs/06 §4.4）：
 * 品牌行 → 新会话 + 搜索 → **文件夹空间** → 会话列表（按日分组，hover 出重命名/删除）→ 底栏。
 *
 * 会话数据走 `GET /api/sessions?projectKey=`（ADR-0008：分组的服务端事实来源是项目清单，
 * 不过滤 = 不自己从全量列表推导）。搜索是**当前列表内的客户端过滤**——服务端的
 * `/api/sessions/search` 是跨项目全文搜索，语义与原型这个「在列表里找」不同，M2 再分流。
 */
export function Sidebar() {
  const {
    projects,
    projectsLoading,
    workspaceKey,
    selectWorkspace,
    sidebarCollapsed,
    sidebarWidth,
    toggleSidebar,
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

  // 展开搜索即聚焦（原型行为；用 ref 而非 autoFocus——后者是页面级自动抢焦点，a11y 上不等价）
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
    <aside
      aria-hidden={sidebarCollapsed}
      className="hairline-r flex-none overflow-hidden border-line-3 bg-surface-side transition-[width] duration-200"
      style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
    >
      <div className="flex h-full flex-col" style={{ width: sidebarWidth }}>
        <div className="flex h-[52px] flex-none items-center justify-between pl-3.5 pr-2.5">
          <span className="flex items-center gap-2 text-[14px] font-semibold tracking-[0.02em]">
            <Icon name="boat" size={20} className="text-accent" />
            PiBoat
          </span>
          <IconButton icon="panel" title="收起侧边栏" onClick={toggleSidebar} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5 pb-2 pt-0.5 scrollbar-thin">
          <div className="mb-2.5 flex flex-none items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hairline flex h-[38px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border-line-3 bg-surface-raised text-[13px] font-medium elev-panel transition-colors hover:bg-hover"
            >
              <Icon name="plus" size={14} />
              新会话
            </button>
            <button
              type="button"
              title="搜索会话"
              aria-label="搜索会话"
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((open) => !open)}
              className={cn(
                'hairline flex size-[38px] flex-none items-center justify-center rounded-xl border-line-2 bg-surface-raised elev-panel transition-colors',
                searchOpen
                  ? 'border-accent text-accent'
                  : 'text-fg-subtle hover:bg-hover hover:text-fg',
              )}
            >
              <Icon name="search" size={16} />
            </button>
          </div>

          {/* 文件夹空间（原型 #wsBtn/#wsMenu）：默认是最近一次对话所在的项目 */}
          <div className="relative mb-1.5 flex-none">
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
                toast('在下方输入自定义工作目录');
              }}
            />
          </div>

          {searchOpen ? (
            <label className="mb-1.5 flex h-8 flex-none items-center gap-1.5 rounded-lg border-[0.5px] border-line-2 bg-surface-raised px-2.5 text-fg-faint transition-colors focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-weak)]">
              <Icon name="search" size={14} />
              {/* 展开即聚焦：由用户的按钮点击触发，不是页面级自动抢焦点 */}
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索会话…"
                aria-label="搜索会话关键词"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-faint"
              />
            </label>
          ) : null}

          <div className="mx-1 mb-1 mt-2.5 flex flex-none items-center justify-between text-[11px] font-medium tracking-[0.06em] text-fg-faint">
            <span>会话</span>
            {runningCount === 0 ? null : (
              <span className="inline-flex items-center gap-1 tracking-normal">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                {runningCount} 个会话运行中
              </span>
            )}
          </div>

          {sessionsQuery.isError ? (
            <p className="px-1 py-2 text-[11.5px] text-danger">
              {describeApiError(sessionsQuery.error)}
            </p>
          ) : null}

          {sessionsQuery.isPending ? (
            <p className="px-1 py-2 text-[11.5px] text-fg-faint">正在读取会话…</p>
          ) : null}

          {!sessionsQuery.isPending && visible.length === 0 ? (
            <p className="px-1 py-2 text-[11.5px] text-fg-faint">
              {needle === '' ? '这个文件夹空间还没有会话' : '没有匹配的会话'}
            </p>
          ) : null}

          {groups.map((group, index) => (
            <div key={group.label}>
              {/* 首组的标题就是上面的「会话」（原型同形） */}
              {groups.length > 1 && index > 0 ? (
                <div className="mx-1 mb-1 mt-2.5 flex-none text-[11px] font-medium tracking-[0.06em] text-fg-faint">
                  {group.label}
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

        <div className="flex flex-none items-center gap-0.5 border-t-[0.5px] border-line-1 px-2.5 py-2">
          <IconButton icon="spark" title="模型（M2）" disabled className="disabled:opacity-40" />
          <IconButton icon="book" title="技能（M2）" disabled className="disabled:opacity-40" />
          <IconButton icon="gear" title="设置（M2）" disabled className="disabled:opacity-40" />
          <span className="flex-1" />
          <span className="pr-1.5 text-[11px] text-fg-faint">v{__APP_VERSION__}</span>
        </div>
      </div>
    </aside>
  );
}
