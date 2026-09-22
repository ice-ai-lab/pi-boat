import type {
  AgentMessage,
  AgentState,
  AssistantMessage,
  ModelRef,
  ThinkingLevel,
  ToolResultMessage,
  Usage,
  UserMessage,
  WireAgentEvent,
} from '@ice-ai/protocol';
import { turnsFromMessages } from './rebuild';

/**
 * 视图模型（docs/05-client-design.md §6）——wire 事件与 REST 历史共同蒸出的
 * 「可直接渲染的结构」。本文件是**纯函数**模块：无状态、无 IO、不 import React。
 *
 * 为什么需要：原型（docs/design/piboat-web-v3.html）画出了 wire 事件之上的一层——
 * 处理详情分组、折叠行、每轮 usage——而 protocol 只到 wire 事件。协议不承诺 UI 形状，
 * 且历史（REST messages）与实时（SSE 事件）必须蒸出同一种形状（刷新前后不跳变），
 * 所以它归 client 私有契约。
 *
 * 两条路径：
 * - `foldEvent()`：实时增量（事件 + 当前视图 → 新视图）；无副作用但**不做原地修改**
 *   （每步产生新对象/新数组——React Compiler 与 useSyncExternalStore 都靠引用变化判定更新）
 * - `rebuild.ts` 的 `turnsFromMessages()`：历史重建，产出同一形状（§6.4 要求两者等价）
 */

// ---------------------------------------------------------------------------
// 形状（docs/05 §6.1）
// ---------------------------------------------------------------------------

export interface ThinkingRow {
  kind: 'thinking';
  id: string;
  text: string;
  streaming: boolean;
  durationMs?: number;
}

export interface ToolRow {
  kind: 'tool';
  id: string;
  toolCallId: string;
  toolName: string;
  /** 命令 / 文件路径 / 任务描述，来自参数 */
  title: string;
  /** 折叠体原文（toolcall_end 补齐） */
  args: unknown;
  status: 'preparing' | 'running' | 'ok' | 'error' | 'stopped';
  output: string | null;
  /**
   * 结构化 diff（仅 edit 类工具）：SDK 的 edit 工具已生成带行号的展示 diff，
   * 放在 toolResult 的 `details.diff` 里——前端不做 diff 运算、不加依赖（docs/05 §8.1 #5）。
   */
  diff?: string;
  durationMs?: number;
  /** fold 内部：tool_execution_start 时刻，用于算 durationMs（历史重建无此字段） */
  startedAt?: number;
}

/**
 * 过程文本行：assistant 在最终回答之前输出的文本（如「先看一下 docs」这类旁白）。
 * 不在 docs/05 §6.1 原始清单内——原型用 `.disc-title.plain` 表达，pi-web 的 processBlocks
 * 亦含 text 块；不落这一行会让更早的文本在「最终回答」定稿时凭空消失（2026-09-23 补记）。
 */
export interface TextRow {
  kind: 'text';
  id: string;
  text: string;
}

/** 压缩 / 重试 / 终止等系统行 */
export interface SystemRow {
  kind: 'system';
  id: string;
  text: string;
  tone: 'info' | 'warn' | 'error';
}

export interface ProcessGroupData {
  kind: 'group';
  id: string;
  items: TrailRow[];
  /** 组内 thinking + text 行数（原型「处理详情 · N 条消息」） */
  messageCount: number;
  toolCallCount: number;
  /** 组内工具执行耗时之和（M1 只能算这个；LLM 耗时要 core 累加，见 docs/06 §11.2） */
  durationMs: number;
}

/** 轨迹原始行（fold/rebuild 的产出单元） */
export type TrailRow = ThinkingRow | ToolRow | TextRow | SystemRow;
/** 轨迹渲染单元（groupTrail 派生：末轮流式期间平铺，静止后收拢成组） */
export type TrailItem = TrailRow | ProcessGroupData;

export interface Turn {
  id: string;
  /** 合成轮（late join 只拿到半截 assistant 消息）时 `at` 为 0、`text` 为空 */
  user: { text: string; images?: string[]; at: number };
  trail: TrailRow[];
  /** 最终回答；流式期间为 draft，message_end 定稿 */
  final: { markdown: string } | null;
  usage: Usage | null;
  model: ModelRef | null;
  status: 'streaming' | 'done' | 'stopped' | 'error';
}

/** AgentStream 的对外快照（useSyncExternalStore 的 snapshot） */
export interface ChatView {
  turns: Turn[];
  /** agent 是否在跑（agent_start → agent_settled / agent_end 不重试） */
  running: boolean;
  queue: { steering: string[]; followUp: string[] };
  sessionName: string | null;
  thinkingLevel: ThinkingLevel | null;
  willRetry: boolean;
  /** 服务端状态快照（REST 轻查合并；未运行时为 null） */
  state: AgentState | null;
  /** 不可解析 / 未知类型的帧计数（协议漂移探针，docs/05 §5.4） */
  invalidFrames: number;
  /** 面向用户的提示（重连 / 关停） */
  notice: string | null;
  /** 已应用事件的水位线：丢弃 seq ≤ lastSeq 的帧（docs/05 §5.2） */
  lastSeq: number;
  /**
   * 是否已收到 `connected`（SSE 建流完成）。
   * 用途：宿主可以「先建流、再发首条消息」，避免 run 跑在订阅之前（docs/05 §5.1 时序）。
   */
  connected: boolean;
  /**
   * fold 内部状态：当前流式 assistant 消息的 key。
   * message_update 不带消息标识（core 只投影 usage + 子事件增量），
   * 所以增量行要挂到 message_start 定下的 key 上，message_end 才能按同一 id 覆盖。
   */
  activeAssistantKey: string | null;
}

export function createChatView(): ChatView {
  return {
    turns: [],
    running: false,
    queue: { steering: [], followUp: [] },
    sessionName: null,
    thinkingLevel: null,
    willRetry: false,
    state: null,
    invalidFrames: 0,
    notice: null,
    lastSeq: 0,
    connected: false,
    activeAssistantKey: null,
  };
}

// ---------------------------------------------------------------------------
// 派生：分组（docs/05 §6.5 方案 2——流式期间末轮平铺，静止后收拢）
// ---------------------------------------------------------------------------

/**
 * 轨迹行 → 渲染单元。方案 2：**末轮流式期间平铺不分组**，轮结束才一次性成组。
 * 系统行（压缩/重试）不吸入组内——它需要始终可见（原型把压缩做成正文分隔条）。
 * 组边界由消息序列决定（不依赖 turn/agent 事件），所以历史轮的 isLiveTail 恒为 false，
 * rebuild 与 fold 产出同形状（§6.4 硬要求）。
 */
export function groupTrail(rows: TrailRow[], opts: { isLiveTail: boolean }): TrailItem[] {
  if (opts.isLiveTail || rows.length === 0) return rows;
  const out: TrailItem[] = [];
  let buffer: TrailRow[] = [];
  const flush = (): void => {
    if (buffer.length === 0) return;
    out.push(makeGroup(buffer));
    buffer = [];
  };
  for (const row of rows) {
    if (row.kind === 'system') {
      flush();
      out.push(row);
    } else {
      buffer.push(row);
    }
  }
  flush();
  return out;
}

function makeGroup(items: TrailRow[]): ProcessGroupData {
  let messageCount = 0;
  let toolCallCount = 0;
  let durationMs = 0;
  for (const item of items) {
    if (item.kind === 'thinking' || item.kind === 'text') messageCount += 1;
    if (item.kind === 'tool') {
      toolCallCount += 1;
      durationMs += item.durationMs ?? 0;
    }
  }
  return {
    kind: 'group',
    id: `group-${items[0]?.id ?? 'empty'}`,
    items,
    messageCount,
    toolCallCount,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// 派生：REST 历史 + 事件流叠加（docs/05 §5.3 重连=整体重建的落点）
// ---------------------------------------------------------------------------

/**
 * 历史轮 + 事件轮合并：
 * - 同 id（同一条用户消息）→ 事件轮覆盖历史轮
 * - 合成轮（late join 只有半截 assistant 消息，`user.at === 0`）→ 并入最近一条历史轮，
 *   避免"用户气泡一轮 + 答案另起一轮"的错位
 * - 其余事件轮追加在后
 */
export function mergeTurns(base: Turn[], overlay: Turn[]): Turn[] {
  if (overlay.length === 0) return base;
  if (base.length === 0) return overlay;
  const merged: Turn[] = [];
  const byId = new Map(overlay.map((turn) => [turn.id, turn]));
  const used = new Set<string>();
  for (const turn of base) {
    const match = byId.get(turn.id);
    if (match !== undefined) {
      used.add(match.id);
      merged.push(match);
      continue;
    }
    merged.push(turn);
  }
  const lastIndex = merged.length - 1;
  const last = merged[lastIndex];
  for (const turn of overlay) {
    if (used.has(turn.id)) continue;
    if (turn.user.at === 0 && last !== undefined) {
      merged[lastIndex] = {
        ...last,
        trail: [...last.trail, ...turn.trail],
        final: turn.final ?? last.final,
        usage: turn.usage ?? last.usage,
        model: turn.model ?? last.model,
        status: turn.status,
      };
      continue;
    }
    merged.push(turn);
  }
  return merged;
}

/** 全会话 token 汇总（StatsPills 用；tps 需要 core 累加 LLM 耗时，M1 不给） */
export function sumUsage(turns: Turn[]): Usage | null {
  let acc: Usage | null = null;
  for (const turn of turns) {
    if (turn.usage === null) continue;
    acc =
      acc === null ? { ...turn.usage, cost: { ...turn.usage.cost } } : addUsage(acc, turn.usage);
  }
  return acc;
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheWrite1h: (a.cacheWrite1h ?? 0) + (b.cacheWrite1h ?? 0),
    reasoning: (a.reasoning ?? 0) + (b.reasoning ?? 0),
    totalTokens: a.totalTokens + b.totalTokens,
    cost: {
      input: a.cost.input + b.cost.input,
      output: a.cost.output + b.cost.output,
      cacheRead: a.cost.cacheRead + b.cost.cacheRead,
      cacheWrite: a.cost.cacheWrite + b.cost.cacheWrite,
      total: a.cost.total + b.cost.total,
    },
  };
}

// ---------------------------------------------------------------------------
// fold：wire 事件 → 视图模型（docs/05 §6.3）
// ---------------------------------------------------------------------------

/**
 * 单事件折叠。`now` 可注入（测试确定性）；生产用 Date.now。
 * 幂等：assistant 消息的摄入按 `msgKey` 覆盖（行 id 稳定），因此
 * late-join 快照与 message_end 全量消息重复投喂不会产生重复行。
 */
export function foldEvent(
  view: ChatView,
  event: WireAgentEvent,
  now: () => number = Date.now,
): ChatView {
  const next = foldCase(view, event, now);
  // 水位线统一在此推进（不会回退）：
  // - connected 携带的是**快照水位**（本连接拿到的状态截至该 seq），故用它；
  // - 其余帧就是自身 seq（已应用 ⇒ 后续丢弃 ≤ seq 的重复帧）
  const floor =
    event.type === 'connected'
      ? Math.max(view.lastSeq, event.lastSeq)
      : Math.max(view.lastSeq, event.seq);
  return next.lastSeq === floor ? next : { ...next, lastSeq: floor };
}

function foldCase(view: ChatView, event: WireAgentEvent, now: () => number): ChatView {
  switch (event.type) {
    case 'connected':
      return { ...view, running: event.isStreaming, connected: true };
    case 'agent_start':
      return { ...view, running: true };
    case 'agent_settled':
      return {
        ...updateLastTurn(view, (turn) =>
          turn.status === 'streaming' ? { ...turn, status: 'done' } : turn,
        ),
        running: false,
        willRetry: false,
      };
    case 'turn_start':
    case 'turn_end':
      return view;
    case 'message_start':
      return startMessage(view, event.message);
    case 'message_update':
      return foldAssistantUpdate(view, event, now);
    case 'message_end':
      return endMessage(view, event.message);
    case 'tool_execution_start':
      return updateTool(view, event.toolCallId, event.toolName, event.args, (row) => ({
        ...row,
        status: 'running',
        startedAt: now(),
      }));
    case 'tool_execution_update':
      return updateTool(view, event.toolCallId, event.toolName, event.args, (row) => ({
        ...row,
        output: extractText(event.partialResult) ?? row.output,
      }));
    case 'tool_execution_end':
      return updateTool(view, event.toolCallId, event.toolName, undefined, (row) => ({
        ...row,
        status: event.isError ? 'error' : 'ok',
        output: extractText(event.result) ?? row.output,
        diff: extractDiff(event.result) ?? row.diff,
        durationMs:
          row.startedAt === undefined ? row.durationMs : Math.max(0, now() - row.startedAt),
      }));
    case 'agent_end': {
      const settled = event.willRetry
        ? view
        : updateLastTurn(view, (turn) =>
            turn.status === 'streaming' ? { ...turn, status: 'done' } : turn,
          );
      // 兜底对账（docs/05 §6.3）：丢帧后自愈——仅在本地无任何轮时用全量消息重建
      const turns =
        settled.turns.length === 0 && event.messages.length > 0
          ? turnsFromMessages(event.messages)
          : settled.turns;
      return { ...settled, turns, running: event.willRetry, willRetry: event.willRetry };
    }
    case 'queue_update':
      return { ...view, queue: { steering: [...event.steering], followUp: [...event.followUp] } };
    case 'compaction_start':
      return pushSystemRow(view, `正在压缩上下文（${event.reason}）…`, 'info');
    case 'compaction_end': {
      if (event.errorMessage !== undefined) {
        return pushSystemRow(view, `压缩失败：${event.errorMessage}`, 'error');
      }
      if (event.aborted) return pushSystemRow(view, '压缩已中止', 'warn');
      return pushSystemRow(view, '上下文已压缩', 'info');
    }
    case 'auto_retry_start':
      return pushSystemRow(
        view,
        `请求失败，${event.delayMs}ms 后重试（${event.attempt}/${event.maxAttempts}）：${event.errorMessage}`,
        'warn',
      );
    case 'auto_retry_end':
      return event.success
        ? pushSystemRow(view, '重试成功', 'info')
        : pushSystemRow(view, `重试失败：${event.finalError ?? '未知错误'}`, 'error');
    case 'summarization_retry_scheduled':
      return pushSystemRow(
        view,
        `摘要失败，${event.delayMs}ms 后重试（${event.attempt}/${event.maxAttempts}）：${event.errorMessage}`,
        'warn',
      );
    case 'summarization_retry_attempt_start':
      return pushSystemRow(view, `正在重试摘要（${event.source}）…`, 'warn');
    case 'summarization_retry_finished':
      return view;
    case 'entry_appended':
      // M1 忽略：重连靠 REST 重建，不靠事件重放（docs/05 §6.3）
      return view;
    case 'session_info_changed':
      return { ...view, sessionName: event.name ?? null };
    case 'thinking_level_changed':
      return { ...view, thinkingLevel: event.level };
    case 'session_shutdown':
      return {
        ...updateLastTurn(view, (turn) =>
          turn.status === 'streaming' ? { ...turn, status: 'stopped' } : turn,
        ),
        running: false,
        notice: '会话已关闭（可返回首页新建会话）',
      };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// fold 内部：消息生命周期
// ---------------------------------------------------------------------------

function startMessage(view: ChatView, message: AgentMessage): ChatView {
  if (message.role === 'user') return startUserTurn(view, message);
  if (message.role === 'assistant') return startAssistantMessage(view, message);
  if (message.role === 'toolResult') return applyToolResult(view, message);
  return view;
}

function startUserTurn(view: ChatView, message: UserMessage): ChatView {
  const id = `turn-${message.timestamp}`;
  if (view.turns.some((turn) => turn.id === id)) return view; // 重放去重
  const { text, images } = splitUserContent(message);
  const turn: Turn = {
    id,
    user: { text, at: message.timestamp, ...(images.length > 0 ? { images } : {}) },
    trail: [],
    final: null,
    usage: null,
    model: null,
    status: 'streaming',
  };
  return {
    ...view,
    turns: [...view.turns, turn],
    running: true,
    activeAssistantKey: null,
  };
}

/**
 * 半截消息恢复：服务端合成的 message_start 载荷是**累积消息**（非空壳），
 * 增量行必须挂到它的 key 上（否则订阅前已生成的前缀会丢），因此此处先整体摄入一遍。
 */
function startAssistantMessage(view: ChatView, message: AssistantMessage): ChatView {
  const msgKey = assistantKey(message);
  const base =
    view.turns.length === 0 ? pushTurn(view, syntheticTurn(msgKey, message.timestamp)) : view;
  const withSnapshot = updateLastTurn(base, (turn) => {
    // 同一轮里的新 assistant 消息：上一条的定稿回答降级为过程文本
    const moved: TrailRow[] =
      turn.final === null
        ? turn.trail
        : [
            ...turn.trail,
            { kind: 'text', id: `${msgKey}-prev`, text: turn.final.markdown } satisfies TextRow,
          ];
    const trail = ingestAssistantBlocks(moved, message, msgKey);
    const lastBlock = message.content[message.content.length - 1];
    return {
      ...turn,
      trail:
        lastBlock?.type === 'thinking'
          ? updateRow(trail, thinkingId(msgKey, message.content.length - 1), (row) =>
              row.kind === 'thinking' ? { ...row, streaming: true } : row,
            )
          : trail,
      final: null,
      status: 'streaming',
    };
  });
  return { ...withSnapshot, activeAssistantKey: msgKey };
}

function foldAssistantUpdate(
  view: ChatView,
  event: Extract<WireAgentEvent, { type: 'message_update' }>,
  now: () => number,
): ChatView {
  const sub = event.assistantMessageEvent;
  // 防御：未见 message_start 的增量（丢帧）挂到一个本地 key 上，message_end 会清掉这些行
  const msgKey = view.activeAssistantKey ?? `pending-${view.turns.length}`;
  const base = view.turns.length === 0 ? pushTurn(view, syntheticTurn(msgKey, now())) : view;
  return updateLastTurn(base, (turn) => {
    const withUsage: Turn = { ...turn, usage: event.usage, status: 'streaming' };
    switch (sub.type) {
      case 'start':
      case 'text_start':
        return withUsage;
      case 'text_delta':
        return {
          ...withUsage,
          trail: appendTextDelta(withUsage.trail, msgKey, sub.contentIndex, sub.delta),
        };
      case 'text_end':
        return {
          ...withUsage,
          trail: upsertText(withUsage.trail, msgKey, sub.contentIndex, sub.content),
        };
      case 'thinking_start':
        return {
          ...withUsage,
          trail: pushRow(withUsage.trail, thinkingRow(msgKey, sub.contentIndex, '', true)),
        };
      case 'thinking_delta':
        return {
          ...withUsage,
          trail: updateRow(withUsage.trail, thinkingId(msgKey, sub.contentIndex), (row) =>
            row.kind === 'thinking' ? { ...row, text: row.text + sub.delta } : row,
          ),
        };
      case 'thinking_end':
        return {
          ...withUsage,
          trail: updateRow(withUsage.trail, thinkingId(msgKey, sub.contentIndex), (row) =>
            row.kind === 'thinking' ? { ...row, text: sub.content, streaming: false } : row,
          ),
        };
      case 'toolcall_start':
        return {
          ...withUsage,
          trail: upsertRow(
            withUsage.trail,
            toolRow(msgKey, sub.contentIndex, sub.id, sub.toolName),
          ),
        };
      case 'toolcall_delta':
        return withUsage; // 参数增量由 toolcall_end 的全量 args 覆盖
      case 'toolcall_end': {
        const row = toolRow(msgKey, sub.contentIndex, sub.toolCall.id, sub.toolCall.name);
        return {
          ...withUsage,
          trail: upsertRow(withUsage.trail, {
            ...row,
            args: sub.toolCall.arguments,
            title: toolTitle(sub.toolCall.name, sub.toolCall.arguments),
          }),
        };
      }
      case 'done':
        return withUsage;
      case 'error': {
        const aborted = sub.reason === 'aborted';
        const detail = sub.error.role === 'assistant' ? sub.error.errorMessage : undefined;
        return {
          ...withUsage,
          trail: pushRow(withUsage.trail, {
            kind: 'system',
            id: `${msgKey}-error`,
            text: detail ?? (aborted ? '本轮已中止' : '模型返回错误'),
            tone: aborted ? 'warn' : 'error',
          } satisfies SystemRow),
          status: aborted ? 'stopped' : 'error',
        };
      }
      default:
        return withUsage;
    }
  });
}

function endMessage(view: ChatView, message: AgentMessage): ChatView {
  if (message.role === 'assistant') {
    const msgKey = assistantKey(message);
    const finalized = updateLastTurn(view, (turn) => finalizeAssistant(turn, message, msgKey));
    return { ...finalized, activeAssistantKey: null };
  }
  if (message.role === 'toolResult') return applyToolResult(view, message);
  return view;
}

/**
 * message_end（assistant）：摄入全量消息（幂等覆盖流式期的增量行），并把
 * 「最后一个过程块之后的文本行」收成最终回答（docs/05 §6.5 的 splitFinalAssistantBlocks）。
 * 丢帧兜底：清掉挂在不稳定 key（`pending-*`）上的行，避免与全量消息重复。
 */
function finalizeAssistant(turn: Turn, message: AssistantMessage, msgKey: string): Turn {
  let trail = turn.trail.filter((row) => !row.id.startsWith('pending-'));
  trail = ingestAssistantBlocks(trail, message, msgKey);
  const answerIds: string[] = [];
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const row = trail[i];
    if (row === undefined || row.kind !== 'text' || !row.id.startsWith(`${msgKey}:text:`)) break;
    answerIds.unshift(row.id);
  }
  let final: Turn['final'] = null;
  if (answerIds.length > 0) {
    const texts: string[] = [];
    trail = trail.filter((row) => {
      if (row.kind !== 'text' || !answerIds.includes(row.id)) return true;
      if (row.text.trim() !== '') texts.push(row.text);
      return false;
    });
    if (texts.length > 0) final = { markdown: texts.join('\n\n') };
  }
  const status: Turn['status'] =
    message.stopReason === 'aborted'
      ? 'stopped'
      : message.stopReason === 'error'
        ? 'error'
        : turn.status;
  return {
    ...turn,
    trail,
    final: final ?? turn.final,
    usage: emptyUsage(message.usage) ? turn.usage : message.usage,
    model: { provider: message.provider, modelId: message.responseModel ?? message.model },
    status,
  };
}

/** 把一条 assistant 消息的内容块摄入轨迹（thinking/tool/text），按稳定 id 幂等覆盖 */
function ingestAssistantBlocks(
  trail: TrailRow[],
  message: AssistantMessage,
  msgKey: string,
): TrailRow[] {
  let next = trail;
  message.content.forEach((block, index) => {
    if (block.type === 'thinking') {
      next = upsertRow(next, {
        kind: 'thinking',
        id: thinkingId(msgKey, index),
        text: block.thinking,
        streaming: false,
      });
    } else if (block.type === 'toolCall') {
      next = upsertRow(next, {
        ...toolRow(msgKey, index, block.id, block.name),
        args: block.arguments,
        title: toolTitle(block.name, block.arguments),
      });
    } else if (block.type === 'text' && block.text.trim() !== '') {
      next = upsertText(next, msgKey, index, block.text);
    }
  });
  return next;
}

function applyToolResult(view: ChatView, message: ToolResultMessage): ChatView {
  const payload = { content: message.content, details: message.details };
  const text = extractText(payload);
  const diff = extractDiff(payload);
  const status: ToolRow['status'] = message.isError ? 'error' : 'ok';
  return (
    patchToolInView(view, message.toolCallId, (row) => ({
      ...row,
      output: text ?? row.output,
      diff: diff ?? row.diff,
      status,
    })) ??
    // 会话中途接入：轨迹里还没有这条工具行（toolcall_* 在订阅之前）→ 就地补一行
    appendTool(view, {
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      title: message.toolName,
      args: {},
      status,
      output: text,
      ...(diff === null ? {} : { diff }),
    })
  );
}

/** 供 rebuild 复用：把一条 toolResult 并入轮的对应工具行（找不到就补一行） */
export function ingestToolResult(turn: Turn, message: ToolResultMessage): Turn {
  const patched = ingestToolResultTrail(turn.trail, message);
  return patched === turn.trail ? turn : { ...turn, trail: patched };
}

/** 供 rebuild 复用：把一条 assistant 消息并入轮（含最终回答定稿，docs/05 §6.5） */
export function ingestAssistantMessage(turn: Turn, message: AssistantMessage): Turn {
  return finalizeAssistant(turn, message, assistantKey(message));
}

function ingestToolResultTrail(trail: TrailRow[], message: ToolResultMessage): TrailRow[] {
  const payload = { content: message.content, details: message.details };
  const text = extractText(payload);
  const diff = extractDiff(payload);
  const patched = patchToolRow(trail, message.toolCallId, (row) => ({
    ...row,
    output: text ?? row.output,
    diff: diff ?? row.diff,
    status: message.isError ? 'error' : 'ok',
  }));
  if (patched !== null) return patched;
  return pushRow(trail, {
    kind: 'tool',
    id: `tool-late-${message.toolCallId}`,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
    title: message.toolName,
    args: {},
    status: message.isError ? 'error' : 'ok',
    output: text,
    ...(diff === null ? {} : { diff }),
  } satisfies ToolRow);
}

// ---------------------------------------------------------------------------
// fold 内部：轨迹行工具函数（全部返回新数组）
// ---------------------------------------------------------------------------

/** 按 toolCallId 覆盖一条工具行；没有该行返回 null（调用方决定是否补行） */
export function patchToolRow(
  trail: TrailRow[],
  toolCallId: string,
  updater: (row: ToolRow) => ToolRow,
): TrailRow[] | null {
  const index = trail.findIndex((row) => row.kind === 'tool' && row.toolCallId === toolCallId);
  if (index < 0) return null;
  const current = trail[index];
  if (current === undefined || current.kind !== 'tool') return null;
  const next = [...trail];
  next[index] = updater(current);
  return next;
}

function patchToolInView(
  view: ChatView,
  toolCallId: string,
  updater: (row: ToolRow) => ToolRow,
): ChatView | null {
  for (let t = view.turns.length - 1; t >= 0; t -= 1) {
    const turn = view.turns[t];
    if (turn === undefined) continue;
    const trail = patchToolRow(turn.trail, toolCallId, updater);
    if (trail === null) continue;
    const turns = [...view.turns];
    turns[t] = { ...turn, trail };
    return { ...view, turns };
  }
  return null;
}

function appendTool(view: ChatView, row: Omit<ToolRow, 'kind' | 'id'>): ChatView {
  const base = view.turns.length === 0 ? pushTurn(view, syntheticTurn(row.toolCallId, 0)) : view;
  return updateLastTurn(base, (turn) => ({
    ...turn,
    trail: pushRow(turn.trail, {
      kind: 'tool',
      id: `tool-late-${row.toolCallId}`,
      ...row,
    } satisfies ToolRow),
  }));
}

function updateTool(
  view: ChatView,
  toolCallId: string,
  toolName: string,
  args: unknown,
  updater: (row: ToolRow) => ToolRow,
): ChatView {
  const patched = patchToolInView(view, toolCallId, updater);
  if (patched !== null) return patched;
  // 没有对应工具行（订阅发生在 toolcall_* 之前）→ 补一行，并让本次事件照样落到行上
  const appended = appendTool(view, {
    toolCallId,
    toolName,
    title: args === undefined ? toolName : toolTitle(toolName, args),
    args: args ?? {},
    status: 'preparing',
    output: null,
  });
  return patchToolInView(appended, toolCallId, updater) ?? appended;
}

function pushTurn(view: ChatView, turn: Turn): ChatView {
  return { ...view, turns: [...view.turns, turn] };
}

function updateLastTurn(view: ChatView, updater: (turn: Turn) => Turn): ChatView {
  const index = view.turns.length - 1;
  const current = view.turns[index];
  if (current === undefined) return view;
  const next = updater(current);
  if (next === current) return view;
  const turns = [...view.turns];
  turns[index] = next;
  return { ...view, turns };
}

function pushSystemRow(view: ChatView, text: string, tone: SystemRow['tone']): ChatView {
  const base =
    view.turns.length === 0 ? pushTurn(view, syntheticTurn(`sys-${view.turns.length}`, 0)) : view;
  return updateLastTurn(base, (turn) => ({
    ...turn,
    trail: pushRow(turn.trail, {
      kind: 'system',
      id: `sys-${turn.id}-${turn.trail.length}`,
      text,
      tone,
    } satisfies SystemRow),
  }));
}

function syntheticTurn(id: string, at: number): Turn {
  return {
    id: `turn-synth-${id}`,
    user: { text: '', at },
    trail: [],
    final: null,
    usage: null,
    model: null,
    status: 'streaming',
  };
}

function pushRow(trail: TrailRow[], row: TrailRow): TrailRow[] {
  return [...trail, row];
}

function updateRow(
  trail: TrailRow[],
  id: string,
  updater: (row: TrailRow) => TrailRow,
): TrailRow[] {
  const index = trail.findIndex((row) => row.id === id);
  if (index < 0) return trail;
  const current = trail[index];
  if (current === undefined) return trail;
  const next = [...trail];
  next[index] = updater(current);
  return next;
}

/** 覆盖同 id 行；不存在则追加（顺序由内容块的先后决定，重复投喂不重复追加） */
function upsertRow(trail: TrailRow[], row: TrailRow): TrailRow[] {
  const index = trail.findIndex((item) => item.id === row.id);
  if (index < 0) return pushRow(trail, row);
  const next = [...trail];
  next[index] = row;
  return next;
}

function thinkingId(msgKey: string, contentIndex: number): string {
  return `${msgKey}:think:${contentIndex}`;
}

function thinkingRow(
  msgKey: string,
  contentIndex: number,
  text: string,
  streaming: boolean,
): ThinkingRow {
  return { kind: 'thinking', id: thinkingId(msgKey, contentIndex), text, streaming };
}

function toolRow(msgKey: string, contentIndex: number, id: string, toolName: string): ToolRow {
  return {
    kind: 'tool',
    id: `${msgKey}:tool:${contentIndex}`,
    toolCallId: id,
    toolName,
    title: toolName,
    args: {},
    status: 'preparing',
    output: null,
  };
}

function textId(msgKey: string, contentIndex: number): string {
  return `${msgKey}:text:${contentIndex}`;
}

function appendTextDelta(
  trail: TrailRow[],
  msgKey: string,
  contentIndex: number,
  delta: string,
): TrailRow[] {
  const id = textId(msgKey, contentIndex);
  const index = trail.findIndex((row) => row.id === id);
  if (index < 0) return pushRow(trail, { kind: 'text', id, text: delta } satisfies TextRow);
  const current = trail[index];
  if (current === undefined || current.kind !== 'text') return trail;
  const next = [...trail];
  next[index] = { ...current, text: current.text + delta };
  return next;
}

function upsertText(
  trail: TrailRow[],
  msgKey: string,
  contentIndex: number,
  text: string,
): TrailRow[] {
  return upsertRow(trail, {
    kind: 'text',
    id: textId(msgKey, contentIndex),
    text,
  } satisfies TextRow);
}

// ---------------------------------------------------------------------------
// 投影：消息 → 字符串
// ---------------------------------------------------------------------------

/** assistant 消息的稳定 key（同一条消息在增量/快照/end 三处同 key） */
export function assistantKey(message: AssistantMessage): string {
  return `m${message.timestamp}`;
}

function splitUserContent(message: UserMessage): { text: string; images: string[] } {
  if (typeof message.content === 'string') return { text: message.content, images: [] };
  const texts: string[] = [];
  const images: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text') texts.push(block.text);
    else if (block.type === 'image') images.push(`data:${block.mimeType};base64,${block.data}`);
  }
  return { text: texts.join('\n'), images };
}

export const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function emptyUsage(usage: Usage): boolean {
  return (
    usage.input === 0 &&
    usage.output === 0 &&
    usage.cacheRead === 0 &&
    usage.cacheWrite === 0 &&
    usage.totalTokens === 0
  );
}

/**
 * 工具结果 / partial result → 文本。SDK 的 result 形状随工具而变：
 * `{content:[{type:'text',text}]}`（标准 ToolResult）、裸字符串、或自定义对象。
 * 认不出时回落 null —— 折叠体（.disc-body）本就允许为空。
 */
export function extractText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractText(item))
      .filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join('\n') : null;
  }
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    const parts: string[] = [];
    for (const block of record.content) {
      if (block !== null && typeof block === 'object') {
        const entry = block as Record<string, unknown>;
        if (entry.type === 'text' && typeof entry.text === 'string') parts.push(entry.text);
        else if (entry.type === 'image') parts.push('[图片]');
      }
    }
    if (parts.length > 0) return parts.join('\n');
  }
  if (typeof record.text === 'string') return record.text;
  if (typeof record.output === 'string') return record.output;
  return null;
}

/** edit 工具的展示用 diff（`+<行号> …` / `-<行号> …` / ` <行号> …`），无则 null */
export function extractDiff(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const details = (value as Record<string, unknown>).details;
  if (details === null || details === undefined || typeof details !== 'object') return null;
  const diff = (details as Record<string, unknown>).diff;
  return typeof diff === 'string' && diff !== '' ? diff : null;
}

/** 工具 → 单行标题（原型 `.disc-title`）；认不出时退化为紧凑 JSON */
export function toolTitle(toolName: string, args: unknown): string {
  const record = args !== null && typeof args === 'object' ? (args as Record<string, unknown>) : {};
  const str = (key: string): string | null => {
    const value = record[key];
    return typeof value === 'string' && value !== '' ? value : null;
  };
  const command = str('command');
  if (command !== null) return command.split('\n')[0] ?? command;
  const path = str('path');
  if (path !== null) return path;
  const pattern = str('pattern');
  if (pattern !== null) {
    const where = str('path');
    return where === null ? pattern : `${pattern} in ${where}`;
  }
  const description = str('description') ?? str('prompt');
  if (description !== null) return description;
  const query = str('query');
  if (query !== null) return query;
  try {
    const json = JSON.stringify(args);
    if (json === undefined || json === '{}' || json === 'null') return toolName;
    return json.length > 120 ? `${json.slice(0, 119)}…` : json;
  } catch {
    return toolName;
  }
}
