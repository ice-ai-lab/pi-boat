import { ArrowUp, Square } from 'lucide-react';
import { type KeyboardEvent, useCallback, useRef, useState } from 'react';
import { Textarea } from '../primitives/textarea';
import { cn } from '../utils/cn';

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
  mentions?: { label: string; hint?: string }[];
  onPickMention?(index: number): void;
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
  mentionActiveIndex = 0,
  onMentionActiveIndexChange,
  onCaretChange,
}: ComposerProps) {
  const lastSubmitRef = useRef('');
  const mentionOpen = mentions !== undefined && mentions.length > 0;

  const submit = useCallback(() => {
    const text = value.trim();
    if (text.length === 0 || disabled) return;
    lastSubmitRef.current = text;
    onSubmit(text);
    onChange('');
  }, [value, disabled, onSubmit, onChange]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // 提及菜单开着时：上下选、Tab/Enter 确认、Esc 关（不提交）
      if (mentionOpen) {
        const count = mentions?.length ?? 0;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          onMentionActiveIndexChange?.((mentionActiveIndex + step + count) % count);
          return;
        }
        if (event.key === 'Tab' || (event.key === 'Enter' && !event.nativeEvent.isComposing)) {
          event.preventDefault();
          onPickMention?.(mentionActiveIndex);
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
      }
    },
    [
      submit,
      mentionOpen,
      mentions,
      mentionActiveIndex,
      onMentionActiveIndexChange,
      onPickMention,
      onChange,
      value,
    ],
  );

  return (
    <div className="relative shrink-0">
      {mentionOpen && (
        <div
          role="listbox"
          aria-label="文件提及候选"
          className="sq elev-panel absolute bottom-[calc(100%+6px)] left-1/2 z-30 max-h-64 w-(--chat-w) max-w-full -translate-x-1/2 overflow-y-auto bg-menu p-1 backdrop-blur-[40px] scrollbar-thin"
        >
          {mentions?.map((mention, index) => (
            <button
              key={mention.label}
              type="button"
              role="option"
              aria-selected={index === mentionActiveIndex}
              onMouseEnter={() => onMentionActiveIndexChange?.(index)}
              onClick={() => onPickMention?.(index)}
              className={cn(
                'sq flex w-full items-baseline gap-2 px-2 py-1 text-left text-[12.5px]',
                index === mentionActiveIndex
                  ? 'bg-accent-weak text-accent'
                  : 'text-fg-muted hover:bg-hover',
              )}
            >
              <span className="truncate font-mono">{mention.label}</span>
              {mention.hint !== undefined && (
                <span className="ml-auto shrink-0 text-[10.5px] text-fg-faint">{mention.hint}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute -top-8 bottom-0 left-0 right-0 bg-gradient-to-t from-surface to-transparent" />
      <div
        className={cn(
          'sq elev-soft mx-auto flex w-(--chat-w) max-w-full items-end gap-2 bg-surface-raised p-2.5',
        )}
      >
        <Textarea
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            onCaretChange?.(event.target.selectionStart ?? event.target.value.length);
          }}
          onSelect={(event) =>
            onCaretChange?.(event.currentTarget.selectionStart ?? event.currentTarget.value.length)
          }
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="px-1.5 py-1 text-[13.5px] leading-6"
        />
        {streaming ? (
          <button
            type="button"
            onClick={onAbort}
            title="停止"
            aria-label="停止生成"
            className="sq flex h-8 w-8 shrink-0 items-center justify-center bg-surface-side text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            title="发送"
            aria-label="发送消息"
            disabled={disabled || value.trim().length === 0}
            className="sq flex h-8 w-8 shrink-0 items-center justify-center bg-accent text-white transition-opacity hover:bg-accent/90 disabled:opacity-40"
          >
            <ArrowUp size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
