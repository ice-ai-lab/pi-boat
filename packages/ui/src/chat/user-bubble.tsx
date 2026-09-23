import type { Turn } from '@ice-ai/client';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { formatClock } from '../lib/format';
import { Icon } from '../primitives/icon';

/**
 * `.u-row` + `.u-wrap` + `.u-bubble` + `.u-meta`（原型用户气泡：右对齐、暖白底、
 * 悬停浮现操作钮 copy / 从此编辑 / 分支）。
 *
 * `onEditFromHere` / `onBranch` M1 后端未提供，缺省不渲染对应按钮；
 * 复制默认可用（前端本地能力）。
 */
export interface UserBubbleProps {
  turn: Turn;
  onEditFromHere?: () => void;
  onBranch?: () => void;
  className?: string;
}

export function UserBubble({ turn, onEditFromHere, onBranch, className }: UserBubbleProps) {
  const [copied, setCopied] = useState(false);
  if (turn.user.text === '' && turn.user.images === undefined) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.user.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 剪贴板不可用（非安全上下文）：静默 */
    }
  };

  return (
    <div className={cn('u-row', className)}>
      <div className="u-wrap">
        <div className="u-bubble">
          {turn.user.images === undefined
            ? null
            : turn.user.images.map((src, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 图片顺序即身份
                <img key={index} src={src} alt="附件" className="u-img" />
              ))}
          {turn.user.text}
        </div>
        {turn.user.at === 0 ? null : (
          <div className="u-meta">
            <span className="acts">
              <button type="button" className="mini-btn" onClick={() => void copy()}>
                <Icon name={copied ? 'check' : 'copy'} />
                {copied ? '已复制' : '复制'}
              </button>
              {onEditFromHere === undefined ? null : (
                <button type="button" className="mini-btn" onClick={onEditFromHere}>
                  <Icon name="edit" />
                  从此编辑
                </button>
              )}
              {onBranch === undefined ? null : (
                <button type="button" className="mini-btn" onClick={onBranch}>
                  <Icon name="fork" />
                  分支
                </button>
              )}
            </span>
            <span className="num">{formatClock(turn.user.at)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
