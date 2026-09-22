import { useState } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * 输入卡「模式」（原型 `.mode-chip` + `.mode-menu`，docs/06 §4.2 警告）。
 *
 * ⚠️ 「模式」与工具预设**已合并为同一概念**（2026-09-22 决策，docs/02 §11.1）：
 * 菜单项就是四项工具预设，原型的「全自动·免确认」已删除（SDK 0.85 无此能力）。
 * 预设判定归 **core**（只有 core 知道 SDK 默认工具集），因此 M1 只展示当前值：
 * 不传 `options` 时渲染为只读胶囊（M2 接 `set_tools` 后由 app 传 options + onChange）。
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
        className={cn(
          'inline-flex h-7 flex-none cursor-default items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-muted',
          className,
        )}
      >
        <Icon name="chev-d" size={10} />
        {current.label}
      </span>
    );
  }

  return (
    <div className="relative flex-none">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-muted hover:bg-hover',
          className,
        )}
      >
        <Icon name="chev-d" size={10} />
        {current.label}
      </button>
      {open ? (
        <div
          role="menu"
          className="glass absolute bottom-[calc(100%+6px)] left-3.5 z-[60] w-[180px] rounded-xl p-1.5 shadow-panel"
        >
          {options.map((option) => {
            const item = PRESET_LABELS[option];
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={option === mode}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-[7px] text-[13px] text-fg hover:bg-hover"
              >
                <span>{item.label}</span>
                {option === mode ? (
                  <Icon name="check" size={14} className="text-accent" />
                ) : (
                  <small className="text-[11px] text-fg-faint">{item.hint}</small>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
