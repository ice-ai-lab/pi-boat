import { sumUsage } from '@ice-ai/client';
import { queryKeys, useAgentRunningStateQuery, useAgentSession } from '@ice-ai/client/react';
import type { SessionStatsDisplay } from '@ice-ai/ui';
import { Button, Composer, Icon, MessageList, StatsPills, SystemPromptPanel } from '@ice-ai/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ConvHeader } from '../components/conv-header';
import { useToast } from '../lib/toast';

/**
 * 会话页（中栏，原型 `.conv-header` + `.center-body` + `.composer-seat`）。
 * 外壳（左侧栏）在 `AppShell`，本组件只负责中栏。
 *
 * 数据来源两条腿（docs/05 §5.3）：事件流（`useAgentSession` 的 SSE + fold）
 * ∪ REST 历史（context + rebuild）。刷新后会话不在注册表 → 只有历史，可读不可续
 * （恢复能力归 M2），此状态在正文里明确告知，不假装还能继续。
 */
export function SessionRoute() {
  const params = useParams();
  const sessionId = params.sessionId ?? '';
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const session = useAgentSession(sessionId);
  const [input, setInput] = useState('');
  const [systemOpen, setSystemOpen] = useState(false);
  const runningState = useAgentRunningStateQuery(sessionId);

  // 首条消息：首页只建空会话（ensure_session），把消息带到这里再发——
  // 保证「先建 SSE、再发 prompt」，首发轮次也能拿到流式增量（docs/05 §5.1 时序）。
  const firstMessage = (location.state as { firstMessage?: string } | null)?.firstMessage ?? null;
  const sentFirst = useRef(false);
  const connected = session.view.connected;
  const send = session.send;
  useEffect(() => {
    if (firstMessage === null || sentFirst.current || !connected) return;
    sentFirst.current = true;
    // 立刻清掉路由 state：刷新后不重发（M1 无会话恢复，重发会建两条用户消息）
    navigate(location.pathname, { replace: true, state: null });
    void send(firstMessage).then(() => {
      // 新会话此刻才落盘（ensure_session 只建内存会话）→ 让左侧栏列表看到它
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    });
  }, [firstMessage, connected, send, navigate, location.pathname, queryClient]);

  const state = session.view.state;
  const usage = sumUsage(session.turns);
  const stats: SessionStatsDisplay = {
    input: usage?.input,
    output: usage?.output,
    cacheRead: usage?.cacheRead,
    cacheWrite: usage?.cacheWrite,
    cost: usage?.cost.total,
    contextTokens: state?.contextUsage?.tokens,
    contextWindow: state?.contextUsage?.contextWindow,
    contextPercent: state?.contextUsage?.percent,
  };

  const firstUserText = session.turns.find((turn) => turn.user.text !== '')?.user.text ?? '';
  const title = session.view.sessionName ?? (firstUserText.slice(0, 48) || '新会话');
  const notRunning =
    session.turns.length > 0 && !session.streaming && runningState.data?.running === false;
  const focused = runningState.data?.running === true ? runningState.data.state : null;

  const submit = async (): Promise<void> => {
    const text = input;
    if (text.trim() === '') return;
    setInput('');
    await session.send(text);
  };

  return (
    <>
      <ConvHeader title={title}>
        <Button
          variant="chip"
          aria-pressed={systemOpen}
          onClick={() => setSystemOpen(!systemOpen)}
          className={systemOpen ? 'bg-accent-weak text-accent' : undefined}
        >
          <Icon name="book" size={14} />
          系统
        </Button>
        <Button variant="chip" onClick={() => navigate('/')}>
          <Icon name="plus" size={14} />
          新会话
        </Button>
      </ConvHeader>

      {systemOpen ? (
        <div className="flex-none border-b-[0.5px] border-line-3 bg-surface-side px-6 py-4">
          <SystemPromptPanel
            prompt={focused === null ? null : focused.systemPrompt}
            loading={runningState.isPending}
            onCopy={() => toast('系统提示词已复制到剪贴板')}
            className="mx-auto w-full max-w-[760px]"
          />
        </div>
      ) : null}

      {session.error !== null ? (
        <Banner tone="error" text={session.error} onClose={session.clearError} />
      ) : null}
      {session.view.notice !== null ? <Banner tone="info" text={session.view.notice} /> : null}
      {notRunning ? (
        <Banner
          tone="info"
          text="该会话未在运行（M1 不支持恢复，M2 提供）；以下是历史记录，只读。"
        />
      ) : null}

      <MessageList
        turns={session.turns}
        liveTail={session.streaming}
        forceScrollSignal={session.turns.length}
        footer={<StatsPills stats={stats} />}
        empty={
          <div className="flex flex-1 items-center justify-center text-[13px] text-fg-subtle">
            {session.view.connected ? '正在等待第一条消息…' : '正在连接会话…'}
          </div>
        }
      />

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => void submit()}
        onAbort={() => void session.abort()}
        streaming={session.streaming}
        model={state?.model ?? null}
        disabled={notRunning}
        placeholder={notRunning ? '会话未运行，无法继续（M2 支持恢复）' : '消息… 输入 / 使用命令'}
      />
    </>
  );
}

function Banner({
  tone,
  text,
  onClose,
}: {
  tone: 'info' | 'error';
  text: string;
  onClose?: () => void;
}) {
  return (
    <div
      role="status"
      className={`flex flex-none items-center gap-2 px-6 py-2 text-[12px] ${
        tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-accent'
      }`}
    >
      <span className="min-w-0 flex-1">{text}</span>
      {onClose === undefined ? null : (
        <button type="button" onClick={onClose} className="text-[11px] underline">
          知道了
        </button>
      )}
    </div>
  );
}
