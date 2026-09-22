import type { WireAgentEvent } from '@ice-ai/protocol';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/http';
import { AgentStream } from '../src/stream/agent-stream';
import type { EventSourceLike } from '../src/stream/event-source';

/**
 * AgentStream 传输层语义（docs/05 §5）：
 * 建流地址、seq 去重、重连（清空事件派生态 + onReconnect）、非法帧计数、
 * session_shutdown 停流、send 的 prompt/steer 分流。
 */

class FakeEventSource implements EventSourceLike {
  readyState = 0;
  readonly listeners = new Map<string, ((event: never) => void)[]>();
  closed = false;

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: never) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close(): void {
    this.readyState = 2;
    this.closed = true;
  }

  emitOpen(): void {
    this.readyState = 1;
    for (const listener of this.listeners.get('open') ?? []) (listener as () => void)();
  }

  emitMessage(data: string): void {
    for (const listener of this.listeners.get('message') ?? []) {
      (listener as (e: { data: string }) => void)({ data });
    }
  }

  emitError(): void {
    for (const listener of this.listeners.get('error') ?? []) (listener as () => void)();
  }
}

interface Harness {
  stream: AgentStream;
  source: FakeEventSource;
  calls: { url: string; data: unknown }[];
  reconnects: () => number;
  snapshots: () => number;
}

function setup(): Harness {
  const sources: FakeEventSource[] = [];
  const calls: { url: string; data: unknown }[] = [];
  const client = {
    url: (path: string) => path,
    request: vi.fn(async (config: { url?: string; data?: unknown }) => {
      calls.push({ url: config.url ?? '', data: config.data });
      // 命令通道的成功信封：{success:true, data}
      return { success: true, data: null };
    }),
  } as unknown as ApiClient;
  const stream = new AgentStream({
    sessionId: 's1',
    client,
    refreshStateOnSettle: false,
    now: () => 1_000,
    eventSourceFactory: (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
  });
  let reconnects = 0;
  stream.onReconnect(() => {
    reconnects += 1;
  });
  let snapshots = 0;
  stream.subscribe(() => {
    snapshots += 1;
  });
  stream.start();
  const source = sources[0];
  if (source === undefined) throw new Error('EventSource 未被创建');
  return {
    stream,
    source,
    calls,
    reconnects: () => reconnects,
    snapshots: () => snapshots,
  };
}

/** 分发式 Omit：直接 Omit<Union,K> 会塌缩成公共键，丢掉判别信息 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type WireEventPayload = DistributiveOmit<WireAgentEvent, 'seq'>;

function ev(seq: number, payload: WireEventPayload): WireAgentEvent {
  return { ...payload, seq } as WireAgentEvent;
}

describe('AgentStream 建流与折叠', () => {
  it('SSE 地址 = protocol 的 /api/agent/:id/events', () => {
    const { source } = setup();
    expect(source.url).toBe('/api/agent/s1/events');
  });

  it('connected → 用户消息 → 助手定稿：视图按事件折叠', () => {
    const { stream, source } = setup();
    source.emitOpen();
    source.emitMessage(
      JSON.stringify(ev(1, { type: 'connected', sessionId: 's1', isStreaming: true, lastSeq: 0 })),
    );
    source.emitMessage(
      JSON.stringify(
        ev(2, { type: 'message_start', message: { role: 'user', content: '你好', timestamp: 5 } }),
      ),
    );
    source.emitMessage(JSON.stringify(ev(3, { type: 'agent_settled' })));

    const view = stream.getSnapshot();
    expect(view.turns).toHaveLength(1);
    expect(view.turns[0]?.user.text).toBe('你好');
    expect(view.lastSeq).toBe(3);
    expect(view.invalidFrames).toBe(0);
  });

  it('seq ≤ 水位线的事件被丢弃（重放幂等）', () => {
    const { stream, source, snapshots } = setup();
    source.emitOpen();
    source.emitMessage(
      JSON.stringify(ev(1, { type: 'connected', sessionId: 's1', isStreaming: false, lastSeq: 3 })),
    );
    const before = snapshots();
    source.emitMessage(JSON.stringify(ev(2, { type: 'agent_start' })));
    source.emitMessage(
      JSON.stringify(
        ev(3, { type: 'message_start', message: { role: 'user', content: '旧', timestamp: 5 } }),
      ),
    );
    expect(snapshots()).toBe(before); // 重复帧既不折叠也不通知
    expect(stream.getSnapshot().turns).toHaveLength(0);
  });

  it('非法帧只计数不上抛（协议漂移探针）', () => {
    const { stream, source } = setup();
    source.emitOpen();
    source.emitMessage('not-json');
    source.emitMessage(JSON.stringify({ type: '不存在的类型', seq: 9 }));
    expect(stream.getSnapshot().invalidFrames).toBe(2);
  });

  it('重连：清空事件派生态并通知宿主重建（docs/05 §5.3）', () => {
    const { stream, source, reconnects } = setup();
    source.emitOpen();
    source.emitMessage(
      JSON.stringify(ev(1, { type: 'connected', sessionId: 's1', isStreaming: false, lastSeq: 0 })),
    );
    source.emitMessage(
      JSON.stringify(
        ev(2, { type: 'message_start', message: { role: 'user', content: '你好', timestamp: 5 } }),
      ),
    );
    expect(stream.getSnapshot().turns).toHaveLength(1);

    source.emitOpen(); // 原生重连成功
    expect(reconnects()).toBe(1);
    expect(stream.getSnapshot().turns).toHaveLength(0);
  });

  it('session_shutdown：写入提示并停止重连', () => {
    const { stream, source } = setup();
    source.emitOpen();
    source.emitMessage(
      JSON.stringify(ev(1, { type: 'connected', sessionId: 's1', isStreaming: true, lastSeq: 0 })),
    );
    source.emitMessage(
      JSON.stringify(ev(2, { type: 'session_shutdown', reason: 'server_shutdown' })),
    );
    expect(source.closed).toBe(true);
    expect(stream.getSnapshot().notice).toContain('会话已关闭');
  });
});

describe('AgentStream 命令', () => {
  it('空闲时 prompt，运行中转发为 steer', async () => {
    const { stream, source, calls } = setup();
    source.emitOpen();
    source.emitMessage(
      JSON.stringify(ev(1, { type: 'connected', sessionId: 's1', isStreaming: false, lastSeq: 0 })),
    );
    await stream.send('第一条');
    expect(calls[0]).toEqual({
      url: '/api/agent/s1',
      data: { type: 'prompt', message: '第一条' },
    });

    source.emitMessage(JSON.stringify(ev(2, { type: 'agent_start' })));
    await stream.send('插一句');
    expect(calls[1]).toEqual({
      url: '/api/agent/s1',
      data: { type: 'steer', message: '插一句' },
    });
  });

  it('空消息不发请求；abort 走 abort 命令', async () => {
    const { stream, calls } = setup();
    await stream.send('   ');
    expect(calls).toHaveLength(0);
    await stream.abort();
    expect(calls[0]?.data).toEqual({ type: 'abort' });
  });
});
