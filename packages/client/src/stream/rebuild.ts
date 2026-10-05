import type { AgentMessage, AssistantMessage, QueuedMessages } from '@ice-ai/protocol';
import { applyToolResult, lastProcessBlockIndex, userText } from './fold';
import { type ImageCoords, messageImageSrcs } from './image-src';
import { toolTitle } from './tool-display';
import type { ChatState, TrailItem, Turn } from './view-model';

/**
 * rebuild（docs/05 §6.4）：REST 历史（`/api/sessions/:id/context` 的 messages + entryIds）
 * → 与 fold 同形状的视图模型。「刷新页面不丢形状」的唯一路径；也是 fold 的测试对照物
 * （同一轮对话，两条路径产出应等价）。
 *
 * 分组规则与 fold 一致（docs/05 §6.5：只依赖消息序列，不依赖 turn/agent 事件）；
 * 历史轮的 isLiveTail 恒为 false（成组态直出）。
 */
export function rebuildTurns(
  messages: AgentMessage[],
  entryIds: string[],
  sessionId?: string | null,
): Turn[] {
  const turns: Turn[] = [];
  const entryIdOf = (index: number): string => entryIds[index] ?? `m${index}`;
  /** 图片取数坐标：entryId 与 messages 平行（见 image-src.ts 的注释） */
  const coordsOf = (index: number): ImageCoords => ({
    sessionId: sessionId ?? null,
    entryId: entryIdOf(index),
  });

  messages.forEach((message, index) => {
    switch (message.role) {
      case 'user': {
        turns.push({
          id: entryIdOf(index),
          user: {
            text: userText(message),
            images: messageImageSrcs(message.content, coordsOf(index)),
            at: message.timestamp,
          },
          trail: [],
          final: null,
          usage: null,
          model: null,
          status: 'done',
          errorMessage: null,
        });
        return;
      }
      case 'assistant': {
        // 窗口从轮中间开始（分页/尾部窗口）：建孤儿轮承接，绝不丢数据
        const turn =
          turns[turns.length - 1] ?? pushOrphanTurn(turns, message.timestamp, entryIdOf(index));
        appendAssistantMessage(turn, message);
        turn.usage = message.usage;
        turn.model = { provider: message.provider, modelId: message.model };
        turn.errorMessage = message.errorMessage ?? null;
        // 状态链与 fold 的 message_end 对齐（rebuild 是它的历史对照物，两条路径等价）：
        // error → 红框出原始 errorMessage；后续成功消息（自动重试）把 error 撤回 done
        if (message.stopReason === 'aborted') turn.status = 'stopped';
        else if (message.stopReason === 'error') turn.status = 'error';
        else if (turn.status === 'error') turn.status = 'done';
        return;
      }
      case 'toolResult': {
        // 归属：找包含该 toolCallId 的最近轮（回填输出；实时路径里归属恒为末轮）
        const owner = [...turns]
          .reverse()
          .find((turn) =>
            turn.trail.some(
              (item) => item.kind === 'tool' && item.toolCallId === message.toolCallId,
            ),
          );
        if (owner !== undefined) applyToolResult([owner], message, coordsOf(index));
        else pushOrphanTurn(turns, message.timestamp, entryIdOf(index));
        return;
      }
      case 'compactionSummary': {
        const turn = turns[turns.length - 1];
        if (turn !== undefined) {
          turn.trail = [
            ...turn.trail,
            { kind: 'system', text: '已压缩早期对话（摘要见上）', tone: 'info' },
          ];
        }
        return;
      }
      case 'bashExecution': {
        const turn = turns[turns.length - 1];
        if (turn !== undefined) {
          turn.trail = [
            ...turn.trail,
            { kind: 'system', text: `执行命令：${message.command}`, tone: 'info' },
          ];
        }
        return;
      }
      default:
        // system（服务端已过滤）/ custom / branchSummary：F1 不渲染
        return;
    }
  });

  return turns;
}

/** 新建孤儿轮（无用户锚点的前导片段）并返回它 */
function pushOrphanTurn(turns: Turn[], at: number, id: string): Turn {
  const orphan: Turn = {
    id,
    user: { text: '', at },
    trail: [],
    final: null,
    usage: null,
    model: null,
    status: 'done',
    errorMessage: null,
    orphan: true,
  };
  turns.push(orphan);
  return orphan;
}

/**
 * 把一条 assistant 消息按块序折进轮（与 fold 的 message_end / 快照同规则，docs/05 §6.5 规则 3/4）：
 * - 中间轮（stopReason=toolUse，停下来调工具）：整条消息属过程，text 一律落轨迹行——
 *   不落就会被当成回答，且被后续消息覆盖后彻底丢失（多轮 trace 丢非思考内容的根因）；
 * - 其余消息：最后一个 process 块（thinking/toolCall）之后的 text 归回答，之前的落轨迹行。
 */
function appendAssistantMessage(turn: Turn, message: AssistantMessage): void {
  const intermediate = message.stopReason === 'toolUse';
  const cut = lastProcessBlockIndex(message.content);
  const answerParts: string[] = [];
  const trail: TrailItem[] = [];
  message.content.forEach((block, index) => {
    if (block.type === 'thinking') {
      trail.push({ kind: 'thinking', text: block.thinking, streaming: false });
    } else if (block.type === 'toolCall') {
      // 起点是 `preparing` 而不是 `ok`：有结果的工具行一律由 `applyToolResult`
      // 回填成 ok/error，所以「停在 preparing」= 历史里还没有 toolResult——既可能是
      // 进行中的 run（applyLiveRun 会标回 running），也可能是中断的旧轮。
      // 写死 ok 会让「正在跑的工具」在刷新后显示成已完成且无输出。
      trail.push({
        kind: 'tool',
        toolCallId: block.id,
        toolName: block.name,
        title: toolTitle(block.name, block.arguments),
        argsText: JSON.stringify(block.arguments, null, 2),
        status: 'preparing',
        output: null,
        isError: false,
      });
    } else if (block.type === 'text') {
      if (intermediate || index <= cut) trail.push({ kind: 'text', text: block.text });
      else answerParts.push(block.text);
    }
  });
  turn.trail = [...turn.trail, ...trail];
  const answer = answerParts.join('\n');
  if (answer.length > 0) turn.final = { markdown: answer };
}

/** 重建整体 ChatState（历史态：streaming=false、无队列） */
export function rebuildChatState(
  messages: AgentMessage[],
  entryIds: string[],
  options: { sessionName?: string; sessionId?: string | null } = {},
): ChatState {
  return {
    turns: rebuildTurns(messages, entryIds, options.sessionId),
    extensionRequest: null,
    streaming: false,
    queued: { steering: [], followUp: [] },
    sessionName: options.sessionName,
    terminated: false,
  };
}

/** 打开会话时服务端给的运行态（`GET /api/agent/:id` 的 AgentState 子集） */
export interface LiveRunSnapshot {
  /** SDK：模型正在流式产出（agent run 进行中） */
  isStreaming: boolean;
  /** PiBoat：尚有 prompt/steer/follow_up 未销账（覆盖扩展命令等事件流盲区，docs/02 §3.4） */
  isPromptRunning: boolean;
  /** 服务端侧的排队消息快照（steering / followUp） */
  queuedMessages: QueuedMessages;
}

/**
 * 把运行态折进 REST 重建出的「静止」视图模型——`open()` 打开一个**正在跑**的会话时用
 * （docs/05 §7.2：刷新中途接流）。
 *
 * 为什么必须折：`rebuildChatState` 只认 `.jsonl` 事实，而磁盘上还没有的那一段（进行中的
 * assistant 消息、未落盘的 toolResult）它一无所知。不折的话刷新后三样东西同时丢——
 * ①composer 的停止态与 Esc 接管（`chat.streaming`）②末轮的平铺渲染
 * （`isLiveTail` 要 `turn.status === 'streaming'`）③已发起但还没有结果的工具行
 * （历史里没有结果可回填，只能停在 `preparing`，界面看不出它在跑）。
 *
 * `isPromptRunning`（docs/02 §3.4 的盲区判据）只在订阅建立前的窗口里有效：`connected` 帧只带
 * `isStreaming`，订阅一生效就以那一帧为准（见 `fold` 的 `connected` 分支）。
 */
export function applyLiveRun(state: ChatState, snapshot: LiveRunSnapshot): ChatState {
  return {
    ...state,
    // 判据同 docs/02 §3.4：isStreaming 或 isPromptRunning
    streaming: snapshot.isStreaming || snapshot.isPromptRunning,
    queued: {
      steering: [...snapshot.queuedMessages.steering],
      followUp: [...snapshot.queuedMessages.followUp],
    },
    turns: snapshot.isStreaming ? markLiveTail(state.turns) : state.turns,
  };
}

/** 末轮仍在流式：状态标回 `streaming`，尚无结果的工具行标回 `running` */
function markLiveTail(turns: Turn[]): Turn[] {
  const index = turns.length - 1;
  const turn = turns[index];
  if (turn === undefined) return turns;
  return [
    ...turns.slice(0, index),
    {
      ...turn,
      status: turn.status === 'done' ? 'streaming' : turn.status,
      trail: turn.trail.map((item) =>
        item.kind === 'tool' && item.status === 'preparing'
          ? { ...item, status: 'running' as const }
          : item,
      ),
    },
  ];
}
