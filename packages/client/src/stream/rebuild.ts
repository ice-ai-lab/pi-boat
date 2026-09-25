import type { AgentMessage } from '@ice-ai/protocol';
import { applyToolResult, assistantFinalText, userText } from './fold';
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
export function rebuildTurns(messages: AgentMessage[], entryIds: string[]): Turn[] {
  const turns: Turn[] = [];
  const entryIdOf = (index: number): string => entryIds[index] ?? `m${index}`;

  messages.forEach((message, index) => {
    switch (message.role) {
      case 'user': {
        const images =
          typeof message.content === 'string'
            ? undefined
            : message.content.filter((block) => block.type === 'image').map((block) => block.data);
        turns.push({
          id: entryIdOf(index),
          user: {
            text: userText(message),
            images: images !== undefined && images.length > 0 ? images : undefined,
            at: message.timestamp,
          },
          trail: [],
          final: null,
          usage: null,
          model: null,
          status: 'done',
        });
        return;
      }
      case 'assistant': {
        // 窗口从轮中间开始（分页/尾部窗口）：建孤儿轮承接，绝不丢数据
        const turn =
          turns[turns.length - 1] ?? pushOrphanTurn(turns, message.timestamp, entryIdOf(index));
        const trail: TrailItem[] = [];
        for (const block of message.content) {
          if (block.type === 'thinking') {
            trail.push({ kind: 'thinking', text: block.thinking, streaming: false });
          } else if (block.type === 'toolCall') {
            trail.push({
              kind: 'tool',
              toolCallId: block.id,
              toolName: block.name,
              title: toolTitle(block.name, block.arguments),
              argsText: JSON.stringify(block.arguments, null, 2),
              status: 'ok',
              output: null,
              isError: false,
            });
          }
        }
        turn.trail = [...turn.trail, ...trail];
        const final = assistantFinalText(message);
        if (final.length > 0) turn.final = { markdown: final };
        turn.usage = message.usage;
        turn.model = { provider: message.provider, modelId: message.model };
        if (message.stopReason === 'aborted' && turn.status === 'streaming')
          turn.status = 'stopped';
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
        if (owner !== undefined) applyToolResult([owner], message);
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
    orphan: true,
  };
  turns.push(orphan);
  return orphan;
}

/** 重建整体 ChatState（历史态：streaming=false、无队列） */
export function rebuildChatState(
  messages: AgentMessage[],
  entryIds: string[],
  sessionName?: string,
): ChatState {
  return {
    turns: rebuildTurns(messages, entryIds),
    extensionRequest: null,
    streaming: false,
    queued: { steering: [], followUp: [] },
    sessionName,
    terminated: false,
  };
}
