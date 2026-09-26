// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/http';
import { dispatchWithRevive } from '../src/react/use-agent-session';

/**
 * 「会话已被回收 → 自愈重发」的顺序（use-agent-session.ts 的 404 路径）。
 *
 * 背景：server 重启 / idle 回收之后，注册表里没有这个会话，
 * `POST /api/agent/:id` 会回 404 —— 重试同一份请求永远不会成功，必须先 revive
 * （resume + 重建历史 + 重置事件流），否则用户刚发的那句话就静默丢了
 * （composer 已清空，界面上只剩一个「Session not found」，2026-09-26）。
 */
describe('dispatchWithRevive', () => {
  it('404 → 先 revive 再重发一次，重发成功即返回', async () => {
    const calls: string[] = [];
    let attempt = 0;
    const dispatch = async (): Promise<string> => {
      calls.push('dispatch');
      attempt += 1;
      if (attempt === 1) throw new ApiError(404, 'Session not found');
      return 'sent';
    };
    const revive = async (): Promise<void> => {
      calls.push('revive');
    };

    await expect(dispatchWithRevive(dispatch, revive)).resolves.toBe('sent');
    expect(calls).toEqual(['dispatch', 'revive', 'dispatch']);
  });

  it('非 404 错误直接上抛（不白跑一次 revive）', async () => {
    let revived = 0;
    const dispatch = async (): Promise<string> => {
      throw new ApiError(500, 'internal error');
    };
    const revive = async (): Promise<void> => {
      revived += 1;
    };

    await expect(dispatchWithRevive(dispatch, revive)).rejects.toThrow('internal error');
    expect(revived).toBe(0);
  });

  it('重发仍 404 就上抛（会话文件确实不在了）', async () => {
    let attempts = 0;
    const dispatch = async (): Promise<string> => {
      attempts += 1;
      throw new ApiError(404, 'Session not found');
    };
    let revived = 0;
    const revive = async (): Promise<void> => {
      revived += 1;
    };

    await expect(dispatchWithRevive(dispatch, revive)).rejects.toThrow('Session not found');
    expect(attempts).toBe(2);
    expect(revived).toBe(1);
  });
});
