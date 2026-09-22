import type { ImageContent } from '@ice-ai/protocol';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { type ApiClient, NetworkError } from '../http';
import { AgentStream, type AgentStreamOptions } from '../stream/agent-stream';
import type { EventSourceFactory } from '../stream/event-source';
import { type ChatView, mergeTurns, type Turn } from '../stream/fold';
import { turnsFromMessages } from '../stream/rebuild';
import { getApiClient } from './client';
import { useSessionContextQuery } from './queries';

/**
 * React 绑定（docs/05 §7）：事件流走 `useSyncExternalStore`（**不是** TanStack Query），
 * REST 走 Query。hooks 不搬 UI 状态（折叠偏好、窗口宽度等留在 ui/app）。
 */

export interface UseAgentSessionOptions {
  client?: ApiClient;
  eventSourceFactory?: EventSourceFactory;
  /** 关掉 REST 历史合并（纯事件场景，如测试与 minimap 无关的嵌入式使用） */
  history?: boolean;
}

export interface UseAgentStreamResult {
  stream: AgentStream;
  view: ChatView;
}

export function useAgentStream(
  sessionId: string,
  options: UseAgentSessionOptions = {},
): UseAgentStreamResult {
  const client = options.client ?? getApiClient();
  const factory = options.eventSourceFactory;
  // 外部 store 句柄必须跨渲染稳定（effect 依赖它建流/断流）；这不是性能 memo
  const stream = useMemo(
    () =>
      new AgentStream({
        sessionId,
        client,
        ...(factory === undefined ? {} : { eventSourceFactory: factory }),
      } satisfies AgentStreamOptions),
    [sessionId, client, factory],
  );

  useEffect(() => {
    stream.start();
    void stream.refreshState().catch(() => undefined);
    return () => stream.stop();
  }, [stream]);

  const view = useSyncExternalStore(stream.subscribe, stream.getSnapshot, stream.getSnapshot);
  return { stream, view };
}

export interface UseAgentSessionResult {
  /** 历史（REST）∪ 事件流合并后的时间线 */
  turns: Turn[];
  /** 事件流原始视图（usage / queue / state 等） */
  view: ChatView;
  historyTurns: Turn[];
  streaming: boolean;
  /** 命令失败信息（浅层展示用；组件不判状态码） */
  error: string | null;
  send: (text: string, images?: ImageContent[]) => Promise<void>;
  followUp: (text: string, images?: ImageContent[]) => Promise<void>;
  abort: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export function useAgentSession(
  sessionId: string,
  options: UseAgentSessionOptions = {},
): UseAgentSessionResult {
  const { stream, view } = useAgentStream(sessionId, options);
  const context = useSessionContextQuery(sessionId, {}, { enabled: options.history ?? true });
  const [error, setError] = useState<string | null>(null);

  // 重连 = server 侧整体重建（M1 无差量）：宿主重取 REST 历史补齐事件窗口内丢的轮次
  const refetch = context.refetch;
  useEffect(
    () =>
      stream.onReconnect(() => {
        void refetch();
      }),
    [stream, refetch],
  );

  const historyTurns = context.data === undefined ? [] : turnsFromMessages(context.data.messages);
  const turns = mergeTurns(historyTurns, view.turns);

  const run = async (action: () => Promise<void>): Promise<void> => {
    try {
      setError(null);
      await action();
    } catch (cause) {
      setError(cause instanceof NetworkError ? '无法连接本机 agent server（9527）' : String(cause));
    }
  };

  return {
    turns,
    view,
    historyTurns,
    streaming: view.running,
    error,
    send: (text, images) => run(() => stream.send(text, images)),
    followUp: (text, images) => run(() => stream.followUp(text, images)),
    abort: () => run(() => stream.abort()),
    refresh: () => run(() => stream.refreshState().then(() => undefined)),
    clearError: () => setError(null),
  };
}
