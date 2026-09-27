import { describe, expect, it } from 'vitest';
import {
  CHAT_CONTENT_EDGE_BUDGET,
  CHAT_CONTENT_WIDTH_DEFAULT,
  CHAT_CONTENT_WIDTH_MIN,
  clampChatContentWidth,
  resolveChatContentWidth,
} from '../src/view-models/chat-appearance';

describe('对话外观：内容宽度', () => {
  it('clamp：下限/上限/非数字', () => {
    expect(clampChatContentWidth(100)).toBe(CHAT_CONTENT_WIDTH_MIN);
    expect(clampChatContentWidth(99999)).toBe(2000);
    expect(clampChatContentWidth('abc')).toBe(CHAT_CONTENT_WIDTH_DEFAULT);
    expect(clampChatContentWidth(null)).toBe(CHAT_CONTENT_WIDTH_DEFAULT);
    expect(clampChatContentWidth(CHAT_CONTENT_WIDTH_DEFAULT)).toBe(CHAT_CONTENT_WIDTH_DEFAULT);
    expect(clampChatContentWidth(901.6)).toBe(902);
  });

  it('resolve：列宽够时用偏好值', () => {
    expect(resolveChatContentWidth(900, 1200)).toBe(900);
    expect(resolveChatContentWidth(900, 0)).toBe(900);
  });

  it('resolve：按「列宽 - 边距预算」夹取，给把手留位', () => {
    expect(resolveChatContentWidth(1200, 1000)).toBe(1000 - CHAT_CONTENT_EDGE_BUDGET);
    expect(resolveChatContentWidth(1200, 1000)).toBeLessThan(1200);
  });

  it('resolve：列宽过窄时不低于下限', () => {
    expect(resolveChatContentWidth(900, 400)).toBe(CHAT_CONTENT_WIDTH_MIN);
  });
});
