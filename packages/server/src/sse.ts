import type { AgentSessionService } from '@ice-ai/core';

/**
 * Agent 事件流的 SSE 传输层（docs/04 §5）。事件自带会话级 seq（id: 帧即 seq），
 * M1 不做缓冲窗口重放（§5.5 分阶段兑现）。
 *
 * 建立时序（§5.1）：①Response 头 + 注释帧立即下发（强制冲刷，不等 core）
 * → ②agentService.subscribe（core 同步完成：注册 listener → connected{lastSeq}
 * → ③合成 message_start）→ ④此后增量逐帧转发。
 *
 * Last-Event-ID（§5.5 M1 降级）：忽略——重连 = connected + 快照 + 此后增量，
 * 客户端整体重建（seq 单调保证丢弃 ≤ lastSeq 的重复事件，幂等成立）。
 */

/** 心跳间隔（docs/02 §2：30s 注释帧） */
const HEARTBEAT_INTERVAL_MS = 30_000;

type StreamCloser = (closeController: boolean | 'error') => void;

/**
 * 进程内活跃 SSE 流注册表（模块级，单进程）。
 * 关停时统一硬断（§5.4 关停坑）：graceful close 可能被 Node
 * 响应管道吞掉——socket 保持 ESTABLISHED、server.close() 永不完成、进程变僵尸。
 */
const activeClosers = new Set<StreamCloser>();

/** 进程关停路径：硬断全部活跃流（error 让客户端立即感知并重连） */
export function closeAllAgentEventStreams(): void {
  for (const close of [...activeClosers]) {
    try {
      close('error');
    } catch {
      // 流已关闭
    }
  }
}

/**
 * 创建事件流 ReadableStream。六种关流路径（§5.3）：
 * 1 客户端断开（req.signal abort / 流 cancel）→ 退订 + 清理
 * 2 session_shutdown（core dispose 广播）→ graceful close
 * 3 会话不在注册表 → 404 由路由层建流前判定（冷会话不自动拉起）
 * 4 进程关停 → closeAllAgentEventStreams 硬断（§5.4）
 * 5 写失败（broken pipe）→ 退订 + 清理
 * 6 订阅竞态（subscribe 抛 SessionNotFoundError）→ 立即收口
 */
export function createAgentEventStream(
  req: Request,
  sessionId: string,
  agentService: AgentSessionService,
): ReadableStream<Uint8Array> {
  let forceClose: StreamCloser = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;

      // closeController：'error' = 硬断（关停；graceful close 会被响应管道吞掉）；
      // true = graceful close（session_shutdown 后收尾，已入队帧仍会送达）；
      // false = 只清理不关流（客户端已走，无需再写）
      const cleanup = (closeController: boolean | 'error'): void => {
        if (closed) return;
        closed = true;
        activeClosers.delete(cleanup);
        if (heartbeat !== null) clearInterval(heartbeat);
        unsubscribe?.();
        if (closeController === 'error') {
          try {
            controller.error(new Error('piboat-server shutting down'));
          } catch {
            // 已关闭
          }
        } else if (closeController) {
          try {
            controller.close();
          } catch {
            // 已关闭
          }
        }
      };
      forceClose = cleanup;
      activeClosers.add(cleanup);

      // 路径 5：写失败（broken pipe / 流已取消）→ 清理
      const write = (text: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup(false);
        }
      };

      // ① 注释帧强制冲刷，不等 core（§5.1 时序）
      write(':\n\n');

      // ②③④ 订阅与增量。帧格式（§5.2）：id: <seq>（EventSource 断线重连自动回传
      // Last-Event-ID）+ data: <wire JSON>
      try {
        unsubscribe = agentService.subscribe(sessionId, (event) => {
          if (event.type === 'session_shutdown') {
            // 路径 2：先送达 shutdown 帧（客户端据此区分「关停」与「断线」，决定是否重连）
            write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
            cleanup(true);
            return;
          }
          write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
        });
      } catch {
        // 路径 6：订阅瞬间会话被销毁——流已开只能立即收口（404 语义归路由层前置判定）
        cleanup(true);
        return;
      }

      // 心跳：30s 注释帧（防中间层掐空闲连接 + socket 探活）
      heartbeat = setInterval(() => write(':\n\n'), HEARTBEAT_INTERVAL_MS);

      // 路径 1：客户端断开（node-server 把连接关闭映射到 req.signal abort）
      const onAbort = () => cleanup(false);
      req.signal.addEventListener('abort', onAbort);
      if (req.signal.aborted) cleanup(false);
    },
    // 路径 1 的另一形态：消费端取消流
    cancel() {
      forceClose(false);
    },
  });
}

/** SSE 响应头（§5.1：no-transform 防代理改写，X-Accel-Buffering 防 nginx 缓冲） */
export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};
