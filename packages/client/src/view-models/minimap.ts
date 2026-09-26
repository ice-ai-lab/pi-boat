import type { Turn } from '../stream/view-model';

/**
 * 消息 minimap（A 类按设计规范 components/ChatMinimap.tsx 的几何算法）：
 * 每个 turn 一条 bar，视口覆盖区间标为 at 态。
 */
export interface MinimapBar {
  index: number;
  /** 该轮的语义色（错误/停止/进行中/普通） */
  tone: 'error' | 'stopped' | 'streaming' | 'normal';
  /** 用户消息摘要（hover tip 预览） */
  preview: string;
  /** 是否落在当前视口内 */
  active: boolean;
}

export function turnTone(turn: Turn): MinimapBar['tone'] {
  if (turn.status === 'error') return 'error';
  if (turn.status === 'stopped') return 'stopped';
  if (turn.status === 'streaming') return 'streaming';
  return 'normal';
}

/** 视口覆盖的 turn 区间（`scrollTop/total` 到 `(scrollTop+clientHeight)/total`） */
export function activeRange(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  turnCount: number,
): { start: number; end: number } {
  if (scrollHeight <= 0 || turnCount <= 0) return { start: 0, end: turnCount };
  const ratio = turnCount / scrollHeight;
  const start = Math.max(0, Math.min(turnCount - 1, Math.floor(scrollTop * ratio)));
  const end = Math.min(
    turnCount,
    Math.max(start + 1, Math.ceil((scrollTop + clientHeight) * ratio)),
  );
  return { start, end };
}

export function buildMinimapBars(
  turns: readonly Turn[],
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): MinimapBar[] {
  const range = activeRange(scrollTop, clientHeight, scrollHeight, turns.length);
  return turns.map((turn, index) => ({
    index,
    tone: turnTone(turn),
    preview: turn.user.text.replace(/\s+/g, ' ').slice(0, 120) || '(无用户消息)',
    active: index >= range.start && index < range.end,
  }));
}

/** 点击某条 bar 应滚到的位置（按 turn 均匀近似：几何一致，误差随内容长度分布） */
export function scrollTopForBar(
  index: number,
  turnCount: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  if (turnCount <= 0) return 0;
  const target = (index / turnCount) * scrollHeight;
  return Math.max(0, Math.min(scrollHeight - clientHeight, target));
}
