import { cn } from '../lib/cn';

/** `.preset-seg` / `.view-tabs`（docs/06 §4.1） */
export interface SegmentedItem<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  items: readonly SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** true = 原型 `.view-tabs` 的下划线样式；false = `.preset-seg` 的滑块样式 */
  variant?: 'segmented' | 'tabs';
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  className,
  variant = 'segmented',
}: SegmentedControlProps<T>) {
  if (variant === 'tabs') {
    return (
      <div role="tablist" className={cn('flex h-full items-stretch gap-6', className)}>
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              title={item.title}
              onClick={() => onChange(item.value)}
              className={cn(
                'relative flex items-center px-0.5 text-[13px] font-medium transition-colors',
                active
                  ? 'text-accent after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm after:bg-accent'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <fieldset
      aria-label="分段选择"
      className={cn('m-0 flex min-w-0 gap-0.5 rounded-[9px] border-0 bg-hover p-0.5', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            title={item.title}
            onClick={() => onChange(item.value)}
            className={cn(
              'h-[26px] flex-1 rounded-[7px] font-mono text-[11.5px] transition-colors',
              active
                ? 'bg-surface-raised text-fg shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </fieldset>
  );
}
