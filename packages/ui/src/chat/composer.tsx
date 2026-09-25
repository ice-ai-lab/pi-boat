import { ArrowUp, Square } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useCallback, useRef } from 'react';
import { Textarea } from '../primitives/textarea';
import { cn } from '../utils/cn';
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
    <div className="relative shrink-0">
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
