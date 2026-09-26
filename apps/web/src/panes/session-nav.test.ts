import { describe, expect, it } from 'vitest';
import { decideSessionNav } from './session-nav';

/**
 * 回归锁定（2026-09-26 严重 bug：切换会话后两个会话无限互切）。
 *
 * 起因：URL → 会话、会话 → URL 两个 effect 在同一个提交里互相覆盖。用户点会话 B 时
 * state 还是 A，② 把 URL 写回 A，`open(B)` 完成又写回 B，① 再 `open(A)`……永不收敛。
 */
describe('decideSessionNav', () => {
  it('用户点另一个会话：一律 open(URL)，不许把当前会话写回 URL（回归根因）', () => {
    expect(decideSessionNav({ urlSessionId: 'B', sessionId: 'A', selfInitiated: false })).toEqual({
      kind: 'open',
      sessionId: 'B',
    });
  });

  it('用户点另一个会话过程中（state 已切到 B、URL 仍是 A 之外的另一值）不反向覆盖', () => {
    // open(B) 完成、URL 仍是 B：一致 → 什么都不做
    expect(decideSessionNav({ urlSessionId: 'B', sessionId: 'B', selfInitiated: false })).toEqual({
      kind: 'none',
    });
  });

  it('空态建会话：会话先行，补写 URL', () => {
    expect(decideSessionNav({ urlSessionId: null, sessionId: 'new', selfInitiated: true })).toEqual(
      {
        kind: 'writeUrl',
        sessionId: 'new',
      },
    );
  });

  it('本组件发起的切换（fork 形态）：URL 还是旧会话 → 补写新 id', () => {
    expect(
      decideSessionNav({ urlSessionId: 'old', sessionId: 'new', selfInitiated: true }),
    ).toEqual({
      kind: 'writeUrl',
      sessionId: 'new',
    });
  });

  it('「新建会话」按钮：URL 空 + state 有会话 → reset', () => {
    expect(decideSessionNav({ urlSessionId: null, sessionId: 'A', selfInitiated: false })).toEqual({
      kind: 'reset',
    });
  });

  it('首次打开会话（state 还没建）：open(URL)', () => {
    expect(decideSessionNav({ urlSessionId: 'A', sessionId: null, selfInitiated: false })).toEqual({
      kind: 'open',
      sessionId: 'A',
    });
  });

  it('什么都没选 / 建会话失败：不动', () => {
    expect(decideSessionNav({ urlSessionId: null, sessionId: null, selfInitiated: false })).toEqual(
      {
        kind: 'none',
      },
    );
    expect(decideSessionNav({ urlSessionId: null, sessionId: null, selfInitiated: true })).toEqual({
      kind: 'none',
    });
  });
});
