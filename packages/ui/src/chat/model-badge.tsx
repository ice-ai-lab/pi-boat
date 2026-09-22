import type { ModelRef } from '@ice-ai/protocol';
import { cn } from '../lib/cn';
import { Icon } from '../primitives/icon';

/** `.model-tag`（原型助手消息上方的模型名 + 圆点） */
export function ModelTag({ model, className }: { model: ModelRef | null; className?: string }) {
  if (model === null) return null;
  return (
    <div className={cn('model-tag', className)}>
      <span className="dot" />
      {model.modelId}
    </div>
  );
}

/** `.model-btn`（输入卡右侧的模型切换入口；M1 只展示，切换在 M2） */
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
      className={cn('model-btn', className)}
    >
      {model?.modelId ?? '默认模型'}
      <Icon name="chev-d" size={12} style={{ width: 10, height: 10 }} />
    </button>
  );
}
