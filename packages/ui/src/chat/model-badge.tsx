import type { ModelRef } from '@ice-ai/protocol';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/**
 * `.mline`（原型助手回答前的模型行：`GLM-5.3 · thinking low`，等宽 11px）。
 * 流式时由调用方叠加 `.shimmer`。
 */
export function ModelTag({
  model,
  thinkingLabel,
  badges,
  shimmer,
  className,
}: {
  model: ModelRef | null;
  /** 思考档位展示（如 `thinking low`；缺省只显示模型名） */
  thinkingLabel?: string;
  /** 流式徽标插槽（`.badges`：缓存命中 / 速度） */
  badges?: React.ReactNode;
  /** 流式态：文字扫光 */
  shimmer?: boolean;
  className?: string;
}) {
  if (model === null) return null;
  return (
    <div className={cn('mline', shimmer && 'shimmer', className)}>
      {model.modelId}
      {thinkingLabel === undefined ? null : ` · ${thinkingLabel}`}
      {badges === undefined ? null : <span className="badges">{badges}</span>}
    </div>
  );
}

/** `.ctl-chip.model`（输入卡 ctl 行的模型 chip；M1 只展示，切换在 M2） */
export interface ModelBadgeProps {
  model: ModelRef | null;
  onClick?: () => void;
  className?: string;
}

export function ModelBadge({ model, onClick, className }: ModelBadgeProps) {
  return (
    <button
      type="button"
      title={
        model === null ? '模型（M2 支持切换）' : `${model.provider}/${model.modelId}（M2 支持切换）`
      }
      onClick={onClick}
      disabled={onClick === undefined}
      className={cn('ctl-chip model', className)}
    >
      {model?.modelId ?? '默认模型'}
      <Icon name="chev" size={10} style={{ transform: 'rotate(90deg)' }} />
    </button>
  );
}
