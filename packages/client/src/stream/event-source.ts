import { type WireAgentEvent, WireAgentEventSchema } from '@ice-ai/protocol';

/**
 * SSE 传输封装（docs/05 §5）：浏览器 `EventSource` + 单帧 Zod 校验 + 关停识别。
 *
 * 为什么薄：断线重连是 `EventSource` 的原生能力（自带 Last-Event-ID 回传与重连），
 * 我们只需要把「帧 → wire 事件」的边界收在一处：
 * - 心跳注释帧：浏览器根本不产生 `message` 事件，天然忽略（docs/05 §5.4）
 * - 校验失败 / 未知类型：丢弃 + 计数上报，**不 crash、不断流**（协议漂移探针）
 * - `session_shutdown`：主动 close 并停止重连（否则会对着已销毁的会话无限重连）
 * - 非可重连失败（404/403/错 Content-Type）：readyState=CLOSED，停止重连并上报
 */

/** EventSource.readyState 常量（不依赖运行时全局，便于测试注入） */
const OPEN = 1;
/** CLOSED = 浏览器已放弃重连（HTTP 非 2xx / Content-Type 不对） */
const CLOSED = 2;

/** 最小 EventSource 契约（浏览器实现 / 测试 fake 都满足） */
export interface EventSourceLike {
  readonly readyState: number;
  addEventListener(type: 'message', listener: (event: MessageEvent<string>) => void): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export interface AgentEventSourceOptions {
  url: string;
  onEvent: (event: WireAgentEvent) => void;
  /** 每次建流成功（含原生重连成功）——用于区分首连与重连 */
  onOpen?: () => void;
  onInvalidFrame?: (raw: string, error: unknown) => void;
  /** 不可重连的失败（404/403/错误 Content-Type）：不会再有 onOpen */
  onFatal?: (error: unknown) => void;
  onShutdown?: () => void;
  /** 注入点（测试用 fake；默认取全局 EventSource） */
  factory?: EventSourceFactory;
}

export class AgentEventSource {
  private source: EventSourceLike | null = null;
  private shutdown = false;

  constructor(private readonly options: AgentEventSourceOptions) {}

  get isOpen(): boolean {
    return this.source?.readyState === OPEN;
  }

  connect(): void {
    if (this.source !== null || this.shutdown) return;
    const factory = this.options.factory ?? defaultFactory();
    if (factory === null) {
      // Node / 无 DOM 环境（协议层单测）：明确上报而不是静默无流
      this.options.onFatal?.(new Error('EventSource is not available in this environment'));
      return;
    }
    const source = factory(this.options.url);
    this.source = source;
    source.addEventListener('open', () => {
      this.options.onOpen?.();
    });
    source.addEventListener('message', (event) => {
      const parsed = parseFrame(event.data);
      if (!parsed.ok) {
        this.options.onInvalidFrame?.(event.data, parsed.error);
        return;
      }
      if (parsed.event.type === 'session_shutdown') {
        // 先交给上层折叠（写 notice / 置 stopped），再主动停流（否则会对着已销毁的会话无限重连）
        this.options.onEvent(parsed.event);
        this.options.onShutdown?.();
        this.close();
        return;
      }
      this.options.onEvent(parsed.event);
    });
    source.addEventListener('error', (event) => {
      // CLOSED = 浏览器已放弃重连（HTTP 非 2xx / Content-Type 不对）→ 上报致命
      if (source.readyState === CLOSED) {
        this.options.onFatal?.(event);
        this.close();
      }
      // CONNECTING = 原生重连中：什么都不做，重连成功后 onOpen 再触发
    });
  }

  close(): void {
    this.shutdown = true;
    const source = this.source;
    this.source = null;
    if (source !== null && source.readyState !== CLOSED) source.close();
  }
}

type ParseResult = { ok: true; event: WireAgentEvent } | { ok: false; error: unknown };

/** 单帧解析：JSON → WireAgentEventSchema（协议漂移探针，ADR-0005） */
export function parseFrame(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { ok: false, error };
  }
  const parsed = WireAgentEventSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: parsed.error };
  return { ok: true, event: parsed.data };
}

function defaultFactory(): EventSourceFactory | null {
  const ctor = (globalThis as { EventSource?: new (url: string) => EventSourceLike }).EventSource;
  if (ctor === undefined) return null;
  return (url) => new ctor(url);
}
