import {
  type CreateAgentSessionOptions,
  type CreateAgentSessionResult,
  createAgentSession,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentCommand,
  AgentRunningState,
  AgentState,
  ClearQueueResult,
  CommandData,
  LastAssistantTextResult,
  NewSessionOk,
  NewSessionRequest,
  SessionStatsInfo,
  SetToolsResult,
  SlashCommandInfo,
  ThinkingLevel,
  ToolInfo,
} from '@ice-ai/protocol';
import { toWireAgentMessage } from '../events/wire-message';
import { type ClientAgentEventListener, SessionRegistryEntry } from './session-entry';

/**
 * Agent 命令通道 + 事件总线的核心服务（docs/01 §3.1、§5.5 transport-agnostic 接口）。
 *
 * 为什么需要：pi SDK 只提供单个 AgentSession 对象（方法调用 + 原生事件回调），
 * 没有多会话管理与统一命令分发——直接暴露给 server 会让传输层耦合 SDK 内部结构。
 *
 * 相对 SDK 新增：
 * - 多会话注册表：按 sessionId 寻址、创建/销毁、listVersion 供列表轻量轮询
 * - 统一命令通道：AgentCommand 判别联合分发（protocol 契约即方法面）；
 *   同会话命令 FIFO 串行、跨会话并行，错误不传染队列链；
 *   失败走类型化异常（SessionNotFoundError / PromptRejectedError）
 * - get_commands / get_tools：SDK 分散的能力（扩展命令/模板/技能/工具）聚合成面板数据
 * - late join 时序保证：①订阅 → ②connected → ③快照 → ④增量（docs/01 §5.4）
 *
 * 提供：
 * - create：createAgentSession() 包装（与 pi 共用 ~/.pi 凭据/模型/会话文件），
 *   可选首条消息与显式模型切换（ensure_session 预建不发消息）
 * - send：M1 命令子集分发（prompt/steer/follow_up/abort/clear_queue/
 *   get_state/get_session_stats/get_last_assistant_text/get_commands/get_tools/set_tools）
 * - subscribe：late join 事件订阅（时序同上）
 * - 轻查与生命周期：getRunningState / isRunning / runningSessionIds /
 *   disposeSession / disposeAll
 *
 * M1 不做：idle 回收与 lease（M3）、fork/压缩/模型组命令（M2）、扩展 UI 通道（M2）。
 */

// ---------------------------------------------------------------------------
// 错误类型（server 映射为 protocol 信封 CommandError）
// ---------------------------------------------------------------------------

export class SessionNotFoundError extends Error {
  constructor(readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

/** prompt 输入被拒（如扩展拦截）——区别于运行失败，信封带 code:'prompt_rejected' + accepted:false */
export class PromptRejectedError extends Error {
  constructor(message = 'Prompt rejected') {
    super(message);
    this.name = 'PromptRejectedError';
  }
}

// ---------------------------------------------------------------------------
// 新建会话
// ---------------------------------------------------------------------------

/** 会话工厂签名（默认真实 SDK；测试注入 fake） */
export type CreateSessionFn = (
  options: CreateAgentSessionOptions,
) => Promise<CreateAgentSessionResult>;

export class AgentSessionService {
  private entries = new Map<string, SessionRegistryEntry>();
  /** 每会话命令串行队列尾（FIFO 链） */
  private commandTails = new Map<string, Promise<unknown>>();

  constructor(
    private readonly createSession: CreateSessionFn = createAgentSession,
    /** list 版本号：注册表每次结构性变动 +1（会话列表轻量轮询用） */
    private listVersion = 0,
  ) {}

  // ------------------------------------------------------------------
  // 新建会话（POST /api/agent/new，docs/02 §4.1）
  // ------------------------------------------------------------------

  async create(input: NewSessionRequest): Promise<NewSessionOk> {
    const { cwd, message, images, provider, modelId, toolNames, thinkingLevel } = input;
    const ensureOnly = input.type === 'ensure_session';

    const options: CreateAgentSessionOptions = { cwd };
    if (toolNames !== undefined) options.tools = toolNames;
    if (thinkingLevel !== undefined) options.thinkingLevel = thinkingLevel;
    // 显式模型：不在此解析（需要 ModelRuntime），先按默认建会话再 setModel 校验

    let result: CreateAgentSessionResult;
    try {
      result = await this.createSession(options);
    } catch (error) {
      console.error('[core] createAgentSession failed:', error);
      throw error;
    }
    const { session } = result;

    // 显式指定 provider/modelId：解析并切换（成对约束已由 protocol schema 校验）
    if (provider !== undefined && modelId !== undefined) {
      const model = session.modelRuntime
        .getAvailableSnapshot()
        .find((m) => m.provider === provider && m.id === modelId);
      if (!model) {
        session.dispose();
        throw new Error(`Model not available: ${provider}/${modelId}`);
      }
      await session.setModel(model);
    }

    const entry = new SessionRegistryEntry(session);
    this.entries.set(entry.sessionId, entry);
    this.listVersion += 1;

    // ensure_session：只建 runtime 不发首条消息（供客户端预查命令/工具）
    if (!ensureOnly && message !== undefined) {
      try {
        await this.send(entry.sessionId, { type: 'prompt', message, images });
      } catch (error) {
        // 首条消息被拒/失败：会话保留（可重试），错误上抛给调用方出信封
        if (!(error instanceof PromptRejectedError)) throw error;
      }
    }

    const model = session.model;
    return {
      success: true,
      data: null,
      sessionId: entry.sessionId,
      model: model ? { provider: model.provider, modelId: model.id } : null,
      thinkingLevel: session.thinkingLevel as ThinkingLevel,
    };
  }

  // ------------------------------------------------------------------
  // 命令分发（POST /api/agent/:id，docs/02 §4）
  // ------------------------------------------------------------------

  /** 派发命令；同会话命令串行，返回值即信封 data 字段 */
  async send<T extends AgentCommand['type']>(
    sessionId: string,
    command: Extract<AgentCommand, { type: T }>,
  ): Promise<CommandData<T>> {
    const entry = this.requireEntry(sessionId);
    const run = this.commandTails.get(sessionId) ?? Promise.resolve();
    const task = run.then(
      () => this.dispatchCommand(entry, command),
      () => this.dispatchCommand(entry, command),
    );
    this.commandTails.set(
      sessionId,
      task.catch(() => {
        // 队列链不断：错误由本次调用方接住
      }),
    );
    return task as Promise<CommandData<T>>;
  }

  private async dispatchCommand(
    entry: SessionRegistryEntry,
    command: AgentCommand,
  ): Promise<unknown> {
    const { session } = entry;
    switch (command.type) {
      case 'prompt': {
        let accepted = true;
        entry.markPromptDispatched();
        try {
          await session.prompt(command.message, {
            images: command.images,
            streamingBehavior: command.streamingBehavior,
            preflightResult: (ok) => {
              accepted = ok;
            },
          });
        } catch (error) {
          entry.clearPromptPending();
          throw error;
        }
        if (!accepted) {
          entry.clearPromptPending();
          throw new PromptRejectedError();
        }
        return null; // 完成信号走事件流：agent_settled
      }
      case 'steer':
      case 'follow_up': {
        entry.markPromptDispatched();
        try {
          if (command.type === 'steer') await session.steer(command.message, command.images);
          else await session.followUp(command.message, command.images);
        } catch (error) {
          entry.clearPromptPending();
          throw error;
        }
        return null;
      }
      case 'abort':
        await session.abort();
        return null;
      case 'clear_queue': {
        const q = session.clearQueue();
        const result: ClearQueueResult = { steering: [...q.steering], followUp: [...q.followUp] };
        return result;
      }
      case 'get_state':
        return this.getState(entry);
      case 'get_session_stats': {
        const stats = session.getSessionStats();
        const info: SessionStatsInfo = {
          ...stats,
          contextUsage: stats.contextUsage,
          sessionName: session.sessionName ?? undefined,
        };
        return info;
      }
      case 'get_last_assistant_text': {
        const result: LastAssistantTextResult = { text: session.getLastAssistantText() ?? null };
        return result;
      }
      case 'get_commands': {
        const commands: SlashCommandInfo[] = [];
        for (const c of session.extensionRunner.getRegisteredCommands()) {
          commands.push({
            name: c.invocationName,
            description: c.description,
            source: 'extension',
            sourceInfo: c.sourceInfo,
          });
        }
        for (const t of session.promptTemplates) {
          commands.push({
            name: t.name,
            description: t.description,
            source: 'prompt',
            sourceInfo: t.sourceInfo,
          });
        }
        for (const s of session.resourceLoader.getSkills().skills) {
          commands.push({
            name: `skill:${s.name}`,
            description: s.description,
            source: 'skill',
            sourceInfo: s.sourceInfo,
          });
        }
        return { commands };
      }
      case 'get_tools': {
        const active = new Set(session.agent.state.tools.map((t) => t.name));
        const tools: ToolInfo[] = session.getAllTools().map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
          promptGuidelines: t.promptGuidelines,
          sourceInfo: t.sourceInfo,
          active: active.has(t.name),
        }));
        return tools;
      }
      case 'set_tools': {
        // M1：注册表内会话一律走 switch 路径（下一轮生效），返回 null。
        // 冷会话重建 runtime 的 {sessionId, recreated} 路径由 server 层实现（M2）。
        session.setActiveToolsByName(command.toolNames);
        const result: SetToolsResult = null;
        return result;
      }
      default: {
        // 穷尽保护：protocol 新增命令而 core 未实现时编译期即可发现
        const exhaustive: never = command;
        throw new Error(`Unsupported command: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  /** get_state 装配（对齐 docs/02 §3.4；queued/isPromptRunning 来自 Entry 流内跟踪） */
  private getState(entry: SessionRegistryEntry): AgentState {
    const { session } = entry;
    const cu = session.getContextUsage();
    const model = session.model;
    return {
      sessionId: session.sessionId,
      sessionFile: session.sessionFile ?? undefined,
      isStreaming: session.isStreaming,
      isPromptRunning: entry.isPromptRunning,
      isBashRunning: session.isBashRunning,
      isCompacting: session.isCompacting,
      autoCompactionEnabled: session.autoCompactionEnabled,
      autoRetryEnabled: session.autoRetryEnabled,
      model: model ? { provider: model.provider, modelId: model.id } : null,
      messageCount: session.messages.length,
      pendingMessageCount: session.pendingMessageCount,
      queuedMessages: entry.queuedMessages,
      contextUsage: cu
        ? {
            tokens: cu.tokens ?? null,
            contextWindow: cu.contextWindow,
            percent: cu.percent ?? null,
          }
        : null,
      systemPrompt: session.systemPrompt,
      thinkingLevel: session.thinkingLevel as ThinkingLevel,
      extensionStatuses: [], // M2 扩展 UI 通道接入后填充
      extensionWidgets: [], // 同上
    };
  }

  // ------------------------------------------------------------------
  // 事件订阅（late join，docs/01 §5.4 时序 ①②③④）
  // ------------------------------------------------------------------

  /**
   * 订阅事件流。建流即返回退订函数；顺序保证：
   * ①先注册 listener → ②connected → ③快照 message_start（有半截消息时）
   * → ④此后增量。②③与④之间无窗口（同步分发），seq 全程单调。
   */
  subscribe(sessionId: string, listener: ClientAgentEventListener): () => void {
    const entry = this.requireEntry(sessionId);
    const unsubscribe = entry.subscribe(listener);
    entry.emitServiceEvent({
      type: 'connected',
      sessionId,
      isStreaming: entry.isStreaming,
    });
    const inFlight = entry.inFlightMessage;
    if (inFlight !== null) {
      entry.emitServiceEvent({ type: 'message_start', message: toWireAgentMessage(inFlight) });
    }
    return unsubscribe;
  }

  // ------------------------------------------------------------------
  // 轻查 / 生命周期
  // ------------------------------------------------------------------

  /** GET /api/agent/:id —— 未运行不报错（docs/02 §6.1） */
  getRunningState(sessionId: string): AgentRunningState {
    const entry = this.entries.get(sessionId);
    if (entry === undefined) return { running: false };
    return { running: true, state: this.getState(entry) };
  }

  isRunning(sessionId: string): boolean {
    return this.entries.has(sessionId);
  }

  runningSessionIds(): string[] {
    return [...this.entries.keys()];
  }

  get sessionListVersion(): number {
    return this.listVersion;
  }

  /** 关闭单个会话（idle 回收 / server 关停时调用；M1 仅显式调用） */
  disposeSession(
    sessionId: string,
    reason: 'idle' | 'server_shutdown' | 'error' = 'server_shutdown',
  ): void {
    const entry = this.entries.get(sessionId);
    if (entry === undefined) return;
    this.entries.delete(sessionId);
    this.commandTails.delete(sessionId);
    this.listVersion += 1;
    entry.dispose(reason);
  }

  /** 关停全部（进程退出路径） */
  disposeAll(reason: 'server_shutdown' | 'error' = 'server_shutdown'): void {
    for (const id of [...this.entries.keys()]) {
      this.disposeSession(id, reason);
    }
  }

  private requireEntry(sessionId: string): SessionRegistryEntry {
    const entry = this.entries.get(sessionId);
    if (entry === undefined || entry.isDisposed) {
      throw new SessionNotFoundError(sessionId);
    }
    return entry;
  }
}
