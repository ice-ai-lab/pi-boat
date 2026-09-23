import { useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 输入卡「模式」（原型 `.ctl-chip` + `.mode-menu` + `.mi`）。
 *
 * ⚠️ 「模式」与工具预设**已合并为同一概念**：菜单项就是工具预设，
 * 原型的「全自动·免确认」已删除（SDK 0.85 无此能力）。预设判定归 **core**，
 * 因此 M1 只展示当前值：不传 `options` 时渲染为只读胶囊。
 *
 * 菜单是 `.input-card` 的绝对定位子元素（原型同款）：这里不套 relative 包裹层，
 * 让 `position:absolute` 直接对齐到最近的定位祖先 `.input-card`。
 */
export type ToolPreset = 'chat-only' | 'read-only' | 'default' | 'full';

const PRESET_LABELS: Record<ToolPreset, { label: string; hint: string }> = {
  'chat-only': { label: '纯聊天', hint: '不启用任何工具' },
  'read-only': { label: '只读', hint: '仅 read / grep / find' },
  default: { label: '默认', hint: 'SDK 默认工具集' },
  full: { label: '全部', hint: '启用全部内置工具' },
};

export interface ModeChipProps {
  mode: ToolPreset;
  options?: readonly ToolPreset[];
  onChange?: (mode: ToolPreset) => void;
  className?: string;
}

export function ModeChip({ mode, options, onChange, className }: ModeChipProps) {
  const [open, setOpen] = useState(false);
  const interactive = options !== undefined && onChange !== undefined;
  const current = PRESET_LABELS[mode];

  if (!interactive) {
    return (
      <span
        title={`工具预设：${current.label}（${current.hint}）· M2 支持切换`}
        className={cn('ctl-chip', className)}
      >
        {current.label}
        <Icon name="chev" size={10} style={{ transform: 'rotate(90deg)' }} />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className={cn('ctl-chip', className)}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        {current.label}
        <Icon name="chev" size={10} style={{ transform: 'rotate(90deg)' }} />
      </button>
      {open ? (
        <div className="mode-menu" role="menu">
          {options.map((option) => {
            const item = PRESET_LABELS[option];
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === mode}
                className={cn('mi', option === mode && 'on')}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {item.label}
                {option === mode ? (
                  <span className="chk">
                    <Icon name="check" size={14} />
                  </span>
                ) : (
                  <small>{item.hint}</small>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
