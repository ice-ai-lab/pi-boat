import type {
  AgentMessage,
  ToolResultMessage,
  Usage,
  UserMessage,
  WireAgentEvent,
} from '@ice-ai/protocol';
import { resultText, toolTitle } from './tool-display';
import type { ChatState, SystemRow, ToolRow, TrailItem, Turn } from './view-model';

/**
 * fold（docs/05 §6.3）：wire 事件 → 视图模型，纯函数（无 IO / 无 React）。
 * 单测即「喂一串事件，断言 Turn[]」。
 *
 * 两条易错点（docs/05 §6.3）：
 * ① ToolRow 生命周期跨两类事件（toolcall_* 是模型发起、tool_execution_* 是执行）
 * ② usage 随 message_update 累积下发——快照在 message_end 时落（此处直接取
 *    message_end 的 message.usage，天然定稿）
 */

/** 用户消息文本（content 为 string 或 Text/Image 块数组） */
export function userText(message: UserMessage): string {
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/** assistant 最终回答 = content 里全部 text 块拼接（thinking/toolCall 不算回答） */
export function assistantFinalText(message: Extract<AgentMessage, { role: 'assistant' }>): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function userImages(message: UserMessage): string[] | undefined {
  if (typeof message.content === 'string') return undefined;
  const images = message.content
    .filter((block) => block.type === 'image')
    .map((block) => block.data);
  return images.length > 0 ? images : undefined;
}

function appendTrail(turns: Turn[], item: TrailItem): void {
  const turn = turns[turns.length - 1];
  if (turn === undefined) return; // 没有轮锚点时丢弃（不应发生：message_start(user) 先到）
  turn.trail = [...turn.trail, item];
}

function lastTurn(turns: Turn[]): Turn | undefined {
  return turns[turns.length - 1];
}

/** 按 toolCallId 找末轮的 ToolRow（跨 toolcall_* / tool_execution_* / toolResult 三类事件） */
function findToolRow(turns: Turn[], toolCallId: string): ToolRow | undefined {
  const turn = lastTurn(turns);
  if (turn === undefined) return undefined;
  return turn.trail.find(
    (item): item is ToolRow => item.kind === 'tool' && item.toolCallId === toolCallId,
  );
}

function patchToolRow(turns: Turn[], toolCallId: string, patch: Partial<ToolRow>): void {
  const turn = lastTurn(turns);
  if (turn === undefined) return;
  turn.trail = turn.trail.map((item) =>
    item.kind === 'tool' && item.toolCallId === toolCallId ? { ...item, ...patch } : item,
  );
}

function pushSystem(turns: Turn[], text: string, tone: SystemRow['tone']): void {
  appendTrail(turns, { kind: 'system', text, tone });
}

/** 折叠一个事件；返回同一 state 的浅变更副本（不可变更新，配合 useSyncExternalStore） */
export function fold(state: ChatState, event: WireAgentEvent): ChatState {
  const next: ChatState = {
    ...state,
    turns: state.turns.map((turn) => ({ ...turn, trail: [...turn.trail] })),
  };

  switch (event.type) {
    case 'agent_start':
      next.streaming = true;
      return next;

    case 'agent_settled':
      next.streaming = false;
      for (const turn of next.turns) {
        if (turn.status === 'streaming') turn.status = 'done';
      }
      return next;

    case 'message_start': {
      const message = event.message;
      if (message.role === 'user') {
        next.turns = [
          ...next.turns,
          {
            id: `u${next.turns.length}-${message.timestamp}`,
            user: { text: userText(message), images: userImages(message), at: message.timestamp },
            trail: [],
            final: null,
            usage: null,
            model: null,
            status: 'streaming',
          },
        ];
      }
      // assistant message_start：draft 起点，thinking/text/toolcall 增量随后到达
      return next;
    }

    case 'message_update': {
      const sub = event.assistantMessageEvent;
      switch (sub.type) {
        case 'thinking_start':
          appendTrail(next.turns, { kind: 'thinking', text: '', streaming: true });
          return next;
        case 'thinking_delta': {
          const turn = lastTurn(next.turns);
          if (turn === undefined) return next;
          const index = lastThinkingIndex(turn.trail);
          const row = index === -1 ? undefined : turn.trail[index];
          if (row === undefined || row.kind !== 'thinking') return next;
          turn.trail[index] = { ...row, text: `${row.text}${sub.delta}` };
          return next;
        }
        case 'thinking_end': {
          const turn = lastTurn(next.turns);
          const index = turn === undefined ? -1 : lastThinkingIndex(turn.trail);
          const row = turn === undefined || index === -1 ? undefined : turn.trail[index];
          if (turn !== undefined && index !== -1 && row !== undefined && row.kind === 'thinking') {
            turn.trail[index] = { ...row, text: sub.content, streaming: false };
          }
          return next;
        }
        case 'text_start': {
          const turn = lastTurn(next.turns);
          if (turn !== undefined && turn.final === null) turn.final = { markdown: '' };
          return next;
        }
        case 'text_delta': {
          const turn = lastTurn(next.turns);
          if (turn !== undefined) {
            turn.final = { markdown: `${turn.final?.markdown ?? ''}${sub.delta}` };
          }
          return next;
        }
        case 'text_end': {
          const turn = lastTurn(next.turns);
          if (turn !== undefined) turn.final = { markdown: sub.content };
          return next;
        }
        case 'toolcall_start':
          appendTrail(next.turns, {
            kind: 'tool',
            toolCallId: sub.id,
            toolName: sub.toolName,
            title: sub.toolName,
            argsText: '',
            status: 'preparing',
            output: null,
            isError: false,
          });
          return next;
        case 'toolcall_delta': {
          const turn = lastTurn(next.turns);
          if (turn === undefined) return next;
          // json 协议只在 toolcall_start 带 id；delta 靠「最后一个 preparing 行」定位
          const target = [...turn.trail]
            .reverse()
            .find((item): item is ToolRow => item.kind === 'tool' && item.status === 'preparing');
          if (target !== undefined) {
            patchToolRow(next.turns, target.toolCallId, {
              argsText: `${target.argsText}${sub.delta}`,
            });
          }
          return next;
        }
        case 'toolcall_end': {
          const row = findToolRow(next.turns, sub.toolCall.id);
          const patch: Partial<ToolRow> = {
            argsText: JSON.stringify(sub.toolCall.arguments, null, 2),
            title: toolTitle(sub.toolCall.name, sub.toolCall.arguments),
          };
          if (row === undefined) {
            appendTrail(next.turns, {
              kind: 'tool',
              toolCallId: sub.toolCall.id,
              toolName: sub.toolCall.name,
              title: patch.title ?? sub.toolCall.name,
              argsText: patch.argsText ?? '',
              status: 'ok',
              output: null,
              isError: false,
            });
          } else {
            patchToolRow(next.turns, sub.toolCall.id, patch);
          }
          return next;
        }
        default:
          return next;
      }
    }

    case 'message_end': {
      const message = event.message;
      if (message.role === 'assistant') {
        const turn = lastTurn(next.turns);
        if (turn !== undefined) {
          turn.final = { markdown: assistantFinalText(message) };
          turn.usage = message.usage as Usage;
          turn.model = { provider: message.provider, modelId: message.model };
          if (message.stopReason === 'aborted') turn.status = 'stopped';
          else if (message.stopReason === 'error') turn.status = 'error';
        }
      } else if (message.role === 'toolResult') {
        applyToolResult(next.turns, message);
      }
      return next;
    }

    case 'tool_execution_start': {
      patchToolRow(next.turns, event.toolCallId, { status: 'running' });
      toolStartTimes.set(event.toolCallId, Date.now());
      return next;
    }
    case 'tool_execution_update': {
      const partial = resultText(event.partialResult);
      const row = findToolRow(next.turns, event.toolCallId);
      if (partial !== null && row !== undefined) {
        patchToolRow(next.turns, event.toolCallId, {
          output: row.output === null ? partial : `${row.output}${partial}`,
        });
      }
      return next;
    }
    case 'tool_execution_end': {
      const startedAt = toolStartTimes.get(event.toolCallId);
      toolStartTimes.delete(event.toolCallId);
      const patch: Partial<ToolRow> = {
        status: event.isError ? 'error' : 'ok',
        isError: event.isError,
        output: resultText(event.result) ?? '',
      };
      if (startedAt !== undefined) patch.durationMs = Date.now() - startedAt;
      patchToolRow(next.turns, event.toolCallId, patch);
      return next;
    }

    case 'turn_start':
    case 'turn_end':
      // 组边界只认消息序列（docs/05 §6.5 硬约束）；turn_end 的 toolResults 由
      // message_end(toolResult) 同步覆盖，这里不处理
      return next;

    case 'agent_end':
      // 兜底对账：增量已覆盖；willRetry=true 时保持 streaming（下一轮仍在路上）
      if (!event.willRetry) next.streaming = false;
      return next;

    case 'queue_update':
      next.queued = { steering: [...event.steering], followUp: [...event.followUp] };
      return next;

    case 'compaction_start':
      pushSystem(next.turns, `上下文压缩中（${event.reason}）…`, 'info');
      return next;
    case 'compaction_end':
      pushSystem(
        next.turns,
        event.aborted ? '上下文压缩已中止' : '上下文压缩完成',
        event.errorMessage !== undefined || event.aborted ? 'warn' : 'info',
      );
      return next;

    case 'auto_retry_start':
      pushSystem(
        next.turns,
        `模型请求失败，自动重试 ${event.attempt}/${event.maxAttempts}`,
        'warn',
      );
      return next;
    case 'auto_retry_end':
      if (!event.success) {
        pushSystem(next.turns, `自动重试失败：${event.finalError ?? '未知错误'}`, 'error');
      }
      return next;
    case 'summarization_retry_scheduled':
      pushSystem(
        next.turns,
        `摘要生成失败，${Math.round(event.delayMs / 1000)}s 后重试（${event.attempt}/${event.maxAttempts}）`,
        'warn',
      );
      return next;
    case 'summarization_retry_attempt_start':
    case 'summarization_retry_finished':
      return next;

    case 'entry_appended':
      // M1 忽略：重连靠 REST 重建，不靠事件重放（docs/05 §6.3）
      return next;

    case 'session_info_changed':
      next.sessionName = event.name;
      return next;
    case 'thinking_level_changed':
      return next;

    case 'session_shutdown':
      next.terminated = true;
      next.streaming = false;
      for (const turn of next.turns) {
        if (turn.status === 'streaming') turn.status = 'stopped';
      }
      return next;

    case 'session_replaced':
    case 'extension_ui_request':
    case 'extension_ui_closed':
      // F1 不消费：替换（fork 等）随 F5 分支导航、扩展 UI 随 F5 扩展面板
      return next;

    case 'connected':
      // 水位线在 AgentStream 层处理（丢弃 seq ≤ lastSeq 的旧事件）
      return next;

    default:
      return next;
  }
}

/** toolResult 消息：按 toolCallId 回填输出（历史与实时同构；turns 通常取末轮或重建的归属轮） */
export function applyToolResult(turns: Turn[], message: ToolResultMessage): void {
  const output = resultText(message.content);
  const turn = lastTurn(turns);
  const row = findToolRow(turns, message.toolCallId);
  if (row !== undefined) {
    patchToolRow(turns, message.toolCallId, {
      output,
      isError: message.isError,
      status: message.isError ? 'error' : 'ok',
    });
  } else if (turn !== undefined) {
    // 历史回放里 toolCall 与 toolResult 的归属轮次一致；找不到行时补一行（防御）
    turn.trail = [
      ...turn.trail,
      {
        kind: 'tool',
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        title: message.toolName,
        argsText: '',
        status: message.isError ? 'error' : 'ok',
        output,
        isError: message.isError,
      },
    ];
  }
}

function lastThinkingIndex(trail: TrailItem[]): number {
  for (let i = trail.length - 1; i >= 0; i--) {
    const item = trail[i];
    if (item?.kind === 'thinking') return i;
    if (item?.kind === 'tool') continue; // thinking 与 tool 可能交错，取最后一个 thinking
  }
  return -1;
}

/** 工具执行起始时刻（fold 内部记账，跨事件配对 start/end） */
const toolStartTimes = new Map<string, number>();
