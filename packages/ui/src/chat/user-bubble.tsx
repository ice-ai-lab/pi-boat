import type { Turn } from '@ice-ai/client';
import { cn } from '../lib/cn';
import { formatClock } from '../lib/format';

/** `.msg-user` + `.bub` + `.tm`（原型用户气泡） */
export interface UserBubbleProps {
  turn: Turn;
  className?: string;
}

export function UserBubble({ turn, className }: UserBubbleProps) {
  if (turn.user.text === '' && turn.user.images === undefined) return null;
  return (
    <div className={cn('flex max-w-[72%] flex-col items-end self-end', className)}>
      <div className="bub sq">
        {turn.user.images === undefined
          ? null
          : turn.user.images.map((src, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 图片顺序即身份
              <img key={index} src={src} alt="附件" className="mb-2 max-w-full rounded-lg" />
            ))}
        {turn.user.text}
      </div>
      {turn.user.at === 0 ? null : (
        <div className="mt-[5px] text-[10px] tabular-nums text-fg-faint">
          {formatClock(turn.user.at)}
        </div>
      )}
    </div>
  );
}
