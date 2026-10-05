import type {
  AssistantMessage,
  ToolResultMessage,
  Usage,
  UserMessage,
  WireAgentEvent,
} from '@ice-ai/protocol';
import { type ImageCoords, messageImageSrcs } from './image-src';
import { resultText, toolTitle } from './tool-display';
import { combineUsage } from './usage';
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

/**
 * assistant 回答段 = 最后一个 process 块（thinking/toolCall）之后的 text 块拼接
 * （docs/05 §6.5 规则 3 的「切一刀」）。之前的 text 属过程，由降级规则进轨迹。
 */
export function assistantAnswerText(message: AssistantMessage): string {
  const cut = lastProcessBlockIndex(message.content);
  const parts: string[] = [];
  message.content.forEach((block, index) => {
    if (block.type === 'text' && index > cut) parts.push(block.text);
  });
  return parts.join('\n');
}

/** 最后一个 process 块（thinking/toolCall）的下标；没有则 -1（rebuild 同刀法复用） */
export function lastProcessBlockIndex(content: AssistantMessage['content']): number {
  for (let i = content.length - 1; i >= 0; i--) {
    const block = content[i];
    if (block?.type === 'thinking' || block?.type === 'toolCall') return i;
  }
  return -1;
}

function appendTrail(turns: Turn[], item: TrailItem): void {
  const turn = turns[turns.length - 1];
  if (turn === undefined) return; // 没有轮锚点时丢弃（不应发生：message_start(user) 先到）
  turn.trail = [...turn.trail, item];
}

/**
 * 把当前回答草稿降级为轨迹 text 行。触发点 = 草稿被证明「不是最终回答」的时刻：
 * 同消息内后随 thinking_start / toolcall_start（规则 3：process 块之前的 text 属过程），
 * 或 message_end(stopReason=toolUse)（规则 4：中间轮整条消息进组）。
 * 不降级的话，中间轮文本会被逐条覆盖的 `final` 吞掉（多轮 trace 丢非思考内容的根因）。
 */
function demoteDraftToTrail(turns: Turn[]): void {
  const turn = lastTurn(turns);
  if (turn === undefined || turn.final === null) return;
  const markdown = turn.final.markdown;
  turn.final = null;
  if (markdown.trim().length === 0) return;
  turn.trail = [...turn.trail, { kind: 'text', text: markdown }];
}

/** 孤儿轮（无用户锚点，与 rebuild 的 pushOrphanTurn 同形）：只在没有轮可挂时兜底建档 */
function createOrphanTurn(id: string, at: number): Turn {
  return {
    id,
    user: { text: '', at },
    trail: [],
    final: null,
    usage: null,
    model: null,
    status: 'streaming',
    errorMessage: null,
    orphan: true,
  };
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
            user: {
              text: userText(message),
              // 实时事件的图片是内联 base64（服务端只对历史 deferMedia）→ data URL
              images: messageImageSrcs(message.content),
              at: message.timestamp,
            },
            trail: [],
            final: null,
            usage: null,
            model: null,
            status: 'streaming',
            errorMessage: null,
          },
        ];
      } else if (message.role === 'assistant') {
        // assistant message_start：draft 起点；late join 快照（content 非空）时把半截消息接回来。
        // 没有轮锚点时先补一个孤儿轮：首轮刷新的 transient 窗口（会话还没落盘 → REST 历史为空，
        // 用户消息不在任何通道里）没有锚点的话，整段流式内容会挂在 undefined 上被丢掉。
        if (lastTurn(next.turns) === undefined) {
          next.turns = [createOrphanTurn(`a${message.timestamp}`, message.timestamp)];
        }
        applyAssistantSnapshot(next.turns, message);
      }
      return next;
    }

    case 'message_update': {
      const sub = event.assistantMessageEvent;
      switch (sub.type) {
        case 'thinking_start':
          // 草稿已有正文（text 在前、thinking 在后的少见块序）：先降级再开思考行，保住块序
          demoteDraftToTrail(next.turns);
          appendTrail(next.turns, { kind: 'thinking', text: '', streaming: true });
          thinkingStartedAt = Date.now();
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
          const startedAt = thinkingStartedAt;
          thinkingStartedAt = null;
          const turn = lastTurn(next.turns);
          const index = turn === undefined ? -1 : lastThinkingIndex(turn.trail);
          const row = turn === undefined || index === -1 ? undefined : turn.trail[index];
          if (turn !== undefined && index !== -1 && row !== undefined && row.kind === 'thinking') {
            turn.trail[index] = {
              ...row,
              text: sub.content,
              streaming: false,
              ...(startedAt !== null ? { durationMs: Date.now() - startedAt } : {}),
            };
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
          // 文本草稿被后随工具调用证明为中间内容：先降级为 text 行（位置在工具行之前），
          // 回答位清空，后续文本重新起草
          demoteDraftToTrail(next.turns);
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
          if (message.stopReason === 'toolUse') {
            // 中间轮（停下来调工具）：整条消息属过程（docs/05 §6.5 规则 4），
            // 残余文本草稿降级进轨迹，回答位清空等最终回答
            demoteDraftToTrail(next.turns);
          } else {
            // 最终回答消息：只有最后一个 process 块之后的 text 归回答（规则 3），
            // 更早的文本已在 thinking_start/toolcall_start 时降级
            turn.final = { markdown: assistantAnswerText(message) };
          }
          turn.usage = combineUsage(turn.usage, message.usage as Usage);
          turn.endedAt = message.timestamp;
          turn.model = { provider: message.provider, modelId: message.model };
          turn.errorMessage = message.errorMessage ?? null;
          if (message.stopReason === 'aborted') turn.status = 'stopped';
          else if (message.stopReason === 'error') turn.status = 'error';
          // 自动重试成功：撤销上次失败尝试留下的 error，回到流式中（agent_settled 收口为 done）
          else if (turn.status === 'error') turn.status = 'streaming';
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
        images: messageImageSrcs(event.result?.content),
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

    case 'auto_retry_start': {
      pushSystem(
        next.turns,
        `模型请求失败，自动重试 ${event.attempt}/${event.maxAttempts}`,
        'warn',
      );
      // 失败尝试的半截产物就地作废（trail 只追加、就地补丁，docs/05 §6.3）：
      // ① 文本草稿清空——重试的 text_start 重建；不清则新 delta 拼在残稿后面，
      //    直到 message_end 才被覆盖（流式期间一直显示残稿+新文拼接）
      // ② thinking/preparing 行定格——残稿不再按「流式中」渲染（截图中 dangling 的半截思考行）
      // ③ error 状态暂撤——新尝试在路上，横幅先收起；彻底失败时 auto_retry_end(false)
      //    会还原（重试可能被取消/耗尽而不发起尝试，成败不能在这里预判）
      const turn = lastTurn(next.turns);
      if (turn !== undefined) {
        turn.final = null;
        turn.trail = turn.trail.map((item) =>
          item.kind === 'thinking' && item.streaming
            ? { ...item, streaming: false }
            : item.kind === 'tool' && item.status === 'preparing'
              ? { ...item, status: 'stopped' }
              : item,
        );
        if (turn.status === 'error') turn.status = 'streaming';
      }
      return next;
    }
    case 'auto_retry_end':
      if (!event.success) {
        pushSystem(next.turns, `自动重试失败：${event.finalError ?? '未知错误'}`, 'error');
        // 彻底失败（取消/耗尽）：auto_retry_start 后被清掉的 error 轮状态还原，横幅要出
        const turn = lastTurn(next.turns);
        if (turn !== undefined && turn.status === 'streaming') turn.status = 'error';
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

    case 'extension_ui_request':
      // 只留最近一条待应答请求（对话框一次只显示一个）
      next.extensionRequest = event.request;
      return next;
    case 'extension_ui_closed':
      if (next.extensionRequest?.id === event.id) next.extensionRequest = null;
      return next;

    case 'session_replaced':
      // 会话 id 已被替换（fork/clone/resume）：旧流随即 shutdown；切换由上层 open 新 id 完成
      return next;

    case 'connected':
      // runtime 真相（docs/04 §5）：水位线在 AgentStream 层处理，这里只对齐「还在跑」——
      // 刷新/重连后用服务端的 isStreaming 恢复或撤销本地的流式态（丢过 agent_settled 的
      // 连接靠它收口），本地时序不可靠。
      next.streaming = event.isStreaming;
      if (!event.isStreaming) {
        for (const turn of next.turns) {
          if (turn.status === 'streaming') turn.status = 'done';
        }
      }
      return next;

    default:
      return next;
  }
}

/**
 * toolResult 消息：按 toolCallId 回填输出（历史与实时同构；turns 通常取末轮或重建的归属轮）。
 * `coords` 只在历史重建时给（deferMedia 的图片要按会话/条目坐标换惰性 URL）；实时事件不给。
 */
export function applyToolResult(
  turns: Turn[],
  message: ToolResultMessage,
  coords?: ImageCoords,
): void {
  const output = resultText(message.content);
  const images = messageImageSrcs(message.content, coords);
  const turn = lastTurn(turns);
  const row = findToolRow(turns, message.toolCallId);
  if (row !== undefined) {
    patchToolRow(turns, message.toolCallId, {
      output,
      images,
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
        images,
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

/**
 * 快照 text 落轨迹行：与断线前降级出的 text 行按前缀认领并整体替换（免得重复合并行），
 * 认领不上（真新增）才追加。`skip` = 快照里在本行之前已被认领的 text 行数（按序一一对应）。
 */
function claimTextRow(turn: Turn, text: string, skip: number): void {
  let seen = 0;
  for (let i = 0; i < turn.trail.length; i++) {
    const row = turn.trail[i];
    if (row === undefined || row.kind !== 'text') continue;
    if (seen++ < skip) continue;
    if (text.startsWith(row.text) || row.text.startsWith(text)) {
      turn.trail[i] = { ...row, text };
      return;
    }
    break; // text 行按序对应，第一个对不上就不再找
  }
  turn.trail.push({ kind: 'text', text });
}

/**
 * late join 快照（服务端**合成**的 `message_start`，其 content 是累积快照而非空壳，docs/02 §5.2 时序 ③）：
 * 把「半截 assistant 消息」接回末轮的轨迹尾部与回答草稿（docs/05 §5.3）。
 *
 * 不接的话刷新/重连后已生成的部分永久丢失，只能等此后增量（界面看起来就是「没接上流」）。
 * 两种情况共用同一份代码：刷新后轨迹里根本没有这段（直接追加），重连时已有增量行
 * （按 toolCallId / thinking 前缀认领并整体替换，避免行重复）。
 */
function applyAssistantSnapshot(turns: Turn[], message: AssistantMessage): void {
  const turn = lastTurn(turns);
  if (turn === undefined) return;
  // 切刀规则同 message_end（docs/05 §6.5 规则 3）：最后一个 process 块之后的 text 归回答草稿，
  // 之前的 text 落轨迹行（与断线前降级出的行按前缀认领替换，同 thinking 行的合并逻辑）
  const cut = lastProcessBlockIndex(message.content);
  const draftParts: string[] = [];
  let claimedTextRows = 0;
  message.content.forEach((block, index) => {
    const isLast = index === message.content.length - 1;
    if (block.type === 'text') {
      if (index > cut) draftParts.push(block.text);
      else claimTextRow(turn, block.text, claimedTextRows++);
      return;
    }
    if (block.type === 'thinking') {
      const at = lastThinkingIndex(turn.trail);
      const row = at === -1 ? undefined : turn.trail[at];
      if (row !== undefined && row.kind === 'thinking' && block.thinking.startsWith(row.text)) {
        turn.trail[at] = { ...row, text: block.thinking, streaming: isLast };
      } else {
        turn.trail.push({ kind: 'thinking', text: block.thinking, streaming: isLast });
      }
    } else if (block.type === 'toolCall') {
      // 参数还在流式时 SDK 会把 raw 片段放在 partialJson 上（wire 只是展开透传）：
      // 保留原文并停在 preparing，后续 toolcall_delta 才能继续往同一行追加
      const partial = (block as { partialJson?: unknown }).partialJson;
      const streamingArgs = typeof partial === 'string' && partial.length > 0 ? partial : null;
      const patch: Partial<ToolRow> = {
        toolName: block.name,
        title: toolTitle(block.name, block.arguments),
        argsText: streamingArgs ?? JSON.stringify(block.arguments, null, 2),
      };
      if (findToolRow(turns, block.id) === undefined) {
        turn.trail.push({
          kind: 'tool',
          toolCallId: block.id,
          toolName: block.name,
          title: patch.title ?? block.name,
          argsText: patch.argsText ?? '',
          status: 'preparing',
          output: null,
          isError: false,
        });
      } else {
        patchToolRow(turns, block.id, patch);
      }
    }
  });
  const text = draftParts.join('\n');
  // 只在「客户端手里的草稿是快照的前缀（含空）」时才覆盖：重连时本地 draft 可能已经
  // 跨过前一条 assistant 消息（fold 把整轮文本累积在 final 上），直接覆盖会吃掉前半段
  if (text.length > 0 && (turn.final === null || text.startsWith(turn.final.markdown))) {
    turn.final = { markdown: text };
  }
}

/** 工具执行起始时刻（fold 内部记账，跨事件配对 start/end） */
const toolStartTimes = new Map<string, number>();

/** 思考段起始时刻（thinking 无 id，`thinking_start`/`thinking_end` 严格成对） */
let thinkingStartedAt: number | null = null;
