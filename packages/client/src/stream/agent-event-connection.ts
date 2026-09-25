import type { WireAgentEvent } from '@ice-ai/protocol';

/**
 * SSE 连接管理（docs/05 §5）：EventSource 包装——心跳忽略、断线退避重连、
 * `session_shutdown` / `session_replaced` 停止重连。
 * 重连 = 整体重建（connected + 快照 + 增量；Last-Event-ID 差量是 B8 可选，docs/04 §5.5）。
 */

export interface AgentEventConnectionOptions {
  sessionId: string;
  /** 事件回调（已过结构校验） */
  onEvent: (event: WireAgentEvent) => void;
  /** 连接状态变化（open/close）——UI 可展示连接中/已断开 */
  onStatus?: (status: 'connecting' | 'open' | 'closed') => void;
  /** 不可恢复终止（shutdown/replaced）：不再重连 */
  onTerminal?: (reason: 'shutdown' | 'replaced') => void;
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 8_000;

/** 从 SSE data 帧解析事件；未知类型/畸形帧返回 null（丢弃 + 计数，不 crash，docs/05 §5.4） */
export function parseWireEvent(raw: string): WireAgentEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { type?: unknown }).type === 'string' &&
      typeof (parsed as { seq?: unknown }).seq === 'number'
    ) {
      return parsed as WireAgentEvent;
    }
  } catch {
    // 落入下述丢弃路径
  }
  return null;
}

export class AgentEventConnection {
  private source: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private stopped = false;
  private droppedFrames = 0;

  constructor(private readonly options: AgentEventConnectionOptions) {}

  /** 已丢弃的畸形/未知帧计数（诊断用） */
  get droppedFrameCount(): number {
    return this.droppedFrames;
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  private open(): void {
    if (this.stopped) return;
    this.options.onStatus?.('connecting');
    const source = new EventSource(
      `/api/agent/${encodeURIComponent(this.options.sessionId)}/events`,
    );
    this.source = source;

    source.onopen = () => {
      this.attempt = 0;
      this.options.onStatus?.('open');
    };
    source.onmessage = (ev: MessageEvent<string>) => {
      const event = parseWireEvent(ev.data);
      if (event === null) {
        this.droppedFrames += 1;
        return;
      }
      if (event.type === 'session_shutdown') {
        this.options.onEvent(event);
        this.options.onTerminal?.('shutdown');
        this.close();
        return;
      }
      if (event.type === 'session_replaced') {
        this.options.onEvent(event);
        this.options.onTerminal?.('replaced');
        this.close();
        return;
      }
      this.options.onEvent(event);
    };
    source.onerror = () => {
      // 冷会话 404 / 网络断开 / server 重启：统一走退避重连（重连后整体重建）
      this.disposeSource();
      if (this.stopped) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempt, RECONNECT_MAX_MS);
      this.attempt += 1;
      this.options.onStatus?.('closed');
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };
  }

  private disposeSource(): void {
    this.source?.close();
    this.source = null;
  }

  private close(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.disposeSource();
    this.options.onStatus?.('closed');
  }

  /** 宿主主动断开（组件卸载 / 会话切换） */
  stop(): void {
    this.close();
  }
}
