import { ArrowUp, Square } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useRef } from 'react';
import { Textarea } from '../primitives/textarea';
import { type SuggestionItem, SuggestionMenu } from './suggestion-menu';

/**
 * Composer（docs/06 §4.2）：sticky 输入卡 + 渐变淡入 + 发送↔停止。
 * Enter 发送 / Shift+Enter 换行（docs/06 §8.6）；流式中可排队追问（F5 接 queue UI）。
 */
export interface ComposerProps {
  value: string;
  onChange(value: string): void;
  onSubmit(text: string): void;
  onAbort(): void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
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
  /** ↑ 历史上翻（仅有历史时由宿主提供） */
  onHistoryPrev?(): void;
  /** ↓ 历史下翻 */
  onHistoryNext?(): void;
  /** 键盘上下键在候选间移动（web 层持有选中下标） */
  mentionActiveIndex?: number;
  onMentionActiveIndexChange?(index: number): void;
  /** 光标位置回传（`@` 提及需要「光标前的文本」而不是整段） */
  onCaretChange?(caret: number): void;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onAbort,
  streaming,
  disabled = false,
  placeholder = '给 PiBoat 发消息…（Enter 发送，Shift+Enter 换行）',
  mentions,
  onPickMention,
  slashCommands,
  onPickSlashCommand,
  aboveInput,
  belowInput,
  onHistoryPrev,
  onHistoryNext,
  mentionActiveIndex = 0,
  onMentionActiveIndexChange,
  onCaretChange,
}: ComposerProps) {
  const lastSubmitRef = useRef('');
  const mentionOpen = mentions !== undefined && mentions.length > 0;
  const slashOpen = !mentionOpen && slashCommands !== undefined && slashCommands.length > 0;
  const menuOpen = mentionOpen || slashOpen;

  const submit = useCallback(() => {
    const text = value.trim();
    if (text.length === 0 || disabled) return;
    lastSubmitRef.current = text;
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
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submit();
        return;
      }
      // ↑↓：光标在首/末行时才接管（否则让用户在多行文本里移动）
      const textarea = event.currentTarget;
      const textareaValue = textarea.value;
      const caret = textarea.selectionStart ?? 0;
      if (event.key === 'ArrowUp' && onHistoryPrev !== undefined) {
        if (!textareaValue.slice(0, caret).includes('\n')) {
          event.preventDefault();
          onHistoryPrev();
        }
        return;
      }
      if (event.key === 'ArrowDown' && onHistoryNext !== undefined) {
        if (!textareaValue.slice(caret).includes('\n')) {
          event.preventDefault();
          onHistoryNext();
        }
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
      onHistoryPrev,
      onHistoryNext,
      onChange,
      value,
    ],
  );

  return (
    <div className="relative shrink-0" style={{ padding: '0 16px 8px' }}>
      {aboveInput}
      {mentionOpen && (
        <SuggestionMenu
          title="文件"
          items={mentions ?? []}
          activeIndex={mentionActiveIndex}
          onPick={(index) => onPickMention?.(index)}
          onHover={(index) => onMentionActiveIndexChange?.(index)}
          emptyHint="没有匹配的文件"
        />
      )}
      {slashOpen && (
        <SuggestionMenu
          title="命令"
          items={slashCommands ?? []}
          activeIndex={mentionActiveIndex}
          onPick={(index) => onPickSlashCommand?.(index)}
          onHover={(index) => onMentionActiveIndexChange?.(index)}
          emptyHint="没有匹配的命令"
        />
      )}
      <div style={{ maxWidth: 'var(--chat-content-max-width, 820px)', margin: '0 auto' }}>
        {/* 输入卡：设计规范 ChatInput 的 14px 圆角卡 + 10/14 内边距 + 轻阴影 */}
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg)',
            border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
            borderRadius: 14,
            padding: '10px 10px 10px 14px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)',
            transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
          }}
        >
          <Textarea
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
              onCaretChange?.(event.target.selectionStart ?? event.target.value.length);
            }}
            onSelect={(event) =>
              onCaretChange?.(
                event.currentTarget.selectionStart ?? event.currentTarget.value.length,
              )
            }
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="chat-input-textarea"
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
            <button
              type="button"
              onClick={onAbort}
              title="停止"
              aria-label="停止生成"
              style={{
                flexShrink: 0,
                alignSelf: 'flex-end',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                background: 'rgba(234,179,8,0.12)',
                border: '1px solid rgba(234,179,8,0.35)',
                borderRadius: 8,
                color: 'rgba(180,130,0,1)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Square size={12} fill="currentColor" />
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              title="发送"
              aria-label="发送消息"
              disabled={disabled || value.trim().length === 0}
              style={{
                flexShrink: 0,
                alignSelf: 'flex-end',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                background:
                  !disabled && value.trim().length > 0 ? 'var(--accent)' : 'var(--bg-panel)',
                border: 'none',
                borderRadius: 8,
                color:
                  !disabled && value.trim().length > 0
                    ? 'var(--accent-contrast)'
                    : 'var(--text-dim)',
                cursor: !disabled && value.trim().length > 0 ? 'pointer' : 'not-allowed',
                fontSize: 13,
                fontWeight: 600,
                boxShadow:
                  !disabled && value.trim().length > 0
                    ? '0 1px 3px color-mix(in srgb, var(--accent) 25%, transparent)'
                    : 'none',
                transition: 'background 0.15s, box-shadow 0.15s',
              }}
            >
              <ArrowUp size={14} />
              发送
            </button>
          )}
        </div>
        {/* 底部工具行（设计规范 ChatInput：在输入卡下方 marginTop 8） */}
        {belowInput !== undefined && <div style={{ marginTop: 8 }}>{belowInput}</div>}
      </div>
    </div>
  );
}
