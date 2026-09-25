import { stat } from 'node:fs/promises';
import {
  type AgentSession,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  type ExtensionCommandContextActions,
  getAgentDir,
  type SessionManager,
  SessionManager as SessionManagerClass,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentCommand,
  AgentRunningState,
  AgentState,
  BranchResult,
  ClearQueueResult,
  CommandData,
  ExtensionUiResponse,
  LastAssistantTextResult,
  NavigateTreeResult,
  NewSessionOk,
  NewSessionRequest,
  SessionInfo,
  SessionReplacedReason,
  SetToolsResult,
  SlashCommandInfo,
  ThinkingLevel,
  ToolInfo,
  ToolPreset,
} from '@ice-ai/protocol';
import { toolNamesForPreset } from '@ice-ai/protocol';
import { toWireAgentMessage } from '../events/wire-message';
import { SessionRegistryEntry, type WireAgentEventListener } from './session-entry';
import {
  clearedToolSelection,
  readSessionToolSelection,
  TOOL_SELECTION_CUSTOM_TYPE,
  writeToolSelection,
} from './session-tool-selection';

/**
 * Agent 命令通道 + 事件总线的核心服务（docs/01 §3.1、§5.5 transport-agnostic 接口）。
 *
 * 为什么需要：pi SDK 只提供单会话的 runtime（方法调用 + 原生事件回调），
 * 没有多会话管理与统一命令分发——直接暴露给 server 会让传输层耦合 SDK 内部结构。
 *
 * 相对 SDK 新增：
 * - 多会话注册表：按 sessionId 寻址、创建/销毁/re-key、registryVersion 供列表轻量轮询
 * - 统一命令通道：AgentCommand 判别联合分发（protocol 契约即方法面）；
 *   同会话命令 FIFO 串行、跨会话并行，错误不传染队列链；
 *   失败走类型化异常（SessionNotFoundError / PromptRejectedError / UserInputError）
 * - get_commands / get_tools：SDK 分散的能力（扩展命令/模板/技能/工具）聚合成面板数据
 * - fork/clone 的**破坏性原地替换**收口：runtime 换完会话后重新登记注册表键，
 *   并在旧流上下发 `session_replaced`（docs/01 §8-1：旧键必须立即销毁）
 * - 冷会话恢复（ADR-0013）：`resume()` 从 .jsonl 重建 runtime 并登记
 * - 工具预设持久化 + 纯聊天边界（G2-9/G2-10）：预设写进会话自定义条目，
 *   `none` 触发 chat-only（精简系统提示词 + 关扩展/技能），故需要整 runtime 重建
 * - 扩展 UI 桥接线（ADR-0012）：`bindExtensions({uiContext, mode:'rpc'})`
 * - late join 时序保证：①订阅 → ②connected → ③快照 → ④增量（docs/01 §5.4）
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

/**
 * 客户端输入错误（可修正后重试，如模型不可用 / 空白会话名）——
 * server 映射 400（区别于运行失败的 500，docs/04 §4.1）
 */
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserInputError';
  }
}

/** 会话本轮正在跑，无法做需要重建 runtime 的操作——server 映射 409 */
export class SessionBusyError extends Error {
  constructor(message = 'Session is busy') {
    super(message);
    this.name = 'SessionBusyError';
  }
}

// ---------------------------------------------------------------------------
// runtime 工厂（默认真实 SDK；测试注入 fake）
// ---------------------------------------------------------------------------

export interface CreateRuntimeInput {
  cwd: string;
  /** 既有会话文件（恢复/重建路径）；缺省 = 新建 */
  sessionFile?: string;
  /** 显式模型（已解析好的 SDK Model） */
  model?: AgentSession['model'];
  thinkingLevel?: ThinkingLevel;
  /** 工具名 allowlist（显式名单或预设展开结果） */
  tools?: string[];
  /**
   * 纯聊天（G2-9 边界）：关掉扩展/技能/模板/主题（没有工具可执行，加载了也用不上）。
   * 系统提示词不特殊处理，交给 pi 按默认结构化段落组装（ADR-0015）。
   * 由 `set_tools {preset:'none'}` 或 `agent/new {toolNames:[]}` 触发。
   */
  chatOnly?: boolean;
}

export type CreateRuntimeFn = (input: CreateRuntimeInput) => Promise<AgentSessionRuntime>;

export interface AgentSessionServiceOptions {
  /** runtime 工厂（缺省走真实 SDK；测试注入 fake runtime） */
  createRuntime?: CreateRuntimeFn;
  /** `` ~/.pi/agent `` 覆盖（测试用） */
  agentDir?: string;
  /** 扩展 UI 宿主兜底超时（毫秒） */
  uiTimeoutMs?: number;
  /**
   * 按 id 定位会话文件（恢复冷会话用）。缺省实现遍历 `SessionManager.listAll()`；
   * server 可注入 `SessionReadService` 的索引以避免重复扫描。
   */
  findSessionFile?: (sessionId: string) => Promise<{ path: string; cwd: string } | null>;
  /**
   * 打开既有会话文件（恢复时读工具选择 / fork_branch 复制分支）。
   * 缺省 = SDK 的 `SessionManager.open`；测试注入 fake 以避开真实文件系统。
   */
  openSessionManager?: (path: string, sessionDir?: string) => SessionManager;
}

export class AgentSessionService {
  private entries = new Map<string, SessionRegistryEntry>();
  /** 每会话命令串行队列尾（FIFO 链） */
  private commandTails = new Map<string, Promise<unknown>>();
  private readonly createRuntime: CreateRuntimeFn;
  private readonly findSessionFile: (
    sessionId: string,
  ) => Promise<{ path: string; cwd: string } | null>;
  private readonly uiTimeoutMs: number | undefined;
  private readonly openSessionManager: (path: string, sessionDir?: string) => SessionManager;
  /**
   * 会话文件在**上次确认时**的 `size:mtime`（外部写入探测基线，ADR-0013b）。
   * 只在登记时与每次探测后更新——我们自己写盘也会改变它，所以基线是
   * "上次我们看过的样子"而不是"我们最后写的样子"。
   */
  private readonly fileBaselines = new Map<string, string>();
  /**
   * 运行时注册表版本号：每次结构性变动（create/disposeSession/re-key）+1。
   * ⚠️ 只含注册表变动；磁盘扫描侧的变化（其他进程写入会话、会话首条 assistant 消息
   * 落盘、改名/fork）不在此列，客户端不能只靠它决定要不要全量刷新列表
   * （详见 protocol rest/sessions.ts 的 SessionListResponseSchema 注释）。
   */
  #registryVersion = 0;

  constructor(options: AgentSessionServiceOptions = {}) {
    this.createRuntime = options.createRuntime ?? defaultCreateRuntime(options.agentDir);
    this.findSessionFile =
      options.findSessionFile ?? ((id) => findSessionFileViaSessionManager(id, options.agentDir));
    this.uiTimeoutMs = options.uiTimeoutMs;
    this.openSessionManager =
      options.openSessionManager ?? ((path, dir) => SessionManagerClass.open(path, dir));
  }

  // ------------------------------------------------------------------
  // 新建 / 恢复会话（POST /api/agent/new、POST /api/agent/:id/resume）
  // ------------------------------------------------------------------

  async create(input: NewSessionRequest): Promise<NewSessionOk> {
    const { cwd, message, images, provider, modelId, toolNames, thinkingLevel } = input;
    const ensureOnly = input.type === 'ensure_session';

    // cwd 前置校验：SDK 的 createAgentSession 对不存在的 cwd 不报错、照样建会话，
    // 后果是之后每次 read/bash/edit 都在会话里失败——用户看到「agent 莫名其妙报错」
    // 而不是「路径错了」（docs/02 §4.1 实证，2026-09-22）
    if (!(await isDirectory(cwd))) {
      throw new UserInputError(`Working directory does not exist: ${cwd}`);
    }

    // 显式模型：在 runtime 建好之后按 provider/modelId 解析（需要 ModelRuntime）
    const runtime = await this.createRuntime({
      cwd,
      thinkingLevel,
      tools: toolNames,
      chatOnly: toolNames !== undefined && toolNames.length === 0,
    });

    const entry = await this.register(makeEntry(runtime, this.uiTimeoutMs));
    const { session } = entry;

    if (provider !== undefined && modelId !== undefined) {
      const model = session.modelRuntime
        .getAvailableSnapshot()
        .find((m) => m.provider === provider && m.id === modelId);
      if (model === undefined) {
        this.disposeSession(entry.sessionId, 'error');
        throw new UserInputError(`Model not available: ${provider}/${modelId}`);
      }
      await session.setModel(model);
    }

    // 显式工具名单/预设：钉住并持久化（否则下次恢复又回到 settings.json 默认）
    if (toolNames !== undefined) {
      this.persistToolSelection(entry, toolNames);
    }

    // ensure_session：只建 runtime 不发首条消息（供客户端预查命令/工具）
    if (!ensureOnly && message !== undefined) {
      try {
        await this.send(entry.sessionId, { type: 'prompt', message, images });
      } catch (error) {
        // 首条消息被拒/失败：会话保留（可重试），错误上抛给调用方出信封
        if (!(error instanceof PromptRejectedError)) throw error;
      }
    }

    return this.okEnvelope(entry);
  }

  /**
   * 恢复冷会话（ADR-0013）：从 `.jsonl` 重建 runtime 并登记进注册表。
   * 已在注册表内直接返回现有会话（幂等，避免两个标签页同时点开时重复建 runtime）。
   */
  async resume(sessionId: string): Promise<NewSessionOk> {
    const existing = this.entries.get(sessionId);
    if (existing !== undefined && !existing.isDisposed) {
      return this.okEnvelope(existing);
    }
    const hit = await this.findSessionFile(sessionId);
    if (hit === null) throw new SessionNotFoundError(sessionId);

    // 该会话自己钉过的工具选择要一并恢复（G2-9 持久化）
    const manager = this.openSessionManager(hit.path);
    const pinned = readSessionToolSelection(manager.getEntries());
    const tools = pinned === undefined ? undefined : pinned;

    const runtime = await this.createRuntime({
      cwd: hit.cwd,
      sessionFile: hit.path,
      tools,
      chatOnly: pinned !== undefined && pinned.length === 0,
    });
    const entry = await this.register(makeEntry(runtime, this.uiTimeoutMs));
    return this.okEnvelope(entry);
  }

  private okEnvelope(entry: SessionRegistryEntry): NewSessionOk {
    const model = entry.session.model;
    return {
      success: true,
      data: null,
      sessionId: entry.sessionId,
      model: model ? { provider: model.provider, modelId: model.id } : null,
      thinkingLevel: entry.session.thinkingLevel as ThinkingLevel,
    };
  }

  /** 登记 Entry 并首次绑定扩展；返回已登记的 Entry */
  private async register(entry: SessionRegistryEntry): Promise<SessionRegistryEntry> {
    this.entries.set(entry.sessionId, entry);
    this.#registryVersion += 1;
    await this.rememberFileBaseline(entry);
    await this.bindExtensions(entry);
    return entry;
  }

  private async rememberFileBaseline(entry: SessionRegistryEntry): Promise<void> {
    const file = entry.session.sessionFile;
    if (file === undefined) {
      this.fileBaselines.delete(entry.sessionId);
      return;
    }
    const fingerprint = await statFingerprint(file);
    if (fingerprint !== null) this.fileBaselines.set(entry.sessionId, fingerprint);
  }

  // ------------------------------------------------------------------
  // 外部写入探测（G2-5 / ADR-0013b）
  // ------------------------------------------------------------------

  /**
   * 探测会话文件是否被**别的进程**改过（终端 pi、第二个 server 实例），
   * 落后就丢掉内存 runtime、从磁盘重建。
   *
   * 只在**全量读**（详情 / `?force=1`）时调用，且 run 期间一律跳过——
   * 换掉正在跑的 runtime 会丢流（事件订阅指向死对象、半截消息消失），
   * 那比读到一点陈旧内容严重得多（ADR-0013b 的取舍）。
   *
   * @returns 是否重建了 runtime（true 时调用方应让客户端重拉历史）
   */
  async probeExternalWrite(sessionId: string): Promise<boolean> {
    const entry = this.entries.get(sessionId);
    if (entry === undefined || entry.isDisposed) return false;
    if (entry.isStreaming || entry.isPromptRunning) return false;

    const file = entry.session.sessionFile;
    if (file === undefined) return false;
    const current = await statFingerprint(file);
    if (current === null) return false;
    const baseline = this.fileBaselines.get(sessionId);
    if (baseline === undefined || baseline === current) {
      this.fileBaselines.set(sessionId, current);
      return false;
    }

    // 落后：从磁盘重建（同一会话文件、同一会话 id），订阅者不断线
    const runtime = await this.createRuntime({
      cwd: entry.session.sessionManager.getCwd(),
      sessionFile: file,
      tools: readSessionToolSelection(entry.session.sessionManager.getEntries()),
    });
    await entry.replaceRuntime(runtime);
    await this.bindExtensions(entry);
    this.fileBaselines.set(sessionId, current);
    console.error(`[core] external write detected for ${sessionId}; runtime rebuilt from disk`);
    return true;
  }

  /**
   * 内存会话（尚未落盘）的列表项：`ensure_session` 建的会话在首条条目落盘前
   * 不会出现在目录扫描里，客户端却必须看得见（否则刚建的标签页立刻消失）。
   */
  transientInfos(): SessionInfo[] {
    const now = new Date().toISOString();
    return [...this.entries.values()]
      .filter((entry) => !entry.isDisposed && entry.session.sessionFile === undefined)
      .map((entry) => {
        const model = entry.session.model;
        void model;
        return {
          path: '',
          id: entry.sessionId,
          cwd: entry.session.sessionManager.getCwd(),
          created: now,
          modified: now,
          messageCount: entry.session.messages.length,
          firstMessage: '',
          transient: true,
        } satisfies SessionInfo;
      });
  }

  /** 绑定扩展（含扩展 UI 上下文与命令上下文动作） */
  private async bindExtensions(entry: SessionRegistryEntry): Promise<void> {
    await entry.session.bindExtensions({
      uiContext: entry.uiContext,
      mode: 'rpc',
      commandContextActions: this.commandContextActions(entry),
      shutdownHandler: () => {
        // 扩展请求关停：只关这一个会话（server 关停走 disposeAll）
        this.disposeSession(entry.sessionId, 'server_shutdown');
      },
      onError: (error) => {
        console.error('[core] extension error:', error.event, error.error);
      },
    });
  }

  /**
   * 扩展可调用的会话操作（bindExtensions 的 commandContextActions）。
   * 全部走本服务自己的替换收口，这样注册表键与 session_replaced 事件一致。
   */
  private commandContextActions(entry: SessionRegistryEntry): ExtensionCommandContextActions {
    return {
      waitForIdle: () => entry.session.waitForIdle(),
      newSession: async (options) => {
        await entry.runtime.newSession(options);
        await this.afterReplacement(entry, 'new');
        return { cancelled: false };
      },
      fork: async (entryId, options) => {
        await entry.runtime.fork(entryId, options);
        await this.afterReplacement(entry, 'fork');
        return { cancelled: false };
      },
      navigateTree: async (targetId, options) => {
        const result = await entry.session.navigateTree(targetId, options);
        return { cancelled: result.cancelled };
      },
      switchSession: async (sessionPath, options) => {
        const result = await entry.runtime.switchSession(sessionPath, options);
        if (!result.cancelled) await this.afterReplacement(entry, 'resume');
        return result;
      },
      reload: async () => {
        await this.reloadSession(entry);
      },
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
    // 队列尾恒为 fulfilled（入队时已 catch）：前一条命令失败不阻塞后续命令
    const task = run.then(() => this.dispatchCommand(entry, command));
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
          if (!accepted) throw new PromptRejectedError();
          return null; // 完成信号走事件流：agent_settled；此处只销账 isPromptRunning
        } finally {
          // 无条件销账：SDK 的 prompt() 有三条提前 return 路径（扩展命令 / input
          // handler hit / streaming 入队）不进 _runAgentPrompt，永远不发 agent_settled；
          // 而正常路径的 prompt() 在 _runAgentPrompt 的 finally 之后才 resolve
          // （agent-session.js:776/784/949），所以此处只会晚不会早。
          entry.clearPromptPending();
        }
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
        return {
          ...stats,
          sessionName: session.sessionName ?? undefined,
          // 冷会话（本进程没跑过）不带 perf：0 与「未测量」不是一回事
          perf: entry.hasPerf ? entry.perf : undefined,
        };
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
      case 'set_tools':
        return this.setTools(entry, command);
      case 'set_model': {
        const model = session.modelRuntime
          .getAvailableSnapshot()
          .find((m) => m.provider === command.provider && m.id === command.modelId);
        if (model === undefined) {
          throw new UserInputError(`Model not available: ${command.provider}/${command.modelId}`);
        }
        await session.setModel(model);
        return { provider: model.provider, modelId: model.id };
      }
      case 'set_thinking_level':
        session.setThinkingLevel(command.level);
        return null;
      case 'compact': {
        const result = await session.compact(command.customInstructions);
        return result;
      }
      case 'abort_compaction':
        session.abortCompaction();
        return null;
      case 'set_auto_compaction':
        session.setAutoCompactionEnabled(command.enabled);
        return null;
      case 'set_auto_retry':
        session.setAutoRetryEnabled(command.enabled);
        return null;
      case 'fork': {
        this.assertNotBusy(entry, 'fork');
        await entry.runtime.fork(command.entryId, { position: 'before' });
        return await this.afterReplacement(entry, 'fork');
      }
      case 'fork_branch': {
        this.assertNotBusy(entry, 'fork_branch');
        return await this.forkBranch(entry, command.entryId);
      }
      case 'clone': {
        this.assertNotBusy(entry, 'clone');
        const leafId = command.leafId ?? session.sessionManager.getLeafId();
        if (leafId === null || leafId === undefined) {
          throw new UserInputError('Cannot clone session: no current entry selected');
        }
        await entry.runtime.fork(leafId, { position: 'at' });
        return await this.afterReplacement(entry, 'clone');
      }
      case 'navigate_tree': {
        const result = await session.navigateTree(command.targetId, {
          summarize: command.summarize,
          customInstructions: command.customInstructions,
          replaceInstructions: command.replaceInstructions,
          label: command.label,
        });
        const out: NavigateTreeResult = { cancelled: result.cancelled };
        if (result.editorText !== undefined) out.editorText = result.editorText;
        return out;
      }
      case 'set_session_name': {
        const name = command.name.trim();
        if (name === '') throw new UserInputError('Session name cannot be empty');
        session.setSessionName(name);
        return null;
      }
      case 'reload': {
        await this.reloadSession(entry);
        return null;
      }
      case 'extension_ui_response': {
        entry.respondToExtensionUi(toUiResponse(command));
        return null;
      }
      default: {
        // 穷尽保护：protocol 新增命令而 core 未实现时编译期即可发现
        const exhaustive: never = command;
        throw new Error(`Unsupported command: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  // ------------------------------------------------------------------
  // set_tools / 工具预设（G2-9）
  // ------------------------------------------------------------------

  /**
   * 两形态 + 两路径：
   * - `toolNames`（含空数组 = 纯聊天）/ `preset` 展开后的名单
   * - **纯聊天边界需要整 runtime 重建**（resource loader 要换：关扩展/技能、换系统提示词），
   *   其余预设只需 `setActiveToolsByName` 即时生效
   * - `configured` 是「撤销钉住」：追加一条 cleared 条目并重建 runtime 回到默认
   */
  private async setTools(
    entry: SessionRegistryEntry,
    command: Extract<AgentCommand, { type: 'set_tools' }>,
  ): Promise<SetToolsResult> {
    const hasNames = command.toolNames !== undefined;
    const hasPreset = command.preset !== undefined;
    if (hasNames === hasPreset) {
      throw new UserInputError('set_tools requires exactly one of toolNames or preset');
    }

    const requestedNames = hasNames
      ? command.toolNames
      : toolNamesForPreset(command.preset as ToolPreset);
    // `configured` = 不下发覆盖：撤销钉住并回到 settings.json 的 defaultTools
    const chatOnly = requestedNames !== undefined && requestedNames.length === 0;

    if (requestedNames === undefined) {
      // 撤销钉住：只在会话确实钉过时才需要重建
      const pinned = readSessionToolSelection(entry.session.sessionManager.getEntries());
      if (pinned === undefined) return null;
      this.assertNotBusy(entry, 'set_tools');
      clearedToolSelection(entry.session.sessionManager);
      await this.rebuildRuntime(entry, { preset: 'configured' });
      return { sessionId: entry.sessionId, recreated: true };
    }

    if (chatOnly) {
      // 纯聊天边界：runtime 重建（resource loader 级别变化）
      this.assertNotBusy(entry, 'set_tools');
      this.persistToolSelection(entry, requestedNames);
      await this.rebuildRuntime(entry, { preset: 'none' });
      return { sessionId: entry.sessionId, recreated: true };
    }

    entry.session.setActiveToolsByName(requestedNames);
    this.persistToolSelection(entry, requestedNames);
    return null; // 运行中会话即时生效，无需重建
  }

  /** 把当前工具选择写进会话自定义条目（恢复时读回，G2-9） */
  private persistToolSelection(entry: SessionRegistryEntry, toolNames: readonly string[]): void {
    writeToolSelection(entry.session.sessionManager, toolNames);
  }

  /** 用当前会话文件重建 runtime（同一会话 id），并可选换预设/纯聊天 */
  private async rebuildRuntime(
    entry: SessionRegistryEntry,
    options: { preset: ToolPreset },
  ): Promise<void> {
    const sessionFile = entry.session.sessionFile;
    if (sessionFile === undefined) {
      throw new UserInputError('Session is not persisted yet; cannot rebuild its runtime');
    }
    const toolNames = toolNamesForPreset(options.preset);
    const runtime = await this.createRuntime({
      cwd: entry.session.sessionManager.getCwd(),
      sessionFile,
      tools: toolNames,
      chatOnly: toolNames !== undefined && toolNames.length === 0,
    });
    await entry.replaceRuntime(runtime);
    await this.bindExtensions(entry);
  }

  private async reloadSession(entry: SessionRegistryEntry): Promise<void> {
    await entry.session.reload();
    await this.bindExtensions(entry);
  }

  // ------------------------------------------------------------------
  // runtime 替换收口（fork / clone / newSession / switchSession）
  // ------------------------------------------------------------------

  /**
   * runtime 已经换完会话之后的收口：重新登记注册表键 + 通知订阅者。
   *
   * 为什么必须立即改键（docs/01 §8-1）：fork 是**原地替换**，旧 id 在新 runtime 里
   * 已不存在——留着旧键会让 `GET /api/agent/:oldId` 返回一个死会话。
   */
  private async afterReplacement(
    entry: SessionRegistryEntry,
    reason: SessionReplacedReason,
  ): Promise<BranchResult> {
    const previousId = [...this.entries.entries()].find(([, e]) => e === entry)?.[0];
    const newSessionId = entry.sessionId;
    entry.emitSessionReplaced(newSessionId, reason);
    if (previousId !== undefined && previousId !== newSessionId) {
      // 队列尾跟着搬（同一会话的后续命令不能落到旧键上）
      const tail = this.commandTails.get(previousId);
      const baseline = this.fileBaselines.get(previousId);
      this.entries.delete(previousId);
      this.commandTails.delete(previousId);
      this.fileBaselines.delete(previousId);
      this.entries.set(newSessionId, entry);
      if (tail !== undefined) this.commandTails.set(newSessionId, tail);
      if (baseline !== undefined) this.fileBaselines.set(newSessionId, baseline);
      this.#registryVersion += 1;
    }
    // 换会话后扩展上下文指向新会话（bindExtensions 会重建 uiContext 与动作）
    await this.bindExtensions(entry);
    return { cancelled: false, newSessionId };
  }

  /**
   * `fork_branch`：在指定条目上分叉出一个**新会话文件**，当前会话**不变**
   * （与 `fork` 的原地替换相对；docs/02 §4 分支组）。SDK 的 runtime 只有原地
   * `fork`，所以这里走 `SessionManager.createBranchedSession` + 独立 runtime。
   */
  private async forkBranch(entry: SessionRegistryEntry, entryId: string): Promise<BranchResult> {
    const manager = entry.session.sessionManager;
    if (!manager.isPersisted()) {
      throw new UserInputError('Cannot fork an unpersisted session');
    }
    if (manager.getEntry(entryId) === undefined) {
      throw new UserInputError(`Invalid entry ID for forking: ${entryId}`);
    }
    const source = entry.session.sessionFile;
    if (source === undefined) throw new UserInputError('Session is missing a session file');

    const sourceManager = this.openSessionManager(source, manager.getSessionDir());
    const forkedPath = sourceManager.createBranchedSession(entryId);
    if (forkedPath === undefined) throw new UserInputError('Failed to create forked session');

    const forkedManager = this.openSessionManager(forkedPath, manager.getSessionDir());
    const forkedId = forkedManager.getSessionId();
    // 独立 runtime，登记进注册表但**不**动当前 Entry
    const runtime = await this.createRuntime({
      cwd: forkedManager.getCwd(),
      sessionFile: forkedPath,
    });
    const forkedEntry = await this.register(makeEntry(runtime, this.uiTimeoutMs));
    if (forkedEntry.sessionId !== forkedId) {
      // 理论不可达（同一文件里读出的 id 必须一致）；真出现说明 SDK 语义变了
      this.disposeSession(forkedEntry.sessionId, 'error');
      throw new UserInputError('Forked session id mismatch');
    }
    return { cancelled: false, newSessionId: forkedId };
  }

  private assertNotBusy(entry: SessionRegistryEntry, action: string): void {
    if (entry.isStreaming || entry.isPromptRunning) {
      throw new SessionBusyError(`Cannot ${action} while the session is running`);
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
      isCompacting: session.isCompacting,
      autoCompactionEnabled: session.autoCompactionEnabled,
      autoRetryEnabled: session.autoRetryEnabled,
      model: model ? { provider: model.provider, modelId: model.id } : null,
      messageCount: session.messages.length,
      pendingMessageCount: session.pendingMessageCount,
      queuedMessages: entry.queuedMessages,
      // 快照水位线：与上方各字段同块同步读取，客户端丢弃 SSE 流中
      // seq ≤ lastSeq 的事件（docs/01 §5.4）
      lastSeq: entry.lastSeq,
      contextUsage: cu
        ? {
            tokens: cu.tokens ?? null,
            contextWindow: cu.contextWindow,
            percent: cu.percent ?? null,
          }
        : null,
      systemPrompt: session.systemPrompt,
      thinkingLevel: session.thinkingLevel as ThinkingLevel,
      extensionStatuses: entry.ui.statusItems,
      extensionWidgets: entry.ui.widgetItems,
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
  subscribe(sessionId: string, listener: WireAgentEventListener): () => void {
    const entry = this.requireEntry(sessionId);
    const unsubscribe = entry.subscribe(listener);
    entry.emitEvent({
      type: 'connected',
      sessionId,
      isStreaming: entry.isStreaming,
      // 快照水位线：与下方 inFlightMessage 同块同步读取（本函数无 await，
      // 单线程 + 同步 dispatch 保证「在快照里 ⇒ seq ≤ lastSeq」不变式）。
      // 客户端据此丢弃与快照重复的事件
      lastSeq: entry.lastSeq,
    });
    const inFlight = entry.inFlightMessage;
    if (inFlight !== null) {
      // 服务端**合成**的 message_start（不是 SDK 事件转发），补 late join 丢掉的头部：
      // 真实那次 message_start 发生在订阅之前，而 wire 上的 message_update 只有
      // 增量（累积 message 已剔、partial 已剥），没有 open 的 message_start 客户端
      // 就接不上后续 delta，只能等到 *=end 才拿到全量。
      // 载荷 inFlightMessage = SDK message_update.message 的累积快照，所以这里
      // message **非空**（SDK 真实那次是空壳）——客户端应整体替换，不能假设为空。
      // 走 emitEvent 是为了复用同一 seq 计数器（序号在 connected 之后单调）。
      // 注意：工具执行不重放（isStreaming 为 true 而 inFlight 为 null 是正常态）。
      entry.emitEvent({ type: 'message_start', message: toWireAgentMessage(inFlight) });
    }
    return unsubscribe;
  }

  // ------------------------------------------------------------------
  // 轻查 / 生命周期
  // ------------------------------------------------------------------

  /** GET /api/agent/:id —— 未运行不报错（docs/02 §6.1） */
  getRunningState(sessionId: string): AgentRunningState {
    const entry = this.entries.get(sessionId);
    if (entry === undefined || entry.isDisposed) return { running: false };
    return { running: true, state: this.getState(entry) };
  }

  isRunning(sessionId: string): boolean {
    const entry = this.entries.get(sessionId);
    return entry !== undefined && !entry.isDisposed;
  }

  runningSessionIds(): string[] {
    return [...this.entries.keys()];
  }

  get registryVersion(): number {
    return this.#registryVersion;
  }

  /** 关闭单个会话（idle 回收 / server 关停时调用） */
  disposeSession(
    sessionId: string,
    reason: 'idle' | 'server_shutdown' | 'error' = 'server_shutdown',
  ): void {
    const entry = this.entries.get(sessionId);
    if (entry === undefined) return;
    this.entries.delete(sessionId);
    this.commandTails.delete(sessionId);
    this.fileBaselines.delete(sessionId);
    this.#registryVersion += 1;
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

// ---------------------------------------------------------------------------
// 默认 runtime 工厂（真实 SDK）
// ---------------------------------------------------------------------------

/** 文件指纹（size:mtime）；文件不在/读不到返回 null */
async function statFingerprint(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    return `${info.size}:${Math.floor(info.mtimeMs)}`;
  } catch {
    return null;
  }
}

function makeEntry(
  runtime: AgentSessionRuntime,
  uiTimeoutMs: number | undefined,
): SessionRegistryEntry {
  const entry = new SessionRegistryEntry(runtime, { uiTimeoutMs });
  return entry;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** 按 id 定位会话文件（缺省实现：遍历 SDK 的全量列表） */
async function findSessionFileViaSessionManager(
  sessionId: string,
  agentDir: string | undefined,
): Promise<{ path: string; cwd: string } | null> {
  // agentDir 只影响配置目录；会话目录由 SDK 默认规则解析
  void agentDir;
  const all = await SessionManagerClass.listAll();
  const hit = all.find((info) => info.id === sessionId);
  return hit === undefined ? null : { path: hit.path, cwd: hit.cwd };
}

/**
 * 真实 runtime 工厂：走 `createAgentSessionRuntime`（不是 `createAgentSession`）——
 * 只有 runtime 才有 `fork`/`switchSession`/`newSession`，那正是 fork/clone/恢复的
 * 原语（docs/01 §8-1）。
 */
export function defaultCreateRuntime(agentDir: string | undefined): CreateRuntimeFn {
  return async (input: CreateRuntimeInput): Promise<AgentSessionRuntime> => {
    const dir = agentDir ?? getAgentDir();

    const sessionManager =
      input.sessionFile !== undefined
        ? SessionManagerClass.open(input.sessionFile)
        : SessionManagerClass.create(input.cwd);

    const createRuntime: CreateAgentSessionRuntimeFactory = async ({
      cwd,
      agentDir: runtimeAgentDir,
      sessionManager: runtimeSessionManager,
      sessionStartEvent,
    }) => {
      const services = await createAgentSessionServices({
        cwd,
        agentDir: runtimeAgentDir,
        // 纯聊天（G2-9 边界）：扩展工具跑不了、技能要靠 read/bash 才读得到，
        // 都没必要加载。系统提示词不覆写——交给 pi 按默认段落组装（ADR-0015）
        ...(input.chatOnly
          ? {
              resourceLoaderOptions: {
                noExtensions: true,
                noSkills: true,
                noPromptTemplates: true,
                noThemes: true,
              },
            }
          : {}),
      });
      const created = await createAgentSessionFromServices({
        services,
        sessionManager: runtimeSessionManager,
        sessionStartEvent,
        model: input.model,
        thinkingLevel: input.thinkingLevel,
        tools: input.tools,
      });
      return { ...created, services, diagnostics: services.diagnostics };
    };

    return createAgentSessionRuntime(createRuntime, {
      cwd: sessionManager.getCwd(),
      agentDir: dir,
      sessionManager,
    });
  };
}

/** protocol 的三态应答 → 桥的判别联合 */
function toUiResponse(
  command: Extract<AgentCommand, { type: 'extension_ui_response' }>,
): ExtensionUiResponse {
  if (command.cancelled === true) return { id: command.id, cancelled: true };
  if (command.confirmed !== undefined) return { id: command.id, confirmed: command.confirmed };
  if (command.value !== undefined) return { id: command.id, value: command.value };
  throw new UserInputError('extension_ui_response requires value, confirmed or cancelled');
}

export { TOOL_SELECTION_CUSTOM_TYPE };
