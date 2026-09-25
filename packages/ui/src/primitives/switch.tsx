/** Switch（primitives，docs/06 §4.1）：原型 `.switch[data-tool]` */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  disabled?: boolean;
  label?: string;
}

export function Switch({ checked, onCheckedChange, disabled = false, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={
        checked
          ? 'sq relative h-5 w-9 shrink-0 bg-accent transition-colors disabled:opacity-50'
          : 'sq relative h-5 w-9 shrink-0 bg-line-3 transition-colors disabled:opacity-50'
      }
    >
      <span
        aria-hidden
        className={
          checked
            ? 'absolute top-0.5 left-4.5 h-4 w-4 rounded-full bg-white transition-all'
            : 'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-all'
        }
      />
    </button>
  );
}
