import {
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useState,
} from 'react';
import { useI18n } from '../i18n/i18n-provider';
import { Textarea } from '../primitives/textarea';
import styles from './chat.module.css';
import { type SuggestionItem, SuggestionMenu } from './suggestion-menu';

/**
 * Composer（docs/06 §4.2）：输入卡 + 卡内控件条（模型/预设/压缩/提示音 │ 停止/引导/后续消息/发送）。
 *
 * 结构按原型 §8「对话框区域」：整块一张玻璃卡（`.inputCard`，20px 圆角），卡内只有两段
 * ——上方留白的输入区（默认 56px 高）与底部一行控件条；附件缩略图长在卡内顶部，
 * 排队长在卡**上方**（`aboveInput`），指标行长在卡**下方**（`belowInput`）。
 * 动作展开成按钮（不做下拉）：运行中并列「停止 · 引导 · 后续消息」，空闲时只留「发送」，
 * 对应键盘 `↵`（引导 / 发送）与 `⌘/Ctrl+↵`（后续消息），`⇧↵` 仍是换行。
 */
export interface ComposerProps {
  value: string;
  onChange(value: string): void;
  onSubmit(text: string): void;
  streaming: boolean;
  disabled?: boolean;
  /** `@` 文件提及候选（web 层用 client 的 file-fuzzy 算出，本组件只渲染与回传选择） */
  mentions?: SuggestionItem[];
  onPickMention?(index: number): void;
  /** `/` 斜杠命令候选（行首触发；与提及互斥，提及优先） */
  slashCommands?: SuggestionItem[];
  onPickSlashCommand?(index: number): void;
  /** 排队消息条等附加行（渲染在输入卡上方） */
  aboveInput?: ReactNode;
  /** 输入卡内控件条的**左簇**（附件 + 模型 + 预设 + 压缩 + 提示音；右侧动作由本组件渲染） */
  cardFoot?: ReactNode;
  /** 输入卡**下方**的一行（指标行） */
  belowInput?: ReactNode;
  /** 键盘上下键在候选间移动（web 层持有选中下标） */
  mentionActiveIndex?: number;
  onMentionActiveIndexChange?(index: number): void;
  /** 光标位置回传（`@` 提及需要「光标前的文本」而不是整段） */
  onCaretChange?(caret: number): void;
  /** 已附加的图片（卡内缩略图 56×56 + 右上角移除） */
  attachedImages?: { previewUrl: string }[];
  onRemoveImage?(index: number): void;
  /** 粘贴板里的图片文件（web 层负责转 data URL 并压缩） */
  onPasteImages?(files: File[]): void;
  /** 流式中的 Steer（amber 按钮）：尽快打断当前轮并注入 */
  onSteer?(): void;
  /** 流式中的 Follow-Up（accent 按钮）：当前轮收尾后追问 */
  onFollowUp?(): void;
  /** 流式中的停止（red 按钮）：归零本轮 */
  onAbort?(): void;
  /** 输入历史（`↑` 在空输入上拉起浮层，T2-9） */
  historyItems?: string[];
  onPickHistory?(text: string): void;
}

/** 原型 `.send`：32px 高 / 10px 圆角 / 12.5px 650 */
const ACTION_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  flexShrink: 0,
  height: 32,
  padding: '0 12px',
  border: 'none',
  borderRadius: 10,
  fontSize: 12.5,
  fontWeight: 650,
  letterSpacing: '-0.005em',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background 0.16s, color 0.16s',
};

export function Composer({
  value,
  onChange,
  onSubmit,
  streaming,
  disabled = false,
  mentions,
  onPickMention,
  slashCommands,
  onPickSlashCommand,
  aboveInput,
  cardFoot,
  belowInput,
  mentionActiveIndex = 0,
  onMentionActiveIndexChange,
  onCaretChange,
  attachedImages,
  onRemoveImage,
  onPasteImages,
  onSteer,
  onFollowUp,
  onAbort,
  historyItems,
  onPickHistory,
}: ComposerProps) {
  const { t } = useI18n();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyActiveIndex, setHistoryActiveIndex] = useState(0);
  const history = historyItems ?? [];
  const mentionOpen = mentions !== undefined && mentions.length > 0;
  const slashOpen = !mentionOpen && slashCommands !== undefined && slashCommands.length > 0;
  const menuOpen = mentionOpen || slashOpen;
  const hasImages = (attachedImages?.length ?? 0) > 0;
  // 注：protocol 的 `prompt`/`steer`/`follow_up` 都是 `message: z.string().min(1)`（有单测钉住），
  // 因此「只发图不写字」在本仓会被 400 拒（设计规范允许）。在不改协议契约前，发送/排队仍以文本非空为准。
  const canSend = !disabled && value.trim().length > 0;
  const canQueue = value.trim().length > 0;

  const submit = useCallback(() => {
    const text = value.trim();
    if (text.length === 0 || disabled) return;
    onSubmit(text);
    onChange('');
  }, [value, disabled, onSubmit, onChange]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // 候选菜单开着时：上下选、Tab/Enter 确认、Esc 关（不提交）
      if (menuOpen) {
        const count = mentionOpen ? (mentions?.length ?? 0) : (slashCommands?.length ?? 0);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          onMentionActiveIndexChange?.((mentionActiveIndex + step + count) % count);
          return;
        }
        if (event.key === 'Tab' || (event.key === 'Enter' && !event.nativeEvent.isComposing)) {
          event.preventDefault();
          if (mentionOpen) onPickMention?.(mentionActiveIndex);
          else onPickSlashCommand?.(mentionActiveIndex);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onChange(value.replace(/@([^\s"]*)$/, ''));
          return;
        }
      }
      // 历史浮层开着时：上下选、Tab/Enter 应用、Esc 关（设计规范 ChatInput 的 historyMenuOpen 分支）
      if (historyOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setHistoryActiveIndex((current) => Math.min(history.length - 1, current + 1));
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setHistoryActiveIndex((current) => Math.max(0, current - 1));
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setHistoryOpen(false);
          return;
        }
        if (
          (event.key === 'Tab' || event.key === 'Enter') &&
          history[historyActiveIndex] !== undefined
        ) {
          event.preventDefault();
          setHistoryOpen(false);
          setHistoryActiveIndex(0);
          onPickHistory?.(history[historyActiveIndex]);
          return;
        }
      }
      // `↑` 在空输入上拉起历史浮层（设计规范：仅 !isStreaming 且无内容时）
      if (
        event.key === 'ArrowUp' &&
        !event.nativeEvent.isComposing &&
        !streaming &&
        history.length > 0 &&
        value.trim().length === 0
      ) {
        event.preventDefault();
        setHistoryActiveIndex(history.length - 1);
        setHistoryOpen(true);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        // 运行中：`↵` = 引导、`⌘/Ctrl+↵` = 后续消息（与卡内两个按钮的提示一致）
        if (streaming) {
          if (!canQueue) return;
          if ((event.metaKey || event.ctrlKey) && onFollowUp !== undefined) onFollowUp();
          else onSteer?.();
          return;
        }
        submit();
      }
    },
    [
      submit,
      menuOpen,
      mentionOpen,
      mentions,
      slashCommands,
      mentionActiveIndex,
      onMentionActiveIndexChange,
      onPickMention,
      onPickSlashCommand,
      onChange,
      historyOpen,
      history,
      historyActiveIndex,
      onPickHistory,
      streaming,
      canQueue,
      onSteer,
      onFollowUp,
      value,
    ],
  );

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      if (onPasteImages === undefined) return;
      const items = Array.from(event.clipboardData?.items ?? []);
      const files = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return;
      event.preventDefault();
      onPasteImages(files);
    },
    [onPasteImages],
  );

  const placeholder = streaming
    ? onSteer !== undefined || onFollowUp !== undefined
      ? t('chat.steerPlaceholder')
      : t('chat.agentPlaceholder')
    : t('chat.messagePlaceholder');

  // 快捷键提示**常显**（2026-09-28 定案，与原型 `:has(.ta:not(:placeholder-shown)) .send kbd`
  // 相反）：有文本时按钮只是从禁用态变可用，提示不随之消失——否则用户一打字就丢了
  // 「↵ 发送 / ⌘↵ 后续消息」这条线索。窄卡由 CSS 容器查询隐藏（chat.module.css `.sendKbd`）。
  const kbd = (label: string) => (
    <kbd
      className={styles.sendKbd}
      style={{
        fontFamily: 'var(--font)',
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: 1,
        padding: '2px 4px',
        borderRadius: 5,
        background: 'color-mix(in oklab, currentColor 14%, transparent)',
        opacity: 0.75,
      }}
    >
      {label}
    </kbd>
  );

  return (
    <fieldset
      style={{
        flexShrink: 0,
        minWidth: 0,
        margin: 0,
        border: 0,
        background: 'transparent',
        padding: '0 16px 8px',
      }}
    >
      <div style={{ maxWidth: 'var(--chat-content-max-width, 1150px)', margin: '0 auto' }}>
        {aboveInput}

        <div style={{ position: 'relative', minWidth: 0 }}>
          {historyOpen && history.length > 0 && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 'calc(100% + 8px)',
                zIndex: 120,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 -6px 20px rgba(0,0,0,0.12)',
                overflow: 'hidden',
                maxHeight: 'min(44vh, 360px)',
              }}
            >
              <div
                title={t('chat.inputHistory')}
                style={{
                  height: 30,
                  padding: '0 10px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-dim)',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 3-6.7" />
                  <path d="M3 4v5h5" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </div>
              <div
                style={{
                  maxHeight: 'calc(min(44vh, 360px) - 31px)',
                  overflowY: 'auto',
                  padding: 4,
                }}
              >
                {history.map((item, index) => {
                  const active = index === historyActiveIndex;
                  return (
                    <button
                      // 历史条目文本可重复（同一句话发过两次），下标参与 key
                      // biome-ignore lint/suspicious/noArrayIndexKey: 同上
                      key={`${index}:${item}`}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        setHistoryOpen(false);
                        setHistoryActiveIndex(0);
                        onPickHistory?.(item);
                      }}
                      onMouseEnter={() => setHistoryActiveIndex(index)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '7px 8px',
                        border: 'none',
                        borderRadius: 6,
                        background: active ? 'var(--bg-selected)' : 'none',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: 12.5,
                        lineHeight: 1.45,
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--text-dim)',
                          paddingTop: 1,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span
                        style={{
                          minWidth: 0,
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2,
                          overflow: 'hidden',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {item}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {mentionOpen && (
            <SuggestionMenu
              title={t('chat.files', {
                label: t('chat.matches', { count: mentions?.length ?? 0 }),
                hint: '',
              })}
              hint={t('chat.tabEnter')}
              items={mentions ?? []}
              activeIndex={mentionActiveIndex}
              onPick={(index) => onPickMention?.(index)}
              onHover={(index) => onMentionActiveIndexChange?.(index)}
              emptyHint={t('chat.noMatchingFiles')}
            />
          )}
          {slashOpen && (
            <SuggestionMenu
              title={t('chat.slashCommands', { label: `${slashCommands?.length ?? 0}` })}
              hint={t('chat.tabEnter')}
              items={slashCommands ?? []}
              activeIndex={mentionActiveIndex}
              onPick={(index) => onPickSlashCommand?.(index)}
              onHover={(index) => onMentionActiveIndexChange?.(index)}
              emptyHint={t('chat.noCommands')}
              variant="grid"
            />
          )}

          {/* 输入卡（原型 `.inputcard`）：附件行 → 输入区 → 控件条 */}
          <div className={styles.inputCard}>
            {hasImages && (
              <div style={{ display: 'flex', gap: 8, margin: '2px 4px 6px', flexWrap: 'wrap' }}>
                {attachedImages?.map((image, index) => (
                  <div key={image.previewUrl} style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={image.previewUrl}
                      alt=""
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        display: 'block',
                      }}
                    />
                    <button
                      type="button"
                      aria-label={t('chat.removeImage')}
                      title={t('chat.removeImage')}
                      onClick={() => onRemoveImage?.(index)}
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <line x1="1" y1="1" x2="7" y2="7" />
                        <line x1="7" y1="1" x2="1" y2="7" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 8px 0' }}>
              <Textarea
                value={value}
                onChange={(event) => {
                  setHistoryOpen(false);
                  onChange(event.target.value);
                  onCaretChange?.(event.target.selectionStart ?? event.target.value.length);
                }}
                onSelect={(event) =>
                  onCaretChange?.(
                    event.currentTarget.selectionStart ?? event.currentTarget.value.length,
                  )
                }
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                className={styles.inputTextarea}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  color: 'var(--text)',
                  fontSize: 'var(--chat-content-font-size, 14px)',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  minHeight: 56,
                  maxHeight: 224,
                  padding: 2,
                  overflow: 'auto',
                  letterSpacing: '-0.004em',
                }}
              />
            </div>

            {/* 控件条：左簇（外部传入）+ spacer + 停止 / 引导 / 后续消息 / 发送 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 2,
                marginTop: 2,
                padding: '2px 2px 0',
              }}
            >
              {cardFoot}
              <div style={{ flex: 1, minWidth: 0 }} />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  marginLeft: 4,
                }}
              >
                {streaming &&
                  (onAbort !== undefined || onSteer !== undefined || onFollowUp !== undefined) && (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 1,
                        height: 18,
                        margin: '0 6px 0 4px',
                        flexShrink: 0,
                        background: 'var(--border)',
                      }}
                    />
                  )}
                {streaming && onAbort !== undefined && (
                  <button
                    type="button"
                    onClick={onAbort}
                    title={t('chat.stopAgent')}
                    aria-label={t('chat.stop')}
                    style={{
                      ...ACTION_BUTTON,
                      gap: 7,
                      background: 'var(--red-bg)',
                      color: 'var(--red)',
                      boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--red) 34%, transparent)',
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.background =
                        'color-mix(in srgb, var(--red) 20%, transparent)';
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = 'var(--red-bg)';
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                      <rect
                        x="5"
                        y="5"
                        width="14"
                        height="14"
                        rx="3"
                        fill="currentColor"
                        stroke="none"
                      />
                    </svg>
                    {t('chat.stop')}
                  </button>
                )}

                {streaming ? (
                  <>
                    {onSteer !== undefined && (
                      <button
                        type="button"
                        onClick={onSteer}
                        disabled={!canQueue}
                        title={t('chat.steerHint')}
                        aria-label={t('chat.steer')}
                        style={
                          canQueue
                            ? {
                                ...ACTION_BUTTON,
                                background: 'var(--amber-bg)',
                                color: 'var(--amber)',
                                boxShadow:
                                  'inset 0 0 0 1px color-mix(in srgb, var(--amber) 38%, transparent)',
                              }
                            : {
                                ...ACTION_BUTTON,
                                background: 'transparent',
                                color: 'var(--text-dim)',
                                boxShadow: 'inset 0 0 0 1px var(--border)',
                                cursor: 'not-allowed',
                              }
                        }
                        onMouseEnter={(event) => {
                          if (!canQueue) return;
                          event.currentTarget.style.background =
                            'color-mix(in srgb, var(--amber) 22%, transparent)';
                        }}
                        onMouseLeave={(event) => {
                          if (!canQueue) return;
                          event.currentTarget.style.background = 'var(--amber-bg)';
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M13.5 2.5 4.5 14h6l-1 7.5 9-11.5h-6z" />
                        </svg>
                        {t('chat.steer')}
                        {kbd('↵')}
                      </button>
                    )}
                    {onFollowUp !== undefined && (
                      <button
                        type="button"
                        onClick={onFollowUp}
                        disabled={!canQueue}
                        title={t('chat.followUpHint')}
                        aria-label={t('chat.followUp')}
                        style={
                          canQueue
                            ? {
                                ...ACTION_BUTTON,
                                background: 'var(--user-bg)',
                                color: 'var(--accent)',
                                boxShadow:
                                  'inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent)',
                              }
                            : {
                                ...ACTION_BUTTON,
                                background: 'transparent',
                                color: 'var(--text-dim)',
                                boxShadow: 'inset 0 0 0 1px var(--border)',
                                cursor: 'not-allowed',
                              }
                        }
                        onMouseEnter={(event) => {
                          if (!canQueue) return;
                          event.currentTarget.style.background =
                            'color-mix(in srgb, var(--accent) 20%, transparent)';
                        }}
                        onMouseLeave={(event) => {
                          if (!canQueue) return;
                          event.currentTarget.style.background = 'var(--user-bg)';
                        }}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m9 10-5 5 5 5" />
                          <path d="M4 15h11a5 5 0 0 0 5-5V4" />
                        </svg>
                        {t('chat.followUp')}
                        {kbd('⌘↵')}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    title={t('chat.send')}
                    aria-label={t('chat.send')}
                    disabled={!canSend}
                    style={
                      canSend
                        ? {
                            ...ACTION_BUTTON,
                            background: 'var(--accent)',
                            color: 'var(--accent-contrast)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.16)',
                          }
                        : {
                            ...ACTION_BUTTON,
                            background: 'transparent',
                            color: 'var(--text-dim)',
                            boxShadow: 'inset 0 0 0 1px var(--border)',
                            cursor: 'not-allowed',
                          }
                    }
                    onMouseEnter={(event) => {
                      if (!canSend) return;
                      event.currentTarget.style.background = 'var(--accent-hover)';
                    }}
                    onMouseLeave={(event) => {
                      if (!canSend) return;
                      event.currentTarget.style.background = 'var(--accent)';
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 19.5V5M5.5 11.5 12 5l6.5 6.5" />
                    </svg>
                    {t('chat.send')}
                    {kbd('↵')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {belowInput !== undefined && <div style={{ marginTop: 6 }}>{belowInput}</div>}
      </div>
    </fieldset>
  );
}
