import type { AgentMessage, SessionEntry } from '@ice-ai/protocol';
import {
  assistantKey,
  ingestAssistantMessage,
  ingestToolResult,
  type SystemRow,
  type Turn,
} from './fold';

/**
 * 历史重建（docs/05-client-design.md §6.4）：REST 事实（messages / 会话文件条目）
 * → 与 `fold.ts` **同一形状**的 `Turn[]`。刷新、首屏、重连后都是这条路径，
 * 因此折叠规则必须与实时路径一致——分组封口规则因此只依赖消息序列
 * （`.jsonl` 里没有 turn/agent 边界条目，改用事件封口必然形状漂移，docs/05 §6.5）。
 *
 * 本文件是纯函数模块（无状态、无 IO、不 import React）。
 */

/**
 * `GET /api/sessions/:id/context` 的 messages（或 agent_end 的全量消息）→ `Turn[]`。
 * 历史轮的 status 恒为终态（`done` / 末轮的 `stopped` / `error`）。
 */
export function turnsFromMessages(messages: AgentMessage[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const message of messages) {
    if (message.role === 'user') {
      current = {
        id: `turn-${message.timestamp}`,
        user: { text: userText(message), at: message.timestamp },
        trail: [],
        final: null,
        usage: null,
        model: null,
        status: 'done',
      };
      turns.push(current);
      continue;
    }
    if (message.role === 'assistant') {
      if (current === null) {
        current = syntheticTurn(assistantKey(message), message.timestamp);
        turns.push(current);
      }
      current = replaceLast(turns, ingestAssistantMessage(current, message));
      continue;
    }
    if (message.role === 'toolResult') {
      if (current !== null) current = replaceLast(turns, ingestToolResult(current, message));
      continue;
    }
    if (message.role === 'custom') {
      const text =
        typeof message.content === 'string' ? message.content : textOfContent(message.content);
      if (message.display && text !== '') current = appendSystem(turns, current, text, 'info');
      continue;
    }
    if (message.role === 'bashExecution') {
      const text = `$ ${message.command}\n${message.output}`.trim();
      current = appendSystem(turns, current, text, message.exitCode === 0 ? 'info' : 'warn');
      continue;
    }
    if (message.role === 'compactionSummary') {
      current = appendSystem(
        turns,
        current,
        `上下文已压缩（压缩前 ${message.tokensBefore} tokens）`,
        'info',
      );
      continue;
    }
    if (message.role === 'branchSummary') {
      current = appendSystem(turns, current, `分支摘要：${truncate(message.summary, 200)}`, 'info');
    }
  }
  const last = turns[turns.length - 1];
  if (last !== undefined) turns[turns.length - 1] = withTerminalStatus(last, messages);
  return turns;
}

/** 会话文件 `message` 条目 → `Turn[]`（与 context 路径等价，供条目侧调用方复用） */
export function turnsFromEntries(entries: SessionEntry[]): Turn[] {
  const messages: AgentMessage[] = [];
  for (const entry of entries) {
    if (entry.type === 'message') messages.push(entry.message);
  }
  return turnsFromMessages(messages);
}

/** 末轮终态：末条 assistant 的 stopReason 决定 `stopped` / `error` */
function withTerminalStatus(turn: Turn, messages: AgentMessage[]): Turn {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== 'assistant') continue;
    if (message.stopReason === 'aborted') return { ...turn, status: 'stopped' };
    if (message.stopReason === 'error') return { ...turn, status: 'error' };
    return turn;
  }
  return turn;
}

function replaceLast(turns: Turn[], turn: Turn): Turn {
  turns[turns.length - 1] = turn;
  return turn;
}

function appendSystem(
  turns: Turn[],
  current: Turn | null,
  text: string,
  tone: SystemRow['tone'],
): Turn {
  const base = current ?? syntheticTurn(`sys-${turns.length}`, 0);
  if (current === null) turns.push(base);
  const next: Turn = {
    ...base,
    trail: [
      ...base.trail,
      { kind: 'system', id: `sys-${base.id}-${base.trail.length}`, text, tone } satisfies SystemRow,
    ],
  };
  turns[turns.length - 1] = next;
  return next;
}

function syntheticTurn(id: string, at: number): Turn {
  return {
    id: `turn-synth-${id}`,
    user: { text: '', at },
    trail: [],
    final: null,
    usage: null,
    model: null,
    status: 'done',
  };
}

function userText(message: Extract<AgentMessage, { role: 'user' }>): string {
  if (typeof message.content === 'string') return message.content;
  return textOfContent(message.content);
}

function textOfContent(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('\n');
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
