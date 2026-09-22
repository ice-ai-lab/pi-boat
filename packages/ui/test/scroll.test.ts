import { describe, expect, it } from 'vitest';
import {
  getLiveFollowAttached,
  isAtBottom,
  REATTACH_TOLERANCE,
  shouldShowScrollToLatest,
  TAIL_TOLERANCE,
} from '../src/hooks/use-auto-scroll';

/**
 * 滚动吸附模型（docs/06 §8.2）：纯函数必须单测——它是「自动回底 vs 用户上滚脱离」
 * 的唯一判定处，写错会导致流式期间不断把用户拽回底部。
 */

const viewport = { clientHeight: 500, scrollHeight: 2_000 };

describe('isAtBottom', () => {
  it('贴底容差 8px', () => {
    expect(TAIL_TOLERANCE).toBe(8);
    expect(isAtBottom({ ...viewport, scrollTop: 1_500 })).toBe(true);
    expect(isAtBottom({ ...viewport, scrollTop: 1_492 })).toBe(true);
    expect(isAtBottom({ ...viewport, scrollTop: 1_490 })).toBe(false);
  });
});

describe('getLiveFollowAttached', () => {
  it('① 贴底 → 吸附', () => {
    expect(getLiveFollowAttached(false, 0, 1_500, viewport)).toBe(true);
  });

  it('② 向上滚 → 立即脱离（贴底容差内仍算贴底，超出即脱离）', () => {
    // 1px 仍在 8px 容差内 → 仍贴底（物理上就是"在底部"）
    expect(getLiveFollowAttached(true, 1_500, 1_499, viewport)).toBe(true);
    expect(getLiveFollowAttached(true, 1_400, 1_399, viewport)).toBe(false);
  });

  it('③ 未吸附但向下滚进 96px 内 → 重新吸附', () => {
    expect(REATTACH_TOLERANCE).toBe(96);
    expect(getLiveFollowAttached(false, 1_000, 1_405, viewport)).toBe(true);
    expect(getLiveFollowAttached(false, 1_000, 1_300, viewport)).toBe(false);
  });

  it('④ 其余情况保持原状态（内容增长不会误吸附）', () => {
    // 仍在底部附近但位置不变（内容增长把 scrollHeight 撑大，scrollTop 不动）
    expect(getLiveFollowAttached(true, 1_400, 1_400, { ...viewport, scrollHeight: 4_000 })).toBe(
      true,
    );
    expect(getLiveFollowAttached(false, 1_400, 1_400, viewport)).toBe(false);
  });
});

describe('shouldShowScrollToLatest', () => {
  it('内容溢出且未贴底才显示', () => {
    expect(shouldShowScrollToLatest({ ...viewport, scrollTop: 100 })).toBe(true);
    expect(shouldShowScrollToLatest({ ...viewport, scrollTop: 1_500 })).toBe(false);
    expect(shouldShowScrollToLatest({ clientHeight: 500, scrollHeight: 400, scrollTop: 0 })).toBe(
      false,
    );
  });
});
