import type { Turn } from '@ice-ai/client';
import { groupTrail } from '@ice-ai/client';
import { Check, Copy, Pencil } from 'lucide-react';
import { type KeyboardEvent, memo, useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../i18n/format';
import { useI18n } from '../i18n/i18n-provider';
import { cn } from '../utils/cn';
import { ChatImageList } from './chat-image';
import styles from './markdown.module.css';
import { MarkdownView } from './markdown-view';
import { ProcessGroup } from './process-group';
import { TextRowView } from './text-row';
import { SystemRowView, ThinkingRowView } from './thinking-row';
import { ToolRowView } from './tool-row';
import { TurnWrittenFiles } from './turn-written-files';
import { UsageLine } from './usage-pills';

/**
 * 轨迹项的 React key：trail 是**仅追加**列表（流式补丁就地替换、从不重排），
 * 所以位置即稳定标识；工具行用 toolCallId（跨实例稳定）。
 */
function trailKey(item: { kind: string; toolCallId?: string }, index: number): string {
  return item.kind === 'tool' && item.toolCallId !== undefined
    ? item.toolCallId
    : `${item.kind}-${index}`;
}

/**
 * 用户气泡：按设计规范 `MessageView` 的 UserMessageView（12px 圆角 / 8×12 内边距 / 14px 字 / 1.6 行高）。
 * hover 时露出复制 / 编辑；编辑在原位展开，保存即从这条消息前创建新分支。
 */
export function UserBubble({
  turn,
  onEdit,
  editDisabled = false,
}: {
  turn: Turn;
  /** 提供后才显示编辑；宿主负责分叉并派发编辑后的文本，true 表示已受理 */
  onEdit?: (turn: Turn, text: string) => Promise<boolean>;
  editDisabled?: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const canEdit = onEdit !== undefined && !editDisabled && (turn.user.images?.length ?? 0) === 0;

  useEffect(() => {
    if (!editing) return;
    const editor = editorRef.current;
    if (editor === null) return;
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }, [editing]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(turn.user.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板权限被拒：按钮态不变（与代码块复制一致）
    }
  };

  const startEdit = (): void => {
    setDraft(turn.user.text);
    setEditing(true);
  };

  const cancelEdit = (): void => {
    setEditing(false);
    setDraft('');
  };

  const saveEdit = async (): Promise<void> => {
    const text = draft.trim();
    if (text.length === 0 || text === turn.user.text.trim() || saving) return;
    setSaving(true);
    try {
      if (await onEdit?.(turn, text)) cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancelEdit();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void saveEdit();
    }
  };

  return (
    <div className={cn(styles.userTurn)}>
      <div className={cn(styles.userBubble, editing && styles.isEditing)}>
        {editing ? (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onEditorKeyDown}
            disabled={saving}
            rows={Math.max(2, draft.split('\n').length)}
            ref={editorRef}
            className={styles.userEditor}
            aria-label={t('chat.message')}
          />
        ) : (
          <>
            {turn.user.images !== undefined && turn.user.images.length > 0 && (
              <div style={{ marginBottom: turn.user.text.trim().length > 0 ? 6 : 0 }}>
                <ChatImageList sources={turn.user.images} />
              </div>
            )}
            <div className={cn(styles.body, styles.userMessage)}>
              <MarkdownView markdown={turn.user.text} />
            </div>
          </>
        )}
      </div>
      <div className={styles.userMeta}>
        <span className={styles.userTimestamp}>{formatDateTime(turn.user.at)}</span>
        <div className={styles.userActions}>
          {editing ? (
            <>
              <button
                type="button"
                className={styles.userAction}
                onClick={() => void saveEdit()}
                disabled={saving || draft.trim().length === 0}
              >
                {t('i18n.save')}
              </button>
              <button
                type="button"
                className={styles.userAction}
                onClick={cancelEdit}
                disabled={saving}
              >
                {t('i18n.cancel')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.userAction}
                onClick={() => void copy()}
                aria-label={t('i18n.copyMessage')}
                title={copied ? t('i18n.copied') : t('i18n.copyMessage')}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              {canEdit && (
                <button
                  type="button"
                  className={styles.userAction}
                  onClick={startEdit}
                  aria-label={t('i18n.editFromHere')}
                  title={t('i18n.editFromHereTitle')}
                >
                  <Pencil size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * AssistantTurn：模型标签 + 轨迹（流式平铺 / 静止后成组）+ 回答 + 用量胶囊。
 * 布局按设计规范 `MessageView` 的 AssistantMessageView：标签 11px text-dim，
 * 块间距 8；底部用量为胶囊行（费用 / Tokens / 耗时，usage-pills.tsx，2026-10-05 起替代
 * 旧 in·out·cacheR 单行）。
 * 成组是渲染期派生（groupTrail），流式末轮平铺不分组（docs/05 §6.5 方案 2）。
 */
export const AssistantTurn = memo(function AssistantTurn({
  turn,
  streaming,
  writtenPaths,
  onOpenFile,
}: {
  turn: Turn;
  /** 会话整体是否仍在跑（决定末轮 isLiveTail） */
  streaming: boolean;
  /** 本轮写出的文件（空数组即不渲染 chip 行） */
  writtenPaths: string[];
  onOpenFile(path: string): void;
}) {
  const liveTail = turn.status === 'streaming' && streaming;
  const grouped = groupTrail(turn.trail, liveTail);
  const hasFinal = turn.final !== null && turn.final.markdown.trim().length > 0;
  const streamingText = liveTail && turn.final === null;

  return (
    <div style={{ marginBottom: 16 }}>
      {turn.model !== null && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{turn.model.modelId}</span>
          {liveTail && <span className="shimmer">生成中…</span>}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {grouped.map((item, index) => {
          if (item.kind === 'group') {
            return (
              <ProcessGroup
                key={trailKey(item.items[0] ?? { kind: 'group' }, index)}
                group={item}
                defaultExpanded={!hasFinal}
              />
            );
          }
          if (item.kind === 'thinking')
            return <ThinkingRowView key={trailKey(item, index)} row={item} />;
          if (item.kind === 'tool') return <ToolRowView key={item.toolCallId} row={item} />;
          if (item.kind === 'text') return <TextRowView key={trailKey(item, index)} row={item} />;
          return <SystemRowView key={trailKey(item, index)} text={item.text} tone={item.tone} />;
        })}
        {streamingText && turn.model === null && <p className="shimmer text-[12px]">生成中…</p>}
        {turn.final !== null && turn.final.markdown.length > 0 && (
          <div className="min-w-0">
            <MarkdownView markdown={turn.final.markdown} />
          </div>
        )}
        {turn.status === 'stopped' && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--text-dim)',
              borderRadius: 7,
              padding: '6px 10px',
              background: 'var(--bg-subtle)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            已停止
          </div>
        )}
        {turn.status === 'error' && (
          <div
            role="alert"
            style={{
              padding: '7px 10px',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              background: 'rgba(239,68,68,0.07)',
              color: 'var(--red)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {turn.errorMessage !== null && turn.errorMessage.length > 0
              ? `本轮出错：${turn.errorMessage}`
              : '本轮出错（详见处理详情）'}
          </div>
        )}
        {writtenPaths.length > 0 && <TurnWrittenFiles paths={writtenPaths} onOpen={onOpenFile} />}
        {turn.usage !== null && !liveTail && (
          <UsageLine
            usage={turn.usage}
            durationMs={
              turn.endedAt !== undefined ? Math.max(0, turn.endedAt - turn.user.at) : null
            }
          />
        )}
      </div>
    </div>
  );
});
