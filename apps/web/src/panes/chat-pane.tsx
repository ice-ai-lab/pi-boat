import {
  applyAtInsertion,
  applySlashInsertion,
  buildEntriesFromFiles,
  buildMinimapBars,
  contextPercent,
  extractAtQuery,
  extractSlashQuery,
  extractTurnWrittenFiles,
  filterFileEntries,
  filterSlashCommands,
  getFileIndex,
  parseSlashSubmission,
  sessionExportUrl,
  shortPath,
  slashSourceLabel,
  summarizeStats,
} from '@ice-ai/client';
import {
  useAgentSession,
  useGitStatusQuery,
  useModelsQuery,
  useSessionDetailQuery,
} from '@ice-ai/client/react';
import {
  ChatMinimap,
  Composer,
  ComposerToolbar,
  EmptyState,
  ExtensionRequestDialog,
  ExtensionStatusBar,
  ExtensionWidgets,
  MessageList,
  type MessageListHandle,
  QueueBar,
  type SuggestionItem,
  ToastHost,
  type ToastItem,
  TurnWrittenFiles,
  toastQueueReducer,
} from '@ice-ai/ui';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useServerHealth } from '../layout/health';
import { fileTabsStore } from '../services/file-tabs-store';
import { useInputHistory } from '../services/use-input-history';
import { useCompletionSignal } from '../services/use-notifications';
import { getLastCwd, setLastCwd } from '../services/workspace-memory';
import { type ActivePanel, PanelsHost } from './panels-host';

/**
 * ChatPane（F1→F5）：对话主面板。URL `?s=` 是会话的唯一真相（ADR-0019-5）。
 * F5 增补：斜杠命令 / 输入历史 / 排队条 / 压缩与自动命名 / 统计与分支面板 /
 * minimap / 本轮改动文件 / 扩展 UI（状态栏·widgets·阻塞对话框）/ 完成提示音。
 */
export interface ChatPaneProps {
  preferredCwd?: string | null;
}

const TOOL_PRESET_OPTIONS = [
  { value: 'configured', label: '跟随设置' },
  { value: 'none', label: '纯聊天' },
  { value: 'read-only', label: '只读' },
  { value: 'default', label: '默认' },
  { value: 'full', label: '全部工具' },
] as const;

export function ChatPane({ preferredCwd = null }: ChatPaneProps) {
  const session = useAgentSession();
  const { chat, sessionId } = session;
  const [draft, setDraft] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [toasts, dispatchToast] = useReducer(toastQueueReducer, [] as ToastItem[]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState<string[] | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [autoNaming, setAutoNaming] = useState(false);
  const [steeringMode, setSteeringMode] = useState(false);
  const selfNavigationRef = useRef<string | null>(null);
  const minimapController = useRef<MessageListHandle | null>(null);
  const urlSessionId = searchParams.get('s');

  const history = useInputHistory(sessionId);
  const signal = useCompletionSignal();
  const detail = useSessionDetailQuery(sessionId);
  const models = useModelsQuery(session.cwd ?? undefined);
  const gitStatus = useGitStatusQuery(session.cwd);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const toast: ToastItem = { id: crypto.randomUUID(), message, tone };
    dispatchToast({ type: 'add', toast });
    setTimeout(() => dispatchToast({ type: 'dismiss', id: toast.id }), 4000);
  }, []);

  // ① URL → 会话
  // biome-ignore lint/correctness/useExhaustiveDependencies: session.open/reset 身份随 sessionId 变化，只在 URL 变化时触发
  useEffect(() => {
    if (urlSessionId === session.sessionId) return;
    if (urlSessionId === null) {
      if (session.sessionId !== null) session.reset();
      return;
    }
    if (selfNavigationRef.current === urlSessionId) {
      selfNavigationRef.current = null;
      return;
    }
    void session.open(urlSessionId).then((error) => {
      if (error !== null) pushToast(`打开会话失败：${error}`, 'error');
    });
  }, [urlSessionId, session.sessionId, pushToast]);

  // ② 会话 id → URL
  useEffect(() => {
    if (sessionId === null || urlSessionId === sessionId) return;
    selfNavigationRef.current = sessionId;
    setSearchParams({ s: sessionId }, { replace: true });
  }, [sessionId, urlSessionId, setSearchParams]);

  // ③ 切会话后预取：命令 / 工具 / 统计 / 运行时状态（systemPrompt）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在会话切换时预取一次
  useEffect(() => {
    if (sessionId === null) return;
    void session.loadCommands();
    void session.loadTools();
    void session.refreshStats();
    void session.refreshLiveState();
  }, [sessionId]);

  // ④ 一轮结束：提示音/通知 + 统计与状态刷新，并刷新会话详情（分支树/条目数会变）
  const wasStreamingRef = useRef(false);
  // 只在 streaming 的下降沿触发：读取的 turns/sessionName 都通过闭包取「当次渲染」的值，
  // 把它们放进依赖会在流式期间反复触发（每帧 effect），故显式豁免
  // biome-ignore lint/correctness/useExhaustiveDependencies: 见上行说明
  useEffect(() => {
    if (wasStreamingRef.current && !chat.streaming) {
      const lastTurn = chat.turns[chat.turns.length - 1];
      signal.notifyDone(
        chat.sessionName ?? 'PiBoat',
        lastTurn?.final?.markdown.slice(0, 120) ?? '本轮已完成',
      );
      void session.refreshStats();
      void session.refreshLiveState();
      void detail.refetch();
    }
    wasStreamingRef.current = chat.streaming;
  }, [chat.streaming]);

  // ⑤ 斜杠 / 提及候选（斜杠优先：命令在行首，提及在词中）
  const textBeforeCaret = draft.slice(0, Math.min(caret, draft.length));
  const slashMatch = extractSlashQuery(textBeforeCaret);
  const mentionMatch = slashMatch === null ? extractAtQuery(textBeforeCaret) : null;

  useEffect(() => {
    if (mentionMatch === null || fileIndex !== null || session.cwd === null) return;
    void getFileIndex(session.cwd)
      .then((index) => setFileIndex(index.files))
      .catch(() => setFileIndex([]));
  }, [mentionMatch, fileIndex, session.cwd]);

  const mentionEntries = useMemo(
    () =>
      mentionMatch === null || fileIndex === null
        ? []
        : filterFileEntries(buildEntriesFromFiles(fileIndex), mentionMatch.query),
    [mentionMatch, fileIndex],
  );

  const mentionItems: SuggestionItem[] = mentionEntries.map((entry) => ({
    label: entry.path,
    hint: entry.isDir ? '目录' : undefined,
  }));

  const slashCandidates = useMemo(
    () =>
      slashMatch === null || slashMatch.hasArgs
        ? []
        : filterSlashCommands(session.commands, slashMatch.name),
    [slashMatch, session.commands],
  );

  const slashItems: SuggestionItem[] = slashCandidates.map((command) => ({
    label: `/${command.name}`,
    hint: slashSourceLabel(command.source),
    description: command.description,
  }));

  const pickMention = useCallback(
    (index: number) => {
      const entry = mentionEntries[index];
      if (entry === undefined || mentionMatch === null) return;
      const inserted = applyAtInsertion(draft, mentionMatch, entry);
      setDraft(inserted.text);
      setCaret(inserted.caret);
      setActiveIndex(0);
    },
    [mentionEntries, mentionMatch, draft],
  );

  const pickSlash = useCallback(
    (index: number) => {
      const command = slashCandidates[index];
      if (command === undefined || slashMatch === null) return;
      const inserted = applySlashInsertion(draft, slashMatch, command.name);
      setDraft(inserted.text);
      setCaret(inserted.caret);
      setActiveIndex(0);
    },
    [slashCandidates, slashMatch, draft],
  );

  const startSession = useCallback(
    async (cwd: string) => {
      setStartError(null);
      const error = await session.start(cwd);
      if (error !== null) {
        setStartError(error);
        return;
      }
      setLastCwd(cwd);
    },
    [session],
  );

  const handleSubmit = useCallback(
    (text: string) => {
      history.remember(text);
      if (steeringMode && chat.streaming) {
        void session.steer(text).then((error) => {
          if (error !== null) pushToast(error, 'error');
        });
        return;
      }
      void session.send(text).then((error) => {
        if (error === null) return;
        const command = parseSlashSubmission(text);
        pushToast(command === null ? error : `命令 /${command.name} 发送失败：${error}`, 'error');
      });
    },
    [session, pushToast, history, steeringMode, chat.streaming],
  );

  const lastTurnId = chat.turns[chat.turns.length - 1]?.id;
  const writtenPaths = useMemo(() => {
    const groups = extractTurnWrittenFiles(chat.turns);
    return groups.find((group) => group.turnId === lastTurnId)?.paths ?? [];
  }, [chat.turns, lastTurnId]);

  const minimapBars = useMemo(() => buildMinimapBars(chat.turns, 0, 1, 1), [chat.turns]);
  const statsSummary = useMemo(() => summarizeStats(session.stats), [session.stats]);
  const contextPct = useMemo(
    () => contextPercent(session.liveState?.contextUsage),
    [session.liveState],
  );

  // 思考档位候选：按当前模型取（服务端给的是 `provider:id` 键）
  const modelKey =
    session.liveState?.model === null || session.liveState?.model === undefined
      ? null
      : `${session.liveState.model.provider}:${session.liveState.model.modelId}`;
  const thinkingLevels = modelKey === null ? [] : (models.data?.thinkingLevels[modelKey] ?? []);

  const health = useServerHealth();

  if (sessionId === null) {
    return (
      <>
        <EmptyState
          onStart={(cwd) => void startSession(cwd)}
          starting={session.starting}
          initialCwd={preferredCwd ?? getLastCwd()}
          error={startError}
        />
        <ToastHost items={toasts} />
      </>
    );
  }

  const compacting = session.liveState?.isCompacting === true;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hairline-b flex h-8 shrink-0 items-center gap-2 border-line-1 px-4">
        <span className="truncate text-[12px] text-fg-subtle">
          {chat.sessionName ?? sessionId.slice(0, 8)}
        </span>
        {health === 'down' && <span className="text-[11px] text-danger">· 服务连接中断</span>}
        <div className="ml-auto flex items-center gap-0.5">
          {chat.streaming && <span className="mr-1 text-[11px] text-accent">运行中</span>}
          {(
            [
              ['branches', '分支'],
              ['system', '系统'],
              ['tools', '工具'],
              ['stats', '统计'],
            ] as const
          ).map(([panel, label]) => (
            <button
              key={panel}
              type="button"
              aria-pressed={activePanel === panel}
              onClick={() => {
                const next = activePanel === panel ? null : panel;
                setActivePanel(next);
                if (next === 'stats') void session.refreshStats();
                if (next === 'system') void session.refreshLiveState();
                if (next === 'tools') void session.loadTools();
              }}
              className={
                activePanel === panel
                  ? 'sq bg-accent-weak px-1.5 py-0.5 text-[11px] text-accent'
                  : 'sq px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <PanelsHost
        active={activePanel}
        onClose={() => setActivePanel(null)}
        tree={detail.data?.tree ?? []}
        activeLeafId={detail.data?.leafId ?? null}
        branchesBusy={false}
        onNavigateNode={(nodeId) =>
          void session.navigateTree(nodeId).then((result) => {
            if (result.error !== undefined) pushToast(result.error, 'error');
            else if (result.editorText !== undefined) setDraft(result.editorText);
          })
        }
        onForkNode={(nodeId) =>
          void session.fork(nodeId).then((error) => {
            if (error !== null) pushToast(error, 'error');
            else pushToast('已从该节点分叉（旧会话已被替换）');
          })
        }
        onCloneSession={() =>
          void session.fork(chat.turns[chat.turns.length - 1]?.id ?? '').then(() => {
            pushToast('克隆能力由 navigate_tree + 分叉组合提供，当前按分叉处理');
          })
        }
        systemPrompt={session.liveState?.systemPrompt ?? null}
        systemLoading={false}
        onReloadSystemPrompt={() => void session.refreshLiveState()}
        tools={session.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          active: tool.active === true,
        }))}
        toolsLoading={false}
        onReloadTools={() => void session.loadTools()}
        stats={session.stats === null ? null : statsSummary}
        statsInfo={
          detail.data === undefined
            ? null
            : {
                sessionId: detail.data.sessionId,
                filePath: detail.data.filePath,
                messageCount: detail.data.info.messageCount,
                branch: detail.data.info.branch,
                isWorktree: detail.data.info.isWorktree,
                model: session.liveState?.model?.modelId,
                created: detail.data.info.created,
                modified: detail.data.info.modified,
              }
        }
        contextPercent={contextPct}
        statsLoading={false}
        onReloadStats={() => void session.refreshStats()}
      />

      <ExtensionStatusBar statuses={session.liveState?.extensionStatuses ?? []} />
      <ExtensionWidgets widgets={session.liveState?.extensionWidgets ?? []} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <MessageList
          chat={chat}
          hasOlder={session.hasOlder}
          loadingOlder={session.loadingOlder}
          onLoadOlder={() => void session.loadOlder()}
          controllerRef={minimapController}
        />
        <ChatMinimap
          bars={minimapBars}
          onJump={(index) => minimapController.current?.scrollToTurn(index)}
        />
      </div>

      <TurnWrittenFiles
        paths={writtenPaths}
        className="mx-auto w-(--chat-w) max-w-full px-5 pb-1"
        displayPath={(path) => shortPath(path, session.cwd)}
        onOpen={(path) => {
          const relative = shortPath(path, session.cwd);
          const status = gitStatus.data?.files.find((file) => file.path === relative);
          fileTabsStore.open(path, status !== undefined && status.kind !== 'untracked');
        }}
      />

      <div className="shrink-0 pb-4">
        <QueueBar
          steering={chat.queued.steering}
          followUp={chat.queued.followUp}
          onClear={() => void session.clearQueue()}
        />
        <Composer
          value={draft}
          onChange={(next) => {
            setDraft(next);
            history.resetCursor();
          }}
          onSubmit={handleSubmit}
          onAbort={() => void session.abort()}
          streaming={chat.streaming}
          disabled={chat.terminated}
          mentions={mentionItems}
          onPickMention={pickMention}
          slashCommands={slashItems}
          onPickSlashCommand={pickSlash}
          mentionActiveIndex={activeIndex}
          onMentionActiveIndexChange={setActiveIndex}
          onCaretChange={setCaret}
          onHistoryPrev={
            draft.length === 0 || history.cursor.index !== -1
              ? () => setDraft(history.prevValue(draft))
              : undefined
          }
          onHistoryNext={
            history.cursor.index !== -1 ? () => setDraft(history.nextValue(draft)) : undefined
          }
          aboveInput={
            <div className="mx-auto flex w-(--chat-w) max-w-full items-center gap-1.5 px-5 pb-1">
              <ComposerToolbar
                modelLabel={session.liveState?.model?.modelId ?? null}
                thinkingLevel={session.liveState?.thinkingLevel ?? null}
                thinkingLevels={thinkingLevels}
                onThinkingLevelChange={(level) =>
                  void session.setThinkingLevel(level as never).then((error) => {
                    if (error !== null) pushToast(error, 'error');
                  })
                }
                toolPreset={null}
                toolPresets={[...TOOL_PRESET_OPTIONS]}
                onToolPresetChange={(preset) =>
                  void session.setTools(preset as never).then((error) => {
                    if (error !== null) pushToast(error, 'error');
                  })
                }
                compacting={compacting}
                onCompact={() =>
                  void session.compact().then((error) => {
                    if (error !== null) pushToast(error, 'error');
                    else pushToast('已请求压缩上下文');
                  })
                }
                onAbortCompaction={() => void session.abortCompaction()}
                onAutoName={() => {
                  setAutoNaming(true);
                  void session.autoName().then((result) => {
                    setAutoNaming(false);
                    if (result.error !== undefined) pushToast(result.error, 'error');
                    else pushToast(`已命名：${result.title ?? ''}`);
                    void detail.refetch();
                  });
                }}
                autoNaming={autoNaming}
                onExport={() => window.open(sessionExportUrl(sessionId), '_blank')}
                onOpenStats={() => {
                  setActivePanel('stats');
                  void session.refreshStats();
                }}
                busy={chat.streaming}
              />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={steeringMode}
                  onClick={() => setSteeringMode((previous) => !previous)}
                  title="开启后发送的消息会插队（steer）而不是排队"
                  className={
                    steeringMode
                      ? 'sq bg-accent-weak px-1.5 py-0.5 text-[11px] text-accent'
                      : 'sq px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg'
                  }
                >
                  插队
                </button>
                <button
                  type="button"
                  aria-pressed={signal.soundEnabled}
                  onClick={signal.toggleSound}
                  title="一轮完成时响铃（页面存活期有效；ADR-0016 不做后台推送）"
                  className="sq px-1.5 py-0.5 text-[11px] text-fg-subtle hover:bg-hover hover:text-fg"
                >
                  {signal.soundEnabled ? '🔔' : '🔕'}
                </button>
              </div>
            </div>
          }
        />
      </div>

      <ToastHost items={toasts} />
      {chat.extensionRequest !== null && (
        <ExtensionRequestDialog
          request={chat.extensionRequest}
          onRespond={(response) => {
            void session.respondExtensionUi(chat.extensionRequest?.id ?? '', response);
          }}
        />
      )}
    </div>
  );
}
