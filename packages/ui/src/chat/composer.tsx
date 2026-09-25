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
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onAbort,
  streaming,
  disabled = false,
  placeholder = '给 PiBoat 发消息…（Enter 发送，Shift+Enter 换行）',
}: ComposerProps) {
  const lastSubmitRef = useRef('');

  const submit = useCallback(() => {
    const text = value.trim();
    if (text.length === 0 || disabled) return;
    lastSubmitRef.current = text;
    onSubmit(text);
    onChange('');
  }, [value, disabled, onSubmit, onChange]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  return (
    <div className="relative shrink-0">
      <div className="pointer-events-none absolute -top-8 bottom-0 left-0 right-0 bg-gradient-to-t from-surface to-transparent" />
      <div
        className={cn(
          'sq elev-soft mx-auto flex w-(--chat-w) max-w-full items-end gap-2 bg-surface-raised p-2.5',
        )}
      >
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
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
