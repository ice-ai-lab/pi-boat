import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** `.sw` + `.on`（原型开关：29×17 轨道、13px 圆钮 `::after`，开=accent 填充） */
export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'role'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
}

export function Switch({ checked, onCheckedChange, label, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn('sw', checked && 'on', className)}
      {...rest}
    />
  );
}
