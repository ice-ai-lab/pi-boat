import type { ModelRef } from '@ice-ai/protocol';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';
import { Textarea } from '../primitives/textarea';
import { ModeChip, type ToolPreset } from './mode-chip';
import { ModelBadge } from './model-badge';

/**
 * 输入卡（原型 `.composer-seat` + `.composer-inner` + `.input-card` + `.ctl-row` + `.send-btn`）。
 * - 自动增高 26–168px、Enter 发送 / Shift+Enter 换行（Textarea 内）
 * - `streaming` 时发送按钮变停止（`abort`）；idle 且空文本时禁用
 * - `.ctl-row`：附件按钮（默认）→ 模式 chip → 模型 chip → spacer → extras → 发送/停止
 * - `stats` 插槽渲染 `.stats`（原型放在 `.composer-inner` 内、输入卡下方）
 * - `queue` 插槽渲染 `.queue`（消息队列行，M2；M1 不传）
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
  /** 输入卡下方的统计（原型 `.stats`） */
  stats?: ReactNode;
  /** 附件等前置动作插槽（默认渲染 `.ctl-btn` 附件占位） */
  actions?: ReactNode;
  /** spacer 与发送钮之间的扩展位（思考/工具等 `.ctl-btn`，M2 接线） */
  extras?: ReactNode;
  /** 消息队列行（原型 `.queue`，M2） */
  queue?: ReactNode;
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
  placeholder = '继续对话…（Enter 发送，Shift+Enter 换行）',
  className,
  stats,
  actions,
  extras,
  queue,
}: ComposerProps) {
  const canSend = !disabled && value.trim() !== '';
  return (
    <div className={cn('composer-seat', className)}>
      <div className="composer-inner">
        {queue}
        <div className="input-card">
          <Textarea
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
            aria-label="消息"
            disabled={disabled}
          />
          <div className="ctl-row">
            {actions ?? (
              <button type="button" className="ctl-btn" title="附件（M2）" disabled>
                <Icon name="clip" />
              </button>
            )}
            <ModeChip
              mode={mode}
              {...(modeOptions === undefined ? {} : { options: modeOptions })}
              {...(onModeChange === undefined ? {} : { onChange: onModeChange })}
            />
            <ModelBadge model={model} />
            {/* 原型此处是行内 style="flex:1"（v4 已从 CSS 里撤掉 .spacer） */}
            <span style={{ flex: 1 }} />
            {extras}
            <button
              type="button"
              className={cn('send-btn', streaming && 'stop')}
              title={streaming ? '停止' : '发送'}
              aria-label={streaming ? '停止' : '发送'}
              disabled={streaming ? false : !canSend}
              onClick={streaming ? onAbort : onSubmit}
            >
              <Icon name={streaming ? 'stop' : 'up'} size={15} />
            </button>
          </div>
        </div>
        {stats}
      </div>
    </div>
  );
}
