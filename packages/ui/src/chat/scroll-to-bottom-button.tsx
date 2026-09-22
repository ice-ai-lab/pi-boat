import { Icon } from '../primitives/icon';

/** 「回到底部」（原型未画，M1 新增件，docs/06 §8.2）：圆形按钮 + 下箭头 */
export interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
  className?: string;
}

export function ScrollToBottomButton({ visible, onClick, className }: ScrollToBottomButtonProps) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="回到底部"
      title="回到底部"
      className={`absolute bottom-4 right-4 z-10 grid size-9 place-items-center rounded-full bg-surface-raised text-fg-muted shadow-soft transition-colors hover:text-fg ${className ?? ''}`}
    >
      <Icon name="chev-d" size={16} />
    </button>
  );
}
