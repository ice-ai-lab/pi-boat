import type { ModelRef } from '@ice-ai/protocol';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';
import { Textarea } from '../primitives/textarea';
import { ModeChip, type ToolPreset } from './mode-chip';
import { ModelBadge } from './model-badge';

/**
 * 输入卡（原型 `.composer-seat` + `.composer` + `.input-card` + 发送↔停止）。
 * - 自动增高 24–200px、Enter 发送 / Shift+Enter 换行（Textarea 内）
 * - `streaming` 时发送按钮变停止（`abort`）；idle 且空文本时禁用
 * - `stats` 插槽渲染 `.stats-row`（原型把它放在输入卡下方、`.composer` 内）
 */
export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onAbort: () => void;
  streaming: boolean;
  model?: ModelRef | null;
  mode?: ToolPreset;
  modeOptions?: readonly ToolPreset[];
  onModeChange?: (mode: ToolPreset) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** 输入卡下方的统计 pills（原型 `.stats-row`） */
  stats?: ReactNode;
  /** 附加动作插槽（图片按钮等） */
  actions?: ReactNode;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onAbort,
  streaming,
  model = null,
  mode = 'default',
  modeOptions,
  onModeChange,
  disabled = false,
  placeholder = '消息… 输入 / 使用命令',
  className,
  stats,
  actions,
}: ComposerProps) {
  const canSend = !disabled && value.trim() !== '';
  return (
    <div className={cn('composer-seat', className)}>
      <div className="composer">
        <div className="input-card sq">
          <Textarea
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            disabled={disabled}
          />
          <div className="composer-actions">
            {actions ?? (
              <button type="button" className="cbtn sq" title="添加图片（M2）" disabled>
                <Icon name="img" size={18} />
              </button>
            )}
            <ModeChip
              mode={mode}
              {...(modeOptions === undefined ? {} : { options: modeOptions })}
              {...(onModeChange === undefined ? {} : { onChange: onModeChange })}
            />
            <span className="spacer" />
            <ModelBadge model={model} />
            <button
              type="button"
              className={cn('send-btn sq', streaming && 'stop')}
              title={streaming ? '停止' : '发送'}
              aria-label={streaming ? '停止' : '发送'}
              disabled={streaming ? false : !canSend}
              onClick={streaming ? onAbort : onSubmit}
            >
              <Icon name={streaming ? 'stop' : 'send'} size={18} />
            </button>
          </div>
        </div>
        {stats}
      </div>
    </div>
  );
}
