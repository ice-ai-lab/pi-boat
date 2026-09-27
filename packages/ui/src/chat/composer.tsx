import {
  type ClipboardEvent,
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
 * Composer（docs/06 §4.2）：sticky 输入卡 + 发送↔停止/Steer/FollowUp。
 *
 * 结构按设计规范 `ChatInput.tsx` 的输入卡部分（T2-3/T2-4/T2-8/T2-10/T2-13）：
 * 14px 圆角卡 + `10px 10px 10px 14px` 内边距 + 双层 boxShadow；流式中描边转黄
 * （`rgba(234,179,8,0.4)`）并把卡内按钮换成 Steer（黄）/ Follow-Up（靛蓝）；
 * 外层 `padding: 0 16px 8px` + 桌面同宽右内边距。
 * 附件缩略图渲染在卡上方；`belowInput` 是输入卡**下方**的工具行。
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
  /** 输入卡**下方**的工具行（设计规范 ChatInput 的底部行：附件+模型 | 思考/工具/压缩/停止） */
  belowInput?: ReactNode;
  /** 键盘上下键在候选间移动（web 层持有选中下标） */
  mentionActiveIndex?: number;
  onMentionActiveIndexChange?(index: number): void;
  /** 光标位置回传（`@` 提及需要「光标前的文本」而不是整段） */
  onCaretChange?(caret: number): void;
  /** 已附加的图片（缩略图 56×56 + 右上角移除） */
  attachedImages?: { previewUrl: string }[];
  onRemoveImage?(index: number): void;
  /** 粘贴板里的图片文件（web 层负责转 data URL 并压缩） */
  onPasteImages?(files: File[]): void;
  /** 流式中的 Steer（黄色按钮）：尽快打断当前轮并注入 */
  onSteer?(): void;
  /** 流式中的 Follow-Up（靛蓝按钮）：当前轮收尾后追问 */
  onFollowUp?(): void;
  /** 输入历史（`↑` 在空输入上拉起浮层，T2-9） */
  historyItems?: string[];
  onPickHistory?(text: string): void;
}

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
  belowInput,
  mentionActiveIndex = 0,
  onMentionActiveIndexChange,
  onCaretChange,
  attachedImages,
  onRemoveImage,
  onPasteImages,
  onSteer,
  onFollowUp,
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
        {hasImages && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {attachedImages?.map((image, index) => (
              <div key={image.previewUrl} style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src={image.previewUrl}
                  alt=""
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: 'cover',
                    borderRadius: 6,
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

          {/* 输入卡：14px 圆角 + 10/14 内边距 + 流式中黄色描边（设计规范 ChatInput:2119-2121） */}
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--bg)',
              border: `1px solid ${
                streaming && (onSteer !== undefined || onFollowUp !== undefined)
                  ? 'rgba(234,179,8,0.4)'
                  : 'color-mix(in srgb, var(--border) 70%, transparent)'
              }`,
              borderRadius: 14,
              padding: '10px 10px 10px 14px',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)',
              transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
            }}
          >
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
                minHeight: 24,
                maxHeight: 200,
                overflow: 'auto',
              }}
            />
            {streaming ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                }}
              >
                {onSteer !== undefined && (
                  <button
                    type="button"
                    onClick={onSteer}
                    disabled={!canQueue}
                    title={t('chat.steerHint')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '7px 12px',
                      background: canQueue ? 'rgba(234,179,8,0.12)' : 'none',
                      border: '1px solid rgba(234,179,8,0.35)',
                      borderRadius: 8,
                      color: canQueue ? 'rgba(180,130,0,1)' : 'var(--text-dim)',
                      cursor: canQueue ? 'pointer' : 'not-allowed',
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 1 L9 5 L5 9" />
                      <line x1="1" y1="5" x2="9" y2="5" />
                    </svg>
                    {t('chat.steer')}
                  </button>
                )}
                {onFollowUp !== undefined && (
                  <button
                    type="button"
                    onClick={onFollowUp}
                    disabled={!canQueue}
                    title={t('chat.followUpHint')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '7px 12px',
                      background: canQueue ? 'rgba(129,140,248,0.12)' : 'none',
                      border: '1px solid rgba(129,140,248,0.35)',
                      borderRadius: 8,
                      color: canQueue ? 'rgba(99,102,241,1)' : 'var(--text-dim)',
                      cursor: canQueue ? 'pointer' : 'not-allowed',
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 10 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="5" y1="1" x2="5" y2="6" />
                      <polyline points="2.5 3.5 5 1 7.5 3.5" />
                      <line x1="2" y1="9" x2="8" y2="9" />
                    </svg>
                    {t('chat.followUp')}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={submit}
                title={t('chat.send')}
                aria-label={t('chat.send')}
                disabled={!canSend}
                style={{
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  background: canSend ? 'var(--accent)' : 'var(--bg-panel)',
                  border: 'none',
                  borderRadius: 8,
                  color: canSend ? 'var(--accent-contrast)' : 'var(--text-dim)',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  boxShadow: canSend
                    ? '0 1px 3px color-mix(in srgb, var(--accent) 25%, transparent)'
                    : 'none',
                  transition: 'background 0.15s, box-shadow 0.15s',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="2" y1="7" x2="11" y2="7" />
                  <polyline points="7.5 3 12 7 7.5 11" />
                </svg>
                {t('chat.send')}
              </button>
            )}
          </div>
        </div>

        {/* 底部工具行（设计规范 ChatInput：在输入卡下方 marginTop 8） */}
        {belowInput !== undefined && <div style={{ marginTop: 8 }}>{belowInput}</div>}
      </div>
    </fieldset>
  );
}
