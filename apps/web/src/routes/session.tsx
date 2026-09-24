import { sumUsage } from '@ice-ai/client';
import {
  queryKeys,
  useAgentRunningStateQuery,
  useAgentSession,
  useSessionDetailQuery,
} from '@ice-ai/client/react';
import type { SessionStatsDisplay, StatsCardGroupProps } from '@ice-ai/ui';
import {
  Composer,
  ContentWidthControls,
  MessageList,
  MessageMinimap,
  StatsPills,
} from '@ice-ai/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { ConvHeader, HeaderMetrics, HeaderTools, type PopName } from '../components/conv-header';
import { useToast } from '../lib/toast';

/**
 * 会话页（中栏，原型 `.head` + `.conv-shell` + `.composer`）。
 * 外壳（左右栏）在 `AppShell`，本组件只负责中栏。
 *
 * 数据来源两条腿：事件流（`useAgentSession` 的 SSE + fold）∪ REST 历史（context + rebuild）。
 * 刷新后会话不在注册表 → 只有历史，可读不可续（恢复能力归 M2）。
 */
export function SessionRoute() {
  const params = useParams();
  const sessionId = params.sessionId ?? '';
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const session = useAgentSession(sessionId);
  const detail = useSessionDetailQuery(sessionId);
  const [input, setInput] = useState('');
  const [openPop, setOpenPop] = useState<PopName | null>(null);
  const runningState = useAgentRunningStateQuery(sessionId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // 首条消息：首页只建空会话（ensure_session），把消息带到这里再发——
  // 保证「先建 SSE、再发 prompt」，首发轮次也能拿到流式增量。
  const firstMessage = (location.state as { firstMessage?: string } | null)?.firstMessage ?? null;
  const sentFirst = useRef(false);
  const connected = session.view.connected;
  const send = session.send;
  useEffect(() => {
    if (firstMessage === null || sentFirst.current || !connected) return;
    sentFirst.current = true;
    navigate(location.pathname, { replace: true, state: null });
    void send(firstMessage).then(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    });
  }, [firstMessage, connected, send, navigate, location.pathname, queryClient]);

  const state = session.view.state;
  const usage = sumUsage(session.turns);
  const statsInfo = detail.data?.stats;
  const stats: SessionStatsDisplay = {
    input: statsInfo?.tokens.input ?? usage?.input,
    output: statsInfo?.tokens.output ?? usage?.output,
    cacheRead: statsInfo?.tokens.cacheRead ?? usage?.cacheRead,
    cacheWrite: statsInfo?.tokens.cacheWrite ?? usage?.cacheWrite,
    cost: statsInfo?.cost ?? usage?.cost.total,
    contextTokens: state?.contextUsage?.tokens ?? statsInfo?.contextUsage?.tokens ?? null,
    contextWindow: state?.contextUsage?.contextWindow ?? statsInfo?.contextUsage?.contextWindow,
    contextPercent: state?.contextUsage?.percent ?? statsInfo?.contextUsage?.percent ?? null,
  };

  const firstUserText = session.turns.find((turn) => turn.user.text !== '')?.user.text ?? '';
  const title = session.view.sessionName ?? (firstUserText.slice(0, 48) || '新会话');
  const notRunning =
    session.turns.length > 0 && !session.streaming && runningState.data?.running === false;
  const focused = runningState.data?.running === true ? runningState.data.state : null;

  const toolCallCount = session.turns.reduce(
    (count, turn) => count + turn.trail.filter((row) => row.kind === 'tool').length,
    0,
  );
  const headerStats: StatsCardGroupProps = {
    performance: {
      rounds: session.turns.length === 0 ? undefined : session.turns.length,
      steps: toolCallCount === 0 ? undefined : toolCallCount,
    },
    tokens: stats,
  };

  const submit = async (): Promise<void> => {
    const text = input;
    if (text.trim() === '') return;
    setInput('');
    await session.send(text);
  };

  return (
    <>
      <ConvHeader
        title={title}
        running={session.streaming || runningState.data?.running === true}
        metrics={<HeaderMetrics tokens={stats} onOpenStats={() => setOpenPop('stats')} />}
        tools={
          <HeaderTools
            systemPrompt={focused?.systemPrompt ?? null}
            systemLoading={runningState.isPending}
            onCopyPrompt={() => toast('系统提示词已复制到剪贴板')}
            stats={headerStats}
            open={openPop}
            onOpenChange={setOpenPop}
          />
        }
      />

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

      <div className="conv-shell">
        <ContentWidthControls scrollRef={scrollRef} />
        <MessageMinimap
          viewportRef={scrollRef}
          liveTail={session.streaming}
          turns={session.turns.map((turn, index) => ({
            id: turn.id,
            title: turnTitle(turn.user.text, index),
            toolCallCount: turn.trail.filter((row) => row.kind === 'tool').length,
            durationMs: turn.trail.reduce(
              (sum, row) => sum + (row.kind === 'tool' ? (row.durationMs ?? 0) : 0),
              0,
            ),
          }))}
        />
        <MessageList
          turns={session.turns}
          liveTail={session.streaming}
          forceScrollSignal={session.turns.length}
          viewportRef={scrollRef}
          contentRef={contentRef}
          {...(session.view.thinkingLevel === null
            ? {}
            : { thinkingLabel: `thinking ${session.view.thinkingLevel}` })}
          {...(stats === undefined ? {} : { liveStats: stats })}
          empty={
            <div
              style={{
                display: 'flex',
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                color: 'var(--t3)',
              }}
            >
              {session.view.connected ? '正在等待第一条消息…' : '正在连接会话…'}
            </div>
          }
        />
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => void submit()}
        onAbort={() => void session.abort()}
        streaming={session.streaming}
        model={state?.model ?? null}
        disabled={notRunning}
        placeholder={
          notRunning
            ? '会话未运行，无法继续（M2 支持恢复）'
            : '继续对话…（Enter 发送，Shift+Enter 换行）'
        }
        stats={<StatsPills stats={stats} />}
      />
    </>
  );
}

/** minimap 浮层标题（原型「Turn 1 · 分类盘点」）：用户消息首行，空轮只留轮号 */
function turnTitle(text: string, index: number): string {
  const line = (text.trim().split('\n')[0] ?? '').slice(0, 28);
  return line === '' ? `Turn ${index + 1}` : `Turn ${index + 1} · ${line}`;
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
