import type { ModelRef } from '@ice-ai/protocol';
import { cn } from '../lib/cn';
import { Button, IconButton } from '../primitives/button';
import { Icon } from '../primitives/icon';
import { Textarea } from '../primitives/textarea';
import { ModeChip, type ToolPreset } from './mode-chip';
import { ModelBadge } from './model-badge';

/**
 * 输入卡（原型 `.composer-seat` + `.input-card` + 发送↔停止，docs/06 §4.2）。
 * - 自动增高 24–200px、Enter 发送 / Shift+Enter 换行（Textarea 内）
 * - `streaming` 时发送按钮变停止（`abort`）；idle 且空文本时禁用
 * - 模式胶囊与工具预设是同一状态（docs/02 §11.1 合并决策）
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
  /** 附加动作插槽（图片按钮等） */
  actions?: React.ReactNode;
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
  actions,
}: ComposerProps) {
  const canSend = !disabled && value.trim() !== '';
  return (
    <div className={cn('relative px-6 pb-3', className)}>
      {/* 渐变淡入遮罩（原型 .composer-seat::before） */}
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-9 bg-gradient-to-b from-transparent to-surface" />
      <div className="mx-auto w-full" style={{ maxWidth: 'var(--chat-w, 760px)' }}>
        <div className="input-card sq rounded-[14px] bg-surface-raised p-2.5 pb-2 pl-3.5 shadow-soft-sm transition-shadow focus-within:shadow-[0_0_0_0.5px_var(--line-2),0_0_0_3px_var(--accent-weak)]">
          <Textarea
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            disabled={disabled}
          />
          <div className="mt-1.5 flex items-center gap-2">
            {actions ?? (
              <IconButton icon="img" title="添加图片（M2）" disabled className="opacity-40" />
            )}
            <ModeChip
              mode={mode}
              {...(modeOptions === undefined ? {} : { options: modeOptions })}
              {...(onModeChange === undefined ? {} : { onChange: onModeChange })}
            />
            <span className="flex-1" />
            <ModelBadge model={model} />
            {streaming ? (
              <Button
                variant="send"
                size="md"
                title="停止"
                aria-label="停止"
                onClick={onAbort}
                className="bg-fg"
              >
                <Icon name="stop" size={14} strokeWidth={0} />
              </Button>
            ) : (
              <Button
                variant="send"
                size="md"
                title="发送"
                aria-label="发送"
                disabled={!canSend}
                onClick={onSubmit}
              >
                <Icon name="send" size={18} strokeWidth={2} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
