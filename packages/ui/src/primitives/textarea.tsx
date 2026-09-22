import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

/** 自动增高：min-height 24px / max-height 200px（原型 `.input-card textarea` + `fit()`） */
export interface TextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  maxHeightPx?: number;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}

export function Textarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  maxHeightPx = 200,
  disabled,
  className,
  autoFocus,
  ...rest
}: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const autoGrow = useCallback(() => {
    const el = ref.current;
    if (el === null) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
  }, [maxHeightPx]);

  // 每次渲染都重新量高度：高度必须跟随 value 变化（无依赖数组 = 不与"多余依赖"规则互相别扭）
  useLayoutEffect(() => {
    autoGrow();
  });
  useEffect(() => {
    if (autoFocus === true) ref.current?.focus();
  }, [autoFocus]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={rest['aria-label'] ?? placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        // Enter 发送 / Shift+Enter 换行（原型脚本行为）
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onSubmit?.();
        }
      }}
      className={`w-full resize-none border-0 bg-transparent text-[14px] leading-[22px] text-fg outline-none placeholder:text-fg-faint ${className ?? ''}`}
      style={{ minHeight: 24, maxHeight: maxHeightPx }}
    />
  );
}
