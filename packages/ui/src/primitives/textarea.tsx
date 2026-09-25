import { type TextareaHTMLAttributes, useEffect, useRef } from 'react';
import { cn } from '../utils/cn';

/** 自动增高的夹取（docs/06 §8.6：min 24px / max 200px）——纯函数，供测试 */
export function clampTextareaHeight(scrollHeight: number): number {
  return Math.min(Math.max(scrollHeight, 24), 200);
}

/** Textarea（docs/06 §4.1）：原型 .input-card textarea + fit()；Enter/Shift+Enter 语义归调用方 */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** 输入时自动增高（默认开）；关闭则保持调用方给定的行高 */
  autoGrow?: boolean;
}

export function Textarea({ autoGrow = true, className, value, ...rest }: TextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // value 是受控值变化的触发器（程序化设值 / 草稿恢复时重算高度），非体内读取
  // biome-ignore lint/correctness/useExhaustiveDependencies: 见上行说明
  useEffect(() => {
    const el = ref.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    el.style.height = `${clampTextareaHeight(el.scrollHeight)}px`;
  }, [autoGrow, value]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={cn(
        'w-full resize-none bg-transparent text-fg outline-none placeholder:text-fg-faint',
        className,
      )}
      {...rest}
    />
  );
}
