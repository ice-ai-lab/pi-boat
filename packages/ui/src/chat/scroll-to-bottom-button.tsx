import { Icon } from '../primitives/icon';

/** 「回到底部」（原型未画，M1 新增件 `.up-fab`，docs/06 §8.2）：毛玻璃圆钮 + 下箭头 */
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
      className={`up-fab ${className ?? ''}`}
    >
      <Icon name="chev-d" size={15} />
    </button>
  );
}
